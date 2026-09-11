import { openDB, IDBPDatabase } from 'idb';
import {
  MotorcycleRegistration,
  OfficerAssignment,
  PrintBatchOrder,
  VerificationLog,
  UnregisteredVehicleReport,
  PaymentReceipt,
  SystemSettings,
  SystemUser,
  SystemAuditLog,
} from '../types';
import { stripImagesFromRegistration } from '../services/dbService';

const DB_NAME = 'permit_offline_store_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase | null> | null = null;

/**
 * Initializes and caches the IndexedDB connection.
 * If IndexedDB is unavailable (e.g., privacy mode or restricted environments),
 * safely returns null and allows falling back.
 */
export function getIndexedDb(): Promise<IDBPDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Registrations store with fast query indices
        if (!db.objectStoreNames.contains('registrations')) {
          const regStore = db.createObjectStore('registrations', { keyPath: 'id' });
          regStore.createIndex('by-plate', 'plateNumber');
          regStore.createIndex('by-status', 'status');
          regStore.createIndex('by-date', 'registrationDate');
        }

        // Generic Key-Value store for settings and supplementary collections
        if (!db.objectStoreNames.contains('keyval')) {
          db.createObjectStore('keyval');
        }
      },
    }).catch((err) => {
      console.warn('IndexedDB initialization failed, falling back:', err);
      return null;
    });
  }

  return dbPromise;
}

// Write debounce timers to prevent disk thrashing
let saveRegTimer: any = null;
const saveKeyValTimers = new Map<string, any>();

/**
 * Persists all registrations asynchronously to IndexedDB in a single transaction.
 * Completely non-blocking — does not freeze the UI thread.
 */
export async function asyncSaveRegistrations(registrations: MotorcycleRegistration[]): Promise<void> {
  if (saveRegTimer) clearTimeout(saveRegTimer);

  return new Promise((resolve) => {
    saveRegTimer = setTimeout(async () => {
      try {
        const db = await getIndexedDb();
        if (!db) return resolve();

        const tx = db.transaction('registrations', 'readwrite');
        const store = tx.objectStore('registrations');

        await store.clear();
        for (const reg of registrations) {
          if (reg && reg.id) {
            await store.put(stripImagesFromRegistration(reg));
          }
        }
        await tx.done;
      } catch (err) {
        console.warn('Async IndexedDB registrations save warning:', err);
      } finally {
        resolve();
      }
    }, 80);
  });
}

/**
 * Saves or updates a single registration directly to IndexedDB.
 */
export async function asyncUpsertSingleRegistration(reg: MotorcycleRegistration): Promise<void> {
  try {
    const db = await getIndexedDb();
    if (!db || !reg?.id) return;
    await db.put('registrations', stripImagesFromRegistration(reg));
  } catch (err) {
    console.warn('Async IndexedDB upsert warning:', err);
  }
}

/**
 * Deletes a registration from IndexedDB.
 */
export async function asyncDeleteRegistration(id: string): Promise<void> {
  try {
    const db = await getIndexedDb();
    if (!db || !id) return;
    await db.delete('registrations', id);
  } catch (err) {
    console.warn('Async IndexedDB delete warning:', err);
  }
}

/**
 * Loads all registrations directly from IndexedDB.
 */
export async function asyncLoadRegistrations(): Promise<MotorcycleRegistration[]> {
  try {
    const db = await getIndexedDb();
    if (!db) return [];
    return await db.getAll('registrations');
  } catch (err) {
    console.warn('Async IndexedDB load registrations failed:', err);
    return [];
  }
}

/**
 * Saves a key-value pair asynchronously to the keyval store.
 */
export async function asyncSaveKeyVal<T>(key: string, value: T): Promise<void> {
  if (saveKeyValTimers.has(key)) {
    clearTimeout(saveKeyValTimers.get(key));
  }

  return new Promise((resolve) => {
    const timer = setTimeout(async () => {
      try {
        const db = await getIndexedDb();
        if (db) {
          await db.put('keyval', value, key);
        }
      } catch (err) {
        console.warn(`Async IndexedDB keyval save warning for ${key}:`, err);
      } finally {
        saveKeyValTimers.delete(key);
        resolve();
      }
    }, 60);
    saveKeyValTimers.set(key, timer);
  });
}

/**
 * Loads a value by key from the keyval store.
 */
export async function asyncLoadKeyVal<T>(key: string): Promise<T | null> {
  try {
    const db = await getIndexedDb();
    if (!db) return null;
    const res = await db.get('keyval', key);
    return (res as T) ?? null;
  } catch (err) {
    console.warn(`Async IndexedDB keyval load failed for ${key}:`, err);
    return null;
  }
}

/**
 * Migrates existing data from LocalStorage to IndexedDB on first run.
 * Ensures zero data loss for existing users.
 */
export async function migrateLocalStorageToIndexedDb(): Promise<{
  registrations?: MotorcycleRegistration[];
  officers?: OfficerAssignment[];
  printOrders?: PrintBatchOrder[];
  verifications?: VerificationLog[];
  unregisteredReports?: UnregisteredVehicleReport[];
  paymentReceipts?: PaymentReceipt[];
  users?: SystemUser[];
  auditLogs?: SystemAuditLog[];
  settings?: SystemSettings;
} | null> {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem('bd_motor_app_state_cache');
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const db = await getIndexedDb();
    if (!db) return parsed;

    // Check if IndexedDB already has records
    const existingCount = await db.count('registrations');
    if (existingCount === 0 && Array.isArray(parsed.registrations) && parsed.registrations.length > 0) {
      // Migrate registrations into IndexedDB
      const tx = db.transaction('registrations', 'readwrite');
      for (const reg of parsed.registrations) {
        if (reg?.id) await tx.objectStore('registrations').put(reg);
      }
      await tx.done;
    }

    // Migrate secondary stores
    if (parsed.officers) await asyncSaveKeyVal('officers', parsed.officers);
    if (parsed.printOrders) await asyncSaveKeyVal('printOrders', parsed.printOrders);
    if (parsed.verifications) await asyncSaveKeyVal('verifications', parsed.verifications);
    if (parsed.unregisteredReports) await asyncSaveKeyVal('unregisteredReports', parsed.unregisteredReports);
    if (parsed.paymentReceipts) await asyncSaveKeyVal('paymentReceipts', parsed.paymentReceipts);
    if (parsed.users) await asyncSaveKeyVal('users', parsed.users);
    if (parsed.auditLogs) await asyncSaveKeyVal('auditLogs', parsed.auditLogs);
    if (parsed.settings) await asyncSaveKeyVal('settings', parsed.settings);

    return parsed;
  } catch (err) {
    console.warn('Migration to IndexedDB notice:', err);
    return null;
  }
}
