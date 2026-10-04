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
  TermStatus,
} from '../types';
import { mapSettingsFromDb } from '../db/schema';
import { uploadDocumentPhoto } from './storageService';
import { trackGlobalAction } from './actionTracker';
import { getCurrentUser } from './authService';
import {
  KEYS,
  getStoredLastAckResetEpoch,
  saveStoredLastAckResetEpoch,
  clearAllLocalStoredData,
  sanitizeTextOnlyStorage,
  getStoredActivePage,
} from '../utils/storage';
import {
  asyncSaveRegistrations,
  asyncUpsertSingleRegistration,
  asyncDeleteRegistration,
  asyncLoadRegistrations,
  asyncSaveKeyVal,
  asyncLoadKeyVal,
  migrateLocalStorageToIndexedDb,
  getIndexedDb,
  scrubIndexedDbMedia,
} from '../utils/indexedDbStorage';
import { generateThumbnailBase64 } from '../utils/imageCompressor';

// Global Database Connection State
let lastSyncTime: Date | null = null;
let isCloudConnected: boolean = true;
let globalDbError: string | null = null;

const errorListeners = new Set<(err: string | null) => void>();
const syncStatusListeners = new Set<
  (status: { lastSyncTime: Date | null; isConnected: boolean; isQuotaExceeded: boolean }) => void
>();

export function subscribeSyncStatus(
  cb: (status: { lastSyncTime: Date | null; isConnected: boolean; isQuotaExceeded: boolean }) => void
): () => void {
  cb({ lastSyncTime, isConnected: isCloudConnected, isQuotaExceeded: false });
  syncStatusListeners.add(cb);
  return () => {
    syncStatusListeners.delete(cb);
  };
}

function notifySyncStatus() {
  const data = { lastSyncTime, isConnected: isCloudConnected, isQuotaExceeded: false };
  syncStatusListeners.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {}
  });
}

export function subscribeFirestoreError(callback: (err: string | null) => void): () => void {
  callback(globalDbError);
  errorListeners.add(callback);
  return () => {
    errorListeners.delete(callback);
  };
}

export const subscribeDbError = subscribeFirestoreError;

/**
 * Format and sanitize error messages for the UI
 */
export function formatFriendlyDbError(rawError: string | null): string | null {
  if (!rawError) return null;
  const str = String(rawError);

  if (
    str.includes('FUNCTION_INVOCATION_FAILED') ||
    str.includes('cpt1::') ||
    str.includes('500 Internal') ||
    str.includes('Server returned HTML') ||
    str.includes('Failed to fetch')
  ) {
    return null; // Suppress connection timeout warnings as local storage handles sync seamlessly
  }
  if (str.includes('the client is offline') || str.includes('network-request-failed')) {
    return 'Offline mode: Changes are saved locally and will synchronize with PostgreSQL once reconnected.';
  }
  return str;
}

export function setGlobalDbError(err: string | null) {
  const sanitized = formatFriendlyDbError(err);
  globalDbError = sanitized;
  isCloudConnected = sanitized === null;
  
  const data = { 
    lastSyncTime, 
    isConnected: isCloudConnected, 
    isQuotaExceeded: false 
  };
  
  syncStatusListeners.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {}
  });

  errorListeners.forEach((cb) => {
    try {
      cb(globalDbError);
    } catch (e) {}
  });
}

export const setGlobalFirestoreError = setGlobalDbError;

// Initial default settings
export const DEFAULT_SETTINGS: SystemSettings = {
  officerName: 'አበበ ደስታ',
  department: 'የትራፊክ ማኔጅመንትና ህግ ማስከበሪያ',
  subCityOffice: 'ቀበሌ 04 ቅርንጫፍ',
  defaultPrinter: 'Epson L805 Series (PVC Card)',
  cardStockType: 'CR80_PVC',
  calendarSystem: 'ethiopian',
  autoPrintQR: true,
  emailAlerts: true,
  security2FA: true,
  highRiskAlerts: true,
  themeMode: 'light',
  scannerResultTheme: 'warm_ivory_cream',
  showClerkPermitStatus: false,
  showClerkSubmissionsAction: false,
  showClerkApprovedVehiclesAction: false,
  showClerkNewRegistrationAction: true,
  showClerkEditSubmissionAction: true,
  showClerkQrScanAction: true,
  showClerkPaymentReceiptsAction: true,
  showClerkPaymentKPIs: false,
  showClerkPaymentRecordsTable: false,
  clerkPaymentKPIPermission: 'allow',
  clerkPaymentTablePermission: 'allow',
  registrationFreeze: false,
  maintenanceMode: false,
  frozenSubCities: {},
  systemResetEpoch: 0,
  lastSystemResetAt: new Date().toISOString(),
};

// In-Memory Live State (synchronized directly with PostgreSQL backend)
interface InMemoryState {
  registrations: MotorcycleRegistration[];
  officers: OfficerAssignment[];
  printOrders: PrintBatchOrder[];
  verifications: VerificationLog[];
  unregisteredReports: UnregisteredVehicleReport[];
  paymentReceipts: PaymentReceipt[];
  settings: SystemSettings;
  users: SystemUser[];
  auditLogs: SystemAuditLog[];
}

// Local storage key for fallback & instant boot
const STATE_CACHE_KEY = 'bma_system_state_v3';

function getInitialBootState(): InMemoryState {
  const defaultState: InMemoryState = {
    registrations: [],
    officers: [],
    printOrders: [],
    verifications: [],
    unregisteredReports: [],
    paymentReceipts: [],
    settings: { ...DEFAULT_SETTINGS },
    users: [],
    auditLogs: [],
  };

  if (typeof window === 'undefined') return defaultState;

  // Only hydrate local cache at module boot if the device is currently offline
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (!isOffline) {
    return defaultState;
  }

  try {
    const raw = localStorage.getItem(STATE_CACHE_KEY);
    if (!raw) return defaultState;
    const parsed = sanitizeTextOnlyStorage(JSON.parse(raw));
    if (!parsed || typeof parsed !== 'object') return defaultState;

    return {
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
      officers: Array.isArray(parsed.officers) ? parsed.officers : [],
      printOrders: Array.isArray(parsed.printOrders) ? parsed.printOrders : [],
      verifications: Array.isArray(parsed.verifications) ? parsed.verifications : [],
      unregisteredReports: Array.isArray(parsed.unregisteredReports) ? parsed.unregisteredReports : [],
      paymentReceipts: Array.isArray(parsed.paymentReceipts) ? parsed.paymentReceipts : [],
      settings: parsed.settings ? mapSettingsFromDb(parsed.settings, DEFAULT_SETTINGS) : { ...DEFAULT_SETTINGS },
      users: Array.isArray(parsed.users) ? parsed.users : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch (e) {
    return defaultState;
  }
}

/**
 * System-wide cleanup: Scans and purges any locally cached photo binaries,
 * base64 image strings, and document scans from localStorage and IndexedDB.
 * Guarantees zero photo consumption in local browser storage.
 */
export function scrubSystemWideLocalCache(): void {
  if (typeof window === 'undefined') return;

  try {
    // 1. Scan and scrub localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      if (raw.includes('data:image/') || raw.includes('data:application/') || raw.length > 20000) {
        try {
          const parsed = JSON.parse(raw);
          const sanitized = sanitizeTextOnlyStorage(parsed);
          localStorage.setItem(key, JSON.stringify(sanitized));
        } catch {
          if (raw.startsWith('data:image/')) {
            localStorage.removeItem(key);
          }
        }
      }
    }

    // 2. Scrub IndexedDB stores asynchronously
    scrubIndexedDbMedia().catch(() => {});
  } catch (err) {
    console.warn('[Storage] Notice during system-wide local cache scrub:', err);
  }
}

const inMemory: InMemoryState = getInitialBootState();

export function getInMemoryState(): InMemoryState {
  return inMemory;
}

// Listeners registry for reactive UI updates
const listeners = {
  registrations: new Set<(data: MotorcycleRegistration[]) => void>(),
  officers: new Set<(data: OfficerAssignment[]) => void>(),
  printOrders: new Set<(data: PrintBatchOrder[]) => void>(),
  verifications: new Set<(data: VerificationLog[]) => void>(),
  unregisteredReports: new Set<(data: UnregisteredVehicleReport[]) => void>(),
  paymentReceipts: new Set<(data: PaymentReceipt[]) => void>(),
  settings: new Set<(data: SystemSettings) => void>(),
  users: new Set<(data: SystemUser[]) => void>(),
  kpis: new Set<(data: PreAggregatedKPIData) => void>(),
  monthlyFeeStats: new Set<(data: ServerMonthlyFeeStatistics) => void>(),
  auditLogs: new Set<(data: SystemAuditLog[]) => void>(),
};

function stripImagesFromVerificationLog(v: VerificationLog): VerificationLog {
  return {
    ...v,
    userPortraitPhoto: '',
    nationalIdPhoto: '',
    nationalIdBackPhoto: '',
    drivingLicensePhoto: '',
    drivingPermitPhoto: '',
  };
}

function stripImagesFromUnregisteredReport(r: UnregisteredVehicleReport): UnregisteredVehicleReport {
  return {
    ...r,
    evidencePhoto: undefined,
  };
}

function stripImagesFromPaymentReceipt(p: PaymentReceipt): PaymentReceipt {
  return {
    ...p,
    receiptScreenshot: undefined,
  };
}

/**
 * Optimizes registrations for local fast-paint storage by stripping all image/photo binaries.
 * Only text attributes are cached locally in IndexedDB and LocalStorage.
 */
export function optimizeRegistrationForStorage(reg: MotorcycleRegistration): MotorcycleRegistration {
  return {
    ...reg,
    userPortraitPhoto: '',
    userPortraitThumbnail: undefined,
    ownerPhoto: '',
    nationalIdPhoto: '',
    nationalIdBackPhoto: '',
    drivingLicensePhoto: '',
    drivingPermitPhoto: '',
    receiptScreenshot: '',
  };
}

let saveStateDebounceTimer: any = null;

let isHydrating = false;

/**
 * Save current state to IndexedDB (as primary large data store) and localStorage (as cache)
 * Only text fields are cached locally; photos and document scans are kept on DB/S3 server.
 * Non-blocking, debounced execution prevents UI thread stutter during rapid state updates.
 */
export function saveStateToLocalStorage(immediate = false) {
  if (typeof window === 'undefined' || isHydrating) return;

  if (saveStateDebounceTimer) {
    clearTimeout(saveStateDebounceTimer);
    saveStateDebounceTimer = null;
  }

  const executeSave = () => {
    if (isHydrating) return;
    try {
      const textOnlyRegistrations = inMemory.registrations.map(optimizeRegistrationForStorage);
      const textOnlyVerifications = inMemory.verifications.map(stripImagesFromVerificationLog);
      const textOnlyReports = inMemory.unregisteredReports.map(stripImagesFromUnregisteredReport);
      const textOnlyReceipts = inMemory.paymentReceipts.map(stripImagesFromPaymentReceipt);

      // 1. Asynchronous full persistence to IndexedDB (off main thread)
      asyncSaveRegistrations(textOnlyRegistrations);
      asyncSaveKeyVal('officers', inMemory.officers);
      asyncSaveKeyVal('printOrders', inMemory.printOrders);
      asyncSaveKeyVal('verifications', textOnlyVerifications);
      asyncSaveKeyVal('unregisteredReports', textOnlyReports);
      asyncSaveKeyVal('paymentReceipts', textOnlyReceipts);
      asyncSaveKeyVal('settings', inMemory.settings);
      asyncSaveKeyVal('users', inMemory.users);
      asyncSaveKeyVal('auditLogs', inMemory.auditLogs);

      // 2. Ultra-lightweight LocalStorage cache for instant first paint
      const payload = {
        registrations: textOnlyRegistrations.slice(0, 50),
        officers: inMemory.officers,
        printOrders: inMemory.printOrders,
        verifications: textOnlyVerifications.slice(0, 50),
        unregisteredReports: textOnlyReports.slice(0, 50),
        paymentReceipts: textOnlyReceipts.slice(0, 50),
        settings: inMemory.settings,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STATE_CACHE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Background cache save notice:', err);
    }
  };

  if (immediate) {
    executeSave();
  } else {
    if ('requestIdleCallback' in window) {
      saveStateDebounceTimer = setTimeout(() => {
        (window as any).requestIdleCallback(executeSave, { timeout: 2000 });
      }, 600);
    } else {
      saveStateDebounceTimer = setTimeout(executeSave, 600);
    }
  }
}

function applySystemReset(resetEpoch: number, resetTimestamp?: string) {
  inMemory.registrations = [];
  inMemory.officers = [];
  inMemory.printOrders = [];
  inMemory.verifications = [];
  inMemory.unregisteredReports = [];
  inMemory.paymentReceipts = [];
  inMemory.auditLogs = [];
  inMemory.settings = {
    ...DEFAULT_SETTINGS,
    systemResetEpoch: resetEpoch,
    lastSystemResetAt: resetTimestamp || new Date().toISOString(),
  };

  saveStoredLastAckResetEpoch(resetEpoch);
  clearAllLocalStoredData();
  saveStateToLocalStorage();

  notifyRegistrations();
  notifyOfficers();
  notifyPrintOrders();
  notifyVerifications();
  notifyUnregisteredReports();
  notifyPaymentReceipts();
  notifyAuditLogs();
  notifySettings();
}

function checkAndApplySystemResetIfNewer(incomingSettings?: Partial<SystemSettings> | null): boolean {
  if (!incomingSettings) return false;
  const incomingEpoch = Number(incomingSettings.systemResetEpoch) || 0;
  if (!incomingEpoch) return false;

  const localAckEpoch = getStoredLastAckResetEpoch();
  const currentMemoryEpoch = Number(inMemory.settings.systemResetEpoch) || 0;

  if (incomingEpoch > localAckEpoch || incomingEpoch > currentMemoryEpoch) {
    applySystemReset(incomingEpoch, incomingSettings.lastSystemResetAt);
    return true;
  }
  return false;
}

let isHydratingFromIdb = false;

/**
 * Hydrates state from IndexedDB asynchronously
 */
export async function hydrateFromIndexedDb(): Promise<boolean> {
  if (typeof window === 'undefined' || isHydratingFromIdb) return false;
  isHydratingFromIdb = true;
  isHydrating = true;

  try {
    await migrateLocalStorageToIndexedDb();

    const [
      idbRegs,
      idbOfficers,
      idbPrintOrders,
      idbVerifications,
      idbUnregistered,
      idbReceipts,
      idbSettings,
      idbUsers,
      idbAuditLogs,
    ] = await Promise.all([
      asyncLoadRegistrations(),
      asyncLoadKeyVal<OfficerAssignment[]>('officers'),
      asyncLoadKeyVal<PrintBatchOrder[]>('printOrders'),
      asyncLoadKeyVal<VerificationLog[]>('verifications'),
      asyncLoadKeyVal<UnregisteredVehicleReport[]>('unregisteredReports'),
      asyncLoadKeyVal<PaymentReceipt[]>('paymentReceipts'),
      asyncLoadKeyVal<SystemSettings>('settings'),
      asyncLoadKeyVal<SystemUser[]>('users'),
      asyncLoadKeyVal<SystemAuditLog[]>('auditLogs'),
    ]);

    if (idbSettings) {
      const wasReset = checkAndApplySystemResetIfNewer(idbSettings);
      if (wasReset) {
        return true;
      }
    }

    let hasUpdates = false;

    if (Array.isArray(idbRegs) && idbRegs.length > 0) {
      inMemory.registrations = mergeRegistrationsPreservingPhotos(idbRegs, inMemory.registrations);
      notifyRegistrations();
      hasUpdates = true;
    }

    if (Array.isArray(idbOfficers) && idbOfficers.length > 0) {
      inMemory.officers = mergeById(idbOfficers, inMemory.officers);
      notifyOfficers();
      hasUpdates = true;
    }

    if (Array.isArray(idbPrintOrders) && idbPrintOrders.length > 0) {
      inMemory.printOrders = mergeById(idbPrintOrders, inMemory.printOrders);
      notifyPrintOrders();
      hasUpdates = true;
    }

    if (Array.isArray(idbVerifications) && idbVerifications.length > 0) {
      inMemory.verifications = mergeById(idbVerifications, inMemory.verifications);
      notifyVerifications();
      hasUpdates = true;
    }

    if (Array.isArray(idbUnregistered) && idbUnregistered.length > 0) {
      inMemory.unregisteredReports = mergeById(idbUnregistered, inMemory.unregisteredReports);
      notifyUnregisteredReports();
      hasUpdates = true;
    }

    if (Array.isArray(idbReceipts) && idbReceipts.length > 0) {
      inMemory.paymentReceipts = mergeById(idbReceipts, inMemory.paymentReceipts);
      notifyPaymentReceipts();
      hasUpdates = true;
    }

    if (idbSettings) {
      inMemory.settings = mapSettingsFromDb(idbSettings, DEFAULT_SETTINGS);
      notifySettings();
      hasUpdates = true;
    }

    if (Array.isArray(idbUsers) && idbUsers.length > 0) {
      inMemory.users = mergeById(idbUsers, inMemory.users);
      notifyUsers();
      hasUpdates = true;
    }

    if (Array.isArray(idbAuditLogs) && idbAuditLogs.length > 0) {
      inMemory.auditLogs = mergeById(idbAuditLogs, inMemory.auditLogs);
      notifyAuditLogs();
      hasUpdates = true;
    }

    return hasUpdates;
  } catch (err) {
    console.warn('[Storage] Notice hydrating from IndexedDB:', err);
    return false;
  } finally {
    isHydrating = false;
    isHydratingFromIdb = false;
  }
}

/**
 * Fast synchronous boot loader from localStorage
 */
export function loadStateFromLocalStorage(): boolean {
  if (typeof window === 'undefined') return false;
  isHydrating = true;

  try {
    const raw = localStorage.getItem(STATE_CACHE_KEY);
    if (!raw) return false;

    const parsed = sanitizeTextOnlyStorage(JSON.parse(raw));
    if (!parsed || typeof parsed !== 'object') return false;

    let loaded = false;

    if (parsed.settings) {
      const wasReset = checkAndApplySystemResetIfNewer(parsed.settings);
      if (wasReset) return true;
    }

    if (Array.isArray(parsed.registrations) && parsed.registrations.length > 0) {
      if (inMemory.registrations.length === 0) {
        inMemory.registrations = parsed.registrations;
        notifyRegistrations();
        loaded = true;
      }
    }

    if (Array.isArray(parsed.officers) && parsed.officers.length > 0) {
      if (inMemory.officers.length === 0) {
        inMemory.officers = parsed.officers;
        notifyOfficers();
        loaded = true;
      }
    }

    if (Array.isArray(parsed.printOrders) && parsed.printOrders.length > 0) {
      if (inMemory.printOrders.length === 0) {
        inMemory.printOrders = parsed.printOrders;
        notifyPrintOrders();
        loaded = true;
      }
    }

    if (Array.isArray(parsed.verifications) && parsed.verifications.length > 0) {
      if (inMemory.verifications.length === 0) {
        inMemory.verifications = parsed.verifications;
        notifyVerifications();
        loaded = true;
      }
    }

    if (Array.isArray(parsed.unregisteredReports) && parsed.unregisteredReports.length > 0) {
      if (inMemory.unregisteredReports.length === 0) {
        inMemory.unregisteredReports = parsed.unregisteredReports;
        notifyUnregisteredReports();
        loaded = true;
      }
    }

    if (Array.isArray(parsed.paymentReceipts) && parsed.paymentReceipts.length > 0) {
      if (inMemory.paymentReceipts.length === 0) {
        inMemory.paymentReceipts = parsed.paymentReceipts;
        notifyPaymentReceipts();
        loaded = true;
      }
    }

    if (parsed.settings) {
      const localAckEpoch = getStoredLastAckResetEpoch();
      const settingsEpoch = Number(parsed.settings.systemResetEpoch) || 0;
      if (settingsEpoch > localAckEpoch) {
        saveStoredLastAckResetEpoch(settingsEpoch);
      }
      inMemory.settings = mapSettingsFromDb(parsed.settings, DEFAULT_SETTINGS);
      notifySettings();
      loaded = true;
    }

    return loaded;
  } catch (e) {
    return false;
  } finally {
    isHydrating = false;
  }
}

// Helper to merge lists by ID without losing rich in-memory fields
function mergeById<T extends { id?: string; badgeId?: string; uid?: string }>(
  remoteItems: T[],
  localItems: T[]
): T[] {
  const map = new Map<string, T>();
  for (const item of localItems) {
    const key = item.id || item.badgeId || item.uid;
    if (key) map.set(key, item);
  }
  for (const item of remoteItems) {
    const key = item.id || item.badgeId || item.uid;
    if (key) {
      const existing = map.get(key);
      map.set(key, existing ? { ...existing, ...item } : item);
    }
  }
  return Array.from(map.values());
}

function mergeRegistrationsPreservingPhotos(
  remoteRegs: MotorcycleRegistration[],
  localRegs: MotorcycleRegistration[]
): MotorcycleRegistration[] {
  const localMap = new Map<string, MotorcycleRegistration>();
  for (const r of localRegs) {
    if (r.id) localMap.set(r.id, r);
  }

  const mergedMap = new Map<string, MotorcycleRegistration>();

  for (const remote of remoteRegs) {
    if (!remote.id) continue;
    const local = localMap.get(remote.id);
    if (!local) {
      mergedMap.set(remote.id, remote);
      continue;
    }

    const merged: MotorcycleRegistration = {
      ...local,
      ...remote,
      userPortraitPhoto:
        (remote.userPortraitPhoto && remote.userPortraitPhoto.length > 50
          ? remote.userPortraitPhoto
          : local.userPortraitPhoto) || '',
      userPortraitThumbnail:
        remote.userPortraitThumbnail || local.userPortraitThumbnail || undefined,
      nationalIdPhoto:
        (remote.nationalIdPhoto && remote.nationalIdPhoto.length > 50
          ? remote.nationalIdPhoto
          : local.nationalIdPhoto) || '',
      nationalIdBackPhoto:
        (remote.nationalIdBackPhoto && remote.nationalIdBackPhoto.length > 50
          ? remote.nationalIdBackPhoto
          : local.nationalIdBackPhoto) || '',
      drivingLicensePhoto:
        (remote.drivingLicensePhoto && remote.drivingLicensePhoto.length > 50
          ? remote.drivingLicensePhoto
          : local.drivingLicensePhoto) || '',
      drivingPermitPhoto:
        (remote.drivingPermitPhoto && remote.drivingPermitPhoto.length > 50
          ? remote.drivingPermitPhoto
          : local.drivingPermitPhoto) || '',
      receiptScreenshot:
        (remote.receiptScreenshot && remote.receiptScreenshot.length > 50
          ? remote.receiptScreenshot
          : local.receiptScreenshot) || '',
    };

    mergedMap.set(remote.id, merged);
  }

  for (const local of localRegs) {
    if (local.id && !mergedMap.has(local.id)) {
      mergedMap.set(local.id, local);
    }
  }

  return Array.from(mergedMap.values());
}

// Notification triggers
function notifyRegistrations() {
  const data = [...inMemory.registrations];
  listeners.registrations.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in registrations listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifyOfficers() {
  const data = [...inMemory.officers];
  listeners.officers.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in officers listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifyPrintOrders() {
  const data = [...inMemory.printOrders];
  listeners.printOrders.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in printOrders listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifyVerifications() {
  const data = [...inMemory.verifications];
  listeners.verifications.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in verifications listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifyUnregisteredReports() {
  const data = [...inMemory.unregisteredReports];
  listeners.unregisteredReports.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in unregisteredReports listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifyPaymentReceipts() {
  const data = [...inMemory.paymentReceipts];
  listeners.paymentReceipts.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in paymentReceipts listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifySettings() {
  const data = { ...inMemory.settings };
  listeners.settings.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in settings listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifyUsers() {
  const data = [...inMemory.users];
  listeners.users.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in users listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

function notifyAuditLogs() {
  const data = [...inMemory.auditLogs];
  listeners.auditLogs.forEach((cb) => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error in auditLogs listener callback:', e);
    }
  });
  saveStateToLocalStorage();
}

/**
 * Safe JSON fetch utility with timeout and offline protection
 */
async function safeJsonFetch<T = any>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 8000
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  let userRole = '';
  let userBadge = '';
  let userSubCity = '';
  try {
    const user = getCurrentUser();
    if (user) {
      userRole = user.role || '';
      userBadge = user.badgeId || '';
      userSubCity = user.subCity || '';
    }
  } catch {}

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(userRole ? { 'X-User-Role': userRole } : {}),
        ...(userBadge ? { 'X-User-Badge': userBadge } : {}),
        ...(userSubCity ? { 'X-User-Subcity': userSubCity } : {}),
        ...(options?.headers || {}),
      },
    });
  } catch (netErr: any) {
    clearTimeout(id);
    if (netErr.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw netErr;
  } finally {
    clearTimeout(id);
  }

  const contentType = res.headers.get('content-type') || '';
  let body: any = {};

  if (contentType.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = { error: 'Invalid JSON response from server' };
    }
  } else {
    const text = await res.text().catch(() => '');
    if (text.includes('FUNCTION_INVOCATION_FAILED') || text.includes('cpt1::')) {
      body = { error: 'FUNCTION_INVOCATION_FAILED' };
    } else if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      body = { error: `Server returned HTML page (${res.status} ${res.statusText})` };
    } else {
      body = { error: text || `HTTP ${res.status} ${res.statusText}` };
    }
  }

  if (!res.ok) {
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return body;
}

// --- REAL-TIME LIVE SYNC (SSE + CROSS-TAB BROADCAST + POLLING) ---
let areLiveListenersActive = false;
let crossTabChannel: BroadcastChannel | null = null;
let realtimeEventSource: EventSource | null = null;

export function broadcastCrossTabSync(collection: string, action: string, id?: string, data?: any) {
  try {
    if (crossTabChannel) {
      crossTabChannel.postMessage({ collection, action, id, data, timestamp: Date.now() });
    }
  } catch (e) {}
}

export function initLiveDbListeners(): () => void {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  // If initially offline, hydrate from offline cache immediately
  if (isOffline) {
    loadStateFromLocalStorage();
    hydrateFromIndexedDb().catch(() => {});
  }

  // Automatic online/offline transition listeners
  if (typeof window !== 'undefined' && !areLiveListenersActive) {
    window.addEventListener('online', () => {
      isCloudConnected = true;
      notifySyncStatus();
      syncCriticalStartup().catch(() => {});
    });

    window.addEventListener('offline', () => {
      isCloudConnected = false;
      notifySyncStatus();
      loadStateFromLocalStorage();
      hydrateFromIndexedDb().catch(() => {});
    });
  }

  if (typeof window === 'undefined' || areLiveListenersActive) {
    return () => {};
  }
  areLiveListenersActive = true;

  // 3. Cross-Tab Broadcast Channel
  try {
    if ('BroadcastChannel' in window) {
      crossTabChannel = new BroadcastChannel('bma_permit_cross_tab_sync');
      crossTabChannel.onmessage = (event) => {
        const msg = event.data;
        if (!msg || !msg.collection) return;

        if (msg.collection === 'motorcycle_registrations') {
          syncRegistrations(true).catch(() => {});
        } else if (msg.collection === 'officer_assignments') {
          syncOfficers(true).catch(() => {});
        } else if (msg.collection === 'print_batch_orders') {
          syncPrintOrders(true).catch(() => {});
        } else if (msg.collection === 'unregistered_vehicle_reports') {
          syncUnregisteredReports(true).catch(() => {});
        } else if (msg.collection === 'verification_logs') {
          syncVerifications(true).catch(() => {});
        } else if (msg.collection === 'payment_receipts') {
          syncPaymentReceipts(true).catch(() => {});
        } else if (msg.collection === 'system_settings') {
          syncSettings(true).catch(() => {});
        } else if (msg.collection === 'system_reset') {
          if (msg.data?.systemResetEpoch) {
            checkAndApplySystemResetIfNewer(msg.data);
          }
        }
      };
    }
  } catch (e) {}

  // 4. Connect to Server-Sent Events (SSE) for instant cross-device updates
  const connectSSE = () => {
    try {
      if (typeof EventSource !== 'undefined' && !realtimeEventSource) {
        let sseUrl = '/api/realtime/events';
        try {
          const user = getCurrentUser();
          if (user) {
            const params = new URLSearchParams();
            if (user.role) params.set('role', user.role);
            if (user.badgeId) params.set('badgeId', user.badgeId);
            if (user.subCity) params.set('subCity', user.subCity);
            const qs = params.toString();
            if (qs) sseUrl = `${sseUrl}?${qs}`;
          }
        } catch {}

        realtimeEventSource = new EventSource(sseUrl);
        
        const handlePayload = (raw: string) => {
          try {
            const payload = JSON.parse(raw);
            if (!payload || !payload.collection) return;

            const { collection, action, docId, data } = payload;

            if (collection === 'motorcycle_registrations') {
              if (action === 'upsert' && data && (data.id || docId)) {
                const targetId = data.id || docId;
                const idx = inMemory.registrations.findIndex((r) => r.id === targetId);
                if (idx >= 0) {
                  inMemory.registrations[idx] = { ...inMemory.registrations[idx], ...data };
                } else {
                  inMemory.registrations.unshift(data);
                }
                notifyRegistrations();
              } else if (action === 'delete' && docId) {
                inMemory.registrations = inMemory.registrations.filter((r) => r.id !== docId);
                notifyRegistrations();
              }
              syncRegistrations(true).catch(() => {});
            } else if (collection === 'payment_receipts') {
              if (action === 'upsert' && data && (data.id || docId)) {
                const targetId = data.id || docId;
                const idx = inMemory.paymentReceipts.findIndex((rc) => rc.id === targetId);
                if (idx >= 0) {
                  inMemory.paymentReceipts[idx] = { ...inMemory.paymentReceipts[idx], ...data };
                } else {
                  inMemory.paymentReceipts.unshift(data);
                }
                notifyPaymentReceipts();
              } else if (action === 'delete' && docId) {
                inMemory.paymentReceipts = inMemory.paymentReceipts.filter((rc) => rc.id !== docId);
                notifyPaymentReceipts();
              }
              syncPaymentReceipts(true).catch(() => {});
            } else if (collection === 'officer_assignments') {
              syncOfficers(true).catch(() => {});
            } else if (collection === 'print_batch_orders') {
              syncPrintOrders(true).catch(() => {});
            } else if (collection === 'unregistered_vehicle_reports') {
              syncUnregisteredReports(true).catch(() => {});
            } else if (collection === 'verification_logs') {
              syncVerifications(true).catch(() => {});
            } else if (collection === 'system_settings') {
              if (data) {
                inMemory.settings = mapSettingsFromDb(data, inMemory.settings);
                notifySettings();
              }
              syncSettings(true).catch(() => {});
            } else if (collection === 'system_reset') {
              if (payload.data?.systemResetEpoch) {
                checkAndApplySystemResetIfNewer(payload.data);
              }
            }
          } catch (err) {}
        };

        realtimeEventSource.addEventListener('database_change', (event: MessageEvent) => {
          handlePayload(event.data);
        });

        realtimeEventSource.onmessage = (event: MessageEvent) => {
          handlePayload(event.data);
        };

        realtimeEventSource.onerror = () => {
          if (realtimeEventSource) {
            realtimeEventSource.close();
            realtimeEventSource = null;
          }
          // Reconnect SSE after brief delay
          setTimeout(() => {
            if (areLiveListenersActive) {
              connectSSE();
            }
          }, 3000);
        };
      }
    } catch (e) {}
  };

  connectSSE();

  // 5. Periodic background synchronization interval (lightweight active-page sync only)
  const syncInterval = setInterval(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const activePage = getStoredActivePage();
    syncActivePageCollection(activePage, false).catch(() => {});
  }, 15000);

  return () => {
    areLiveListenersActive = false;
    clearInterval(syncInterval);
    if (realtimeEventSource) {
      realtimeEventSource.close();
      realtimeEventSource = null;
    }
    if (crossTabChannel) {
      crossTabChannel.close();
      crossTabChannel = null;
    }
  };
}

export const initLiveFirestoreListeners = initLiveDbListeners;

// Auto-start listeners on client boot
if (typeof window !== 'undefined') {
  initLiveDbListeners();
}

// --- MOTORCYCLE REGISTRATIONS ---
export function subscribeRegistrations(
  callback: (registrations: MotorcycleRegistration[]) => void
): () => void {
  callback(inMemory.registrations);
  listeners.registrations.add(callback);
  return () => {
    listeners.registrations.delete(callback);
  };
}

export async function saveRegistrationToDb(
  reg: MotorcycleRegistration,
  _options?: { forceLocalOnly?: boolean; skipImageUpload?: boolean }
): Promise<{ success: boolean; isOfflineFallback?: boolean; error?: string }> {
  return trackGlobalAction(
    async () => {
      // 0. Generate micro thumbnail
      if (reg.userPortraitPhoto && !reg.userPortraitThumbnail) {
        try {
          reg.userPortraitThumbnail = await generateThumbnailBase64(reg.userPortraitPhoto, 120, 0.65);
        } catch {}
      }

      // 1. Update in-memory state and persist to IndexedDB & LocalStorage
      const index = inMemory.registrations.findIndex((r) => r.id === reg.id);
      if (index >= 0) {
        inMemory.registrations[index] = { ...inMemory.registrations[index], ...reg };
      } else {
        inMemory.registrations.unshift(reg);
      }
      notifyRegistrations();
      asyncUpsertSingleRegistration(optimizeRegistrationForStorage(reg));
      saveStateToLocalStorage();
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      // 2. Persist to PostgreSQL backend via Railway API
      try {
        if (!_options?.forceLocalOnly) {
          const optimizedReg = { ...reg };
          const [
            upPortrait,
            upNatIdFront,
            upNatIdBack,
            upLicense,
            upPermit,
            upReceipt,
          ] = await Promise.all([
            optimizedReg.userPortraitPhoto?.startsWith('data:image/')
              ? uploadDocumentPhoto(optimizedReg.userPortraitPhoto, 'permits/portraits')
              : Promise.resolve(optimizedReg.userPortraitPhoto),
            optimizedReg.nationalIdPhoto?.startsWith('data:image/')
              ? uploadDocumentPhoto(optimizedReg.nationalIdPhoto, 'permits/national_ids')
              : Promise.resolve(optimizedReg.nationalIdPhoto),
            optimizedReg.nationalIdBackPhoto?.startsWith('data:image/')
              ? uploadDocumentPhoto(optimizedReg.nationalIdBackPhoto, 'permits/national_ids')
              : Promise.resolve(optimizedReg.nationalIdBackPhoto),
            optimizedReg.drivingLicensePhoto?.startsWith('data:image/')
              ? uploadDocumentPhoto(optimizedReg.drivingLicensePhoto, 'permits/licenses')
              : Promise.resolve(optimizedReg.drivingLicensePhoto),
            optimizedReg.drivingPermitPhoto?.startsWith('data:image/')
              ? uploadDocumentPhoto(optimizedReg.drivingPermitPhoto, 'permits/police_permits')
              : Promise.resolve(optimizedReg.drivingPermitPhoto),
            optimizedReg.receiptScreenshot?.startsWith('data:image/')
              ? uploadDocumentPhoto(optimizedReg.receiptScreenshot, 'permits/receipts')
              : Promise.resolve(optimizedReg.receiptScreenshot),
          ]);

          optimizedReg.userPortraitPhoto = upPortrait;
          optimizedReg.nationalIdPhoto = upNatIdFront;
          optimizedReg.nationalIdBackPhoto = upNatIdBack;
          optimizedReg.drivingLicensePhoto = upLicense;
          optimizedReg.drivingPermitPhoto = upPermit;
          optimizedReg.receiptScreenshot = upReceipt;

          await safeJsonFetch('/api/registrations', {
            method: 'POST',
            body: JSON.stringify(optimizedReg),
          });
          fetchPreAggregatedKPIs();
        }
        return { success: true, isOfflineFallback: false };
      } catch (directErr: any) {
        console.warn('PostgreSQL save registration notice:', directErr);
        return { success: true, isOfflineFallback: true, error: directErr?.message };
      }
    },
    'ምዝገባው በዳታቤዝ እየተቀመጠ ነው...',
    'Saving registration to database...'
  );
}

export async function updateRegistrationStatusInDb(
  id: string,
  status: MotorcycleRegistration['status'],
  rejectionReason?: string
): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.registrations.findIndex((r) => r.id === id);
      if (index >= 0) {
        inMemory.registrations[index] = {
          ...inMemory.registrations[index],
          status,
          ...(rejectionReason !== undefined ? { rejectionReason } : {}),
        };
        notifyRegistrations();
        saveStateToLocalStorage();
        lastSyncTime = new Date();
        isCloudConnected = true;
        setGlobalDbError(null);
      }

      try {
        await safeJsonFetch('/api/registrations/status', {
          method: 'POST',
          body: JSON.stringify({ id, status, rejectionReason }),
        });
        fetchPreAggregatedKPIs();
      } catch (err) {
        console.warn('PostgreSQL update registration status notice:', err);
      }
    },
    'የምዝገባ ሁኔታ እየተዘመነ ነው...',
    'Updating registration status...'
  );
}

export async function updateRegistrationInDb(
  id: string,
  updates: Partial<MotorcycleRegistration>
): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.registrations.findIndex((r) => r.id === id);
      let updatedRecord: MotorcycleRegistration;
      if (index >= 0) {
        const existing = inMemory.registrations[index];
        updatedRecord = {
          ...existing,
          ...updates,
          id: existing.id,
          qrCodeData: existing.qrCodeData || updates.qrCodeData || `https://enforcement.gov.et/verify/${existing.id}`,
        };
        inMemory.registrations[index] = updatedRecord;
      } else {
        updatedRecord = {
          id,
          ...updates,
          qrCodeData: updates.qrCodeData || `https://enforcement.gov.et/verify/${id}`,
        } as MotorcycleRegistration;
        inMemory.registrations.unshift(updatedRecord);
      }

      notifyRegistrations();
      asyncUpsertSingleRegistration(optimizeRegistrationForStorage(updatedRecord));
      saveStateToLocalStorage();
      broadcastCrossTabSync('motorcycle_registrations', 'upsert', id, updatedRecord);
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      try {
        await safeJsonFetch('/api/registrations/update', {
          method: 'POST',
          body: JSON.stringify({ id, updates }),
        });
        fetchPreAggregatedKPIs();
      } catch (err) {
        console.warn('PostgreSQL update registration notice:', err);
      }
    },
    'መረጃው እየተዘመነ ነው...',
    'Updating registration record...'
  );
}

export async function deleteRegistrationFromDb(id: string): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.registrations.findIndex((r) => r.id === id);
      if (index >= 0) {
        inMemory.registrations.splice(index, 1);
        notifyRegistrations();
        asyncDeleteRegistration(id);
        saveStateToLocalStorage();
        lastSyncTime = new Date();
        isCloudConnected = true;
        setGlobalDbError(null);
      }

      try {
        await safeJsonFetch(`/api/registrations/${id}`, {
          method: 'DELETE',
        });
        fetchPreAggregatedKPIs();
      } catch (err) {
        console.warn('PostgreSQL delete registration notice:', err);
      }
    },
    'ምዝገባው እየተሰረዘ ነው...',
    'Deleting registration...'
  );
}

export async function bulkDeleteRegistrationsFromDb(ids: string[]): Promise<void> {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const idSet = new Set(ids);
  inMemory.registrations = inMemory.registrations.filter((r) => !idSet.has(r.id));
  notifyRegistrations();
  saveStateToLocalStorage();
  try {
    await safeJsonFetch('/api/registrations/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  } catch (e) {}
}

export async function fetchAllRegistrationsFromDb(): Promise<MotorcycleRegistration[]> {
  return inMemory.registrations;
}

export async function lookupRegistrationInDb(
  rawQuery: string,
  localList?: MotorcycleRegistration[]
): Promise<MotorcycleRegistration | null> {
  const cleanInput = (rawQuery || '').trim();
  if (!cleanInput) return null;

  const cleanLower = cleanInput.toLowerCase();
  const cleanPlateInput = cleanLower.replace(/[\s\-_]/g, '');

  let candidateId = cleanInput;
  if (cleanInput.includes('/verify/')) {
    const parts = cleanInput.split('/verify/');
    if (parts[1]) candidateId = parts[1].split('?')[0].trim();
  }

  const list = (localList && localList.length > 0) ? localList : inMemory.registrations;

  // 1. Search local memory
  const match = list.find((r) => {
    if (!r) return false;
    const idStr = String(r.id || '');
    const qrStr = typeof r.qrCodeData === 'string' ? r.qrCodeData : String(r.qrCodeData || '');
    const plateStr = String(r.plateNumber || '');
    const engineStr = String(r.engineOrSerialNo || '');
    const chassisStr = String(r.chassisNumber || '');
    const phoneStr = String(r.phone || '');

    if (idStr && (idStr === candidateId || idStr.toLowerCase() === cleanLower)) return true;
    if (qrStr && (qrStr === cleanInput || qrStr.toLowerCase() === cleanLower)) return true;
    if (plateStr) {
      const regCleanPlate = plateStr.replace(/[\s\-_]/g, '').toLowerCase();
      if (regCleanPlate === cleanPlateInput) return true;
    }
    if (engineStr && engineStr.toLowerCase() === cleanLower) return true;
    if (chassisStr && chassisStr.toLowerCase() === cleanLower) return true;
    if (phoneStr && phoneStr.replace(/[\s\-]/g, '') === cleanInput.replace(/[\s\-]/g, '')) return true;
    return false;
  });

  if (match) return match;

  // 2. Query targeted backend API lookup endpoint in O(1) time
  try {
    const params = new URLSearchParams();
    params.set('plate', cleanInput);
    params.set('qr', cleanInput);
    const res = await safeJsonFetch<{ success: boolean; registration?: MotorcycleRegistration }>(
      `/api/registrations/lookup?${params.toString()}`
    );
    if (res && res.success && res.registration) {
      saveRegistrationToDb(res.registration, { forceLocalOnly: true }).catch(() => {});
      return res.registration;
    }
  } catch (err) {}

  return null;
}

// --- OFFICERS ---
export function subscribeOfficers(
  callback: (officers: OfficerAssignment[]) => void
): () => void {
  callback(inMemory.officers);
  listeners.officers.add(callback);
  return () => {
    listeners.officers.delete(callback);
  };
}

export async function saveOfficerToDb(officer: OfficerAssignment): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.officers.findIndex((o) => o.id === officer.id || o.badgeId === officer.badgeId);
      if (index >= 0) {
        inMemory.officers[index] = { ...inMemory.officers[index], ...officer };
      } else {
        inMemory.officers.unshift(officer);
      }
      notifyOfficers();
      saveStateToLocalStorage();
      broadcastCrossTabSync('officer_assignments', 'upsert', officer.id, officer);
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      try {
        await safeJsonFetch('/api/officers', {
          method: 'POST',
          body: JSON.stringify(officer),
        });
      } catch (apiErr) {
        console.warn('Backend API save officer notice:', apiErr);
      }
    },
    'ፖሊስ መኮንን እየተመደበ ነው...',
    'Assigning officer...'
  );
}

export async function updateOfficerInDb(
  id: string,
  updates: Partial<OfficerAssignment>
): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.officers.findIndex((o) => o.id === id);
      if (index >= 0) {
        inMemory.officers[index] = { ...inMemory.officers[index], ...updates };
        notifyOfficers();
        saveStateToLocalStorage();
        broadcastCrossTabSync('officer_assignments', 'update', id, updates);
        lastSyncTime = new Date();
        isCloudConnected = true;
        setGlobalDbError(null);
      }

      try {
        await safeJsonFetch('/api/officers/update', {
          method: 'POST',
          body: JSON.stringify({ id, updates }),
        });
      } catch (apiErr) {
        console.warn('Backend API update officer notice:', apiErr);
      }
    },
    'የመኮንኑ መረጃ እየተዘመነ ነው...',
    'Updating officer assignment...'
  );
}

export async function deleteOfficerFromDb(id: string): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.officers.findIndex((o) => o.id === id);
      if (index >= 0) {
        inMemory.officers.splice(index, 1);
        notifyOfficers();
        saveStateToLocalStorage();
        broadcastCrossTabSync('officer_assignments', 'delete', id);
        lastSyncTime = new Date();
        isCloudConnected = true;
        setGlobalDbError(null);
      }

      try {
        await safeJsonFetch(`/api/officers/${id}`, {
          method: 'DELETE',
        });
      } catch (apiErr) {
        console.warn('Backend API delete officer notice:', apiErr);
      }
    },
    'መኮንኑ እየተሰረዘ ነው...',
    'Deleting officer...'
  );
}

// --- PRINT ORDERS ---
export function subscribePrintOrders(
  callback: (orders: PrintBatchOrder[]) => void
): () => void {
  callback(inMemory.printOrders);
  listeners.printOrders.add(callback);
  return () => {
    listeners.printOrders.delete(callback);
  };
}

export async function savePrintOrderToDb(order: PrintBatchOrder): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.printOrders.findIndex((o) => o.id === order.id);
      if (index >= 0) {
        inMemory.printOrders[index] = { ...inMemory.printOrders[index], ...order };
      } else {
        inMemory.printOrders.unshift(order);
      }
      notifyPrintOrders();
      saveStateToLocalStorage();
      broadcastCrossTabSync('print_batch_orders', 'upsert', order.id, order);
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      try {
        await safeJsonFetch('/api/print-orders', {
          method: 'POST',
          body: JSON.stringify(order),
        });
      } catch (apiErr) {
        console.warn('Backend API save print order notice:', apiErr);
      }
    },
    'የማተሚያ ትዕዛዝ እየተቀመጠ ነው...',
    'Creating print batch order...'
  );
}

export async function updatePrintOrderStatusInDb(
  id: string,
  status: PrintBatchOrder['status']
): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.printOrders.findIndex((o) => o.id === id);
      if (index >= 0) {
        inMemory.printOrders[index] = { ...inMemory.printOrders[index], status };
        notifyPrintOrders();
        saveStateToLocalStorage();
        broadcastCrossTabSync('print_batch_orders', 'status', id, { status });
        lastSyncTime = new Date();
        isCloudConnected = true;
        setGlobalDbError(null);
      }

      try {
        await safeJsonFetch('/api/print-orders/status', {
          method: 'POST',
          body: JSON.stringify({ id, status }),
        });
      } catch (apiErr) {
        console.warn('Backend API update print order status notice:', apiErr);
      }
    },
    'የትዕዛዙ ሁኔታ እየተዘመነ ነው...',
    'Updating print batch status...'
  );
}

// --- UNREGISTERED VEHICLE REPORTS ---
export function subscribeUnregisteredReports(
  callback: (reports: UnregisteredVehicleReport[]) => void
): () => void {
  callback(inMemory.unregisteredReports);
  listeners.unregisteredReports.add(callback);
  return () => {
    listeners.unregisteredReports.delete(callback);
  };
}

export async function saveUnregisteredReportToDb(report: UnregisteredVehicleReport): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.unregisteredReports.findIndex((r) => r.id === report.id);
      if (index >= 0) {
        inMemory.unregisteredReports[index] = { ...inMemory.unregisteredReports[index], ...report };
      } else {
        inMemory.unregisteredReports.unshift(report);
      }
      notifyUnregisteredReports();
      saveStateToLocalStorage();
      broadcastCrossTabSync('unregistered_vehicle_reports', 'upsert', report.id, report);
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      try {
        await safeJsonFetch('/api/unregistered-reports', {
          method: 'POST',
          body: JSON.stringify(report),
        });
        fetchPreAggregatedKPIs();
      } catch (apiErr) {
        console.warn('Backend API save unregistered report notice:', apiErr);
      }
    },
    'ያልተመዘገበ ተሽከርካሪ ሪፖርት እየተቀመጠ ነው...',
    'Submitting unregistered report...'
  );
}

export async function updateUnregisteredReportStatusInDb(
  id: string,
  status: UnregisteredVehicleReport['status'],
  resolutionNotes?: string
): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.unregisteredReports.findIndex((r) => r.id === id);
      if (index >= 0) {
        inMemory.unregisteredReports[index] = {
          ...inMemory.unregisteredReports[index],
          status,
          resolutionNotes: resolutionNotes || inMemory.unregisteredReports[index].resolutionNotes,
        };
        notifyUnregisteredReports();
        saveStateToLocalStorage();
        broadcastCrossTabSync('unregistered_vehicle_reports', 'status', id, { status, resolutionNotes });
        lastSyncTime = new Date();
        isCloudConnected = true;
        setGlobalDbError(null);
      }

      try {
        await safeJsonFetch('/api/unregistered-reports/status', {
          method: 'POST',
          body: JSON.stringify({ id, status, resolutionNotes }),
        });
        fetchPreAggregatedKPIs();
      } catch (apiErr) {
        console.warn('Backend API update report status notice:', apiErr);
      }
    },
    'የሪፖርቱ ሁኔታ እየተዘመነ ነው...',
    'Updating report status...'
  );
}

// --- VERIFICATION LOGS ---
export function subscribeVerifications(
  callback: (logs: VerificationLog[]) => void
): () => void {
  callback(inMemory.verifications);
  listeners.verifications.add(callback);
  return () => {
    listeners.verifications.delete(callback);
  };
}

export async function saveVerificationLogToDb(log: VerificationLog): Promise<void> {
  return trackGlobalAction(
    async () => {
      const index = inMemory.verifications.findIndex((v) => v.id === log.id);
      if (index >= 0) {
        inMemory.verifications[index] = { ...inMemory.verifications[index], ...log };
      } else {
        inMemory.verifications.unshift(log);
      }
      notifyVerifications();
      saveStateToLocalStorage();
      broadcastCrossTabSync('verification_logs', 'upsert', log.id, log);
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      try {
        await safeJsonFetch('/api/verification-logs', {
          method: 'POST',
          body: JSON.stringify(log),
        });
        fetchPreAggregatedKPIs();
      } catch (apiErr) {
        console.warn('Backend API save verification log notice:', apiErr);
      }
    },
    'የማረጋገጫ መረጃው እየተመዘገበ ነው...',
    'Logging verification...'
  );
}

// --- PAYMENT RECEIPTS ---
export function subscribePaymentReceipts(
  callback: (receipts: PaymentReceipt[]) => void
): () => void {
  callback(inMemory.paymentReceipts);
  listeners.paymentReceipts.add(callback);
  return () => {
    listeners.paymentReceipts.delete(callback);
  };
}

export async function savePaymentReceiptToDb(receipt: PaymentReceipt): Promise<void> {
  return trackGlobalAction(
    async () => {
      // 1. Save or update payment receipt
      const index = inMemory.paymentReceipts.findIndex((r) => r.id === receipt.id);
      if (index >= 0) {
        inMemory.paymentReceipts[index] = { ...inMemory.paymentReceipts[index], ...receipt };
      } else {
        inMemory.paymentReceipts.unshift(receipt);
      }
      notifyPaymentReceipts();
      broadcastCrossTabSync('payment_receipts', 'upsert', receipt.id, receipt);

      // 2. Account Ledger Model: Atomically update associated registration's financial status
      const targetRegId = receipt.ownerRegistrationId;
      const regIndex = inMemory.registrations.findIndex((r) =>
        (targetRegId && r.id === targetRegId) ||
        (receipt.plateNumber && r.plateNumber && r.plateNumber.toLowerCase() === receipt.plateNumber.toLowerCase())
      );

      if (regIndex >= 0) {
        const reg = inMemory.registrations[regIndex];
        const updatedReg: MotorcycleRegistration = {
          ...reg,
          termStatus: 'CURRENT',
          activeTermExpirationDate: receipt.expirationDate,
          lastPaymentDate: receipt.paymentDate,
          lastReceiptNumber: receipt.receiptNumber,
          lastPaymentAmount: receipt.amount || '500 ETB',
          receiptNumber: receipt.receiptNumber,
          paymentAmount: receipt.amount ? String(receipt.amount) : '500 ETB',
        };
        inMemory.registrations[regIndex] = updatedReg;
        notifyRegistrations();
        asyncUpsertSingleRegistration(updatedReg);
        broadcastCrossTabSync('motorcycle_registrations', 'upsert', updatedReg.id, updatedReg);
      }

      saveStateToLocalStorage();
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      try {
        await safeJsonFetch('/api/payment-receipts', {
          method: 'POST',
          body: JSON.stringify(receipt),
        });
        fetchPreAggregatedKPIs();
      } catch (apiErr) {
        console.warn('Backend API save payment receipt notice:', apiErr);
      }
    },
    'የክፍያ ደረሰኝ እየተመዘገበ ነው...',
    'Saving payment receipt...'
  );
}

export async function deletePaymentReceiptFromDb(id: string): Promise<void> {
  return trackGlobalAction(
    async () => {
      const targetReceipt = inMemory.paymentReceipts.find((r) => r.id === id);
      const index = inMemory.paymentReceipts.findIndex((r) => r.id === id);
      if (index >= 0) {
        inMemory.paymentReceipts.splice(index, 1);
        notifyPaymentReceipts();
        broadcastCrossTabSync('payment_receipts', 'delete', id);
      }

      // Account Ledger Model: Re-evaluate the vehicle's financial ledger status if attached to a registration
      if (targetReceipt) {
        const regId = targetReceipt.ownerRegistrationId;
        const plate = targetReceipt.plateNumber;
        const regIndex = inMemory.registrations.findIndex((r) =>
          (regId && r.id === regId) ||
          (plate && r.plateNumber && r.plateNumber.toLowerCase() === plate.toLowerCase())
        );

        if (regIndex >= 0) {
          const reg = inMemory.registrations[regIndex];
          const remainingReceipts = inMemory.paymentReceipts.filter((r) =>
            (reg.id && r.ownerRegistrationId === reg.id) ||
            (reg.plateNumber && r.plateNumber && r.plateNumber.toLowerCase() === reg.plateNumber.toLowerCase())
          );
          remainingReceipts.sort((a, b) => new Date(b.expirationDate).getTime() - new Date(a.expirationDate).getTime());
          const latest = remainingReceipts[0];

          let termStatus: TermStatus = 'DELINQUENT';
          let expDate = undefined;
          let lastPay = undefined;
          let lastRc = undefined;
          let lastAmt = undefined;

          if (latest) {
            expDate = latest.expirationDate;
            lastPay = latest.paymentDate;
            lastRc = latest.receiptNumber;
            lastAmt = latest.amount;
            const diffDays = Math.ceil((new Date(latest.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            termStatus = diffDays > 5 ? 'CURRENT' : diffDays >= 0 ? 'DUE' : 'DELINQUENT';
          }

          const updatedReg: MotorcycleRegistration = {
            ...reg,
            termStatus,
            activeTermExpirationDate: expDate,
            lastPaymentDate: lastPay,
            lastReceiptNumber: lastRc,
            lastPaymentAmount: lastAmt,
          };
          inMemory.registrations[regIndex] = updatedReg;
          notifyRegistrations();
          asyncUpsertSingleRegistration(updatedReg);
          broadcastCrossTabSync('motorcycle_registrations', 'upsert', updatedReg.id, updatedReg);
        }
      }

      saveStateToLocalStorage();
      lastSyncTime = new Date();
      isCloudConnected = true;
      setGlobalDbError(null);

      try {
        await safeJsonFetch(`/api/payment-receipts/${id}`, {
          method: 'DELETE',
        });
        fetchPreAggregatedKPIs();
      } catch (apiErr) {
        console.warn('Backend API delete payment receipt notice:', apiErr);
      }
    },
    'ደረሰኙ እየተሰረዘ ነው...',
    'Deleting payment receipt...'
  );
}

// --- SYSTEM SETTINGS ---
export function subscribeSettings(
  callback: (settings: SystemSettings) => void
): () => void {
  callback(inMemory.settings);
  listeners.settings.add(callback);
  return () => {
    listeners.settings.delete(callback);
  };
}

export async function saveSettingsToDb(
  settingsUpdates: Partial<SystemSettings>
): Promise<{ success: boolean; database?: string; target?: string; message?: string; error?: string }> {
  return trackGlobalAction(
    async () => {
      const mergedSettings: SystemSettings = {
        ...DEFAULT_SETTINGS,
        ...inMemory.settings,
        ...settingsUpdates,
        updatedAt: new Date().toISOString(),
      };
      inMemory.settings = mergedSettings;
      saveStateToLocalStorage();
      notifySettings();
      broadcastCrossTabSync('system_settings', 'upsert', 'global_config', mergedSettings);

      try {
        const response = await safeJsonFetch<{
          success: boolean;
          database?: string;
          target?: string;
          message?: string;
          error?: string;
        }>('/api/settings', {
          method: 'POST',
          body: JSON.stringify(mergedSettings),
        });

        if (response && response.success === false) {
          console.error('[Database Error] Failed to persist settings to DB:', response.error || response.message);
          return {
            success: false,
            target: response.target || 'postgresql',
            database: response.database || 'postgresql',
            error: response.error,
            message: response.message || response.error,
          };
        }

        return {
          success: true,
          target: response?.target || (isCloudConnected ? 'postgresql' : 'in-memory'),
          database: response?.database || (isCloudConnected ? 'postgresql' : 'in-memory'),
          message: response?.message || 'Settings saved successfully',
        };
      } catch (err: any) {
        console.warn('Backend API save settings notice:', err);
        return {
          success: false,
          target: 'in-memory',
          database: 'in-memory',
          error: err?.message || String(err),
          message: err?.message || 'Failed to reach backend server',
        };
      }
    },
    'ቅንብሩ እየተቀመጠ ነው...',
    'Saving system settings...'
  );
}

// --- SYNCHRONIZATION ROUTINES ---
const lastCollectionSyncTime: Record<string, number> = {};
const SYNC_THROTTLE_MS = 2500;

function isSyncThrottled(collectionKey: string, force = false): boolean {
  if (force) return false;
  const lastTime = lastCollectionSyncTime[collectionKey] || 0;
  return Date.now() - lastTime < SYNC_THROTTLE_MS;
}

function markCollectionSynced(collectionKey: string) {
  lastCollectionSyncTime[collectionKey] = Date.now();
  lastSyncTime = new Date();
  isCloudConnected = true;
  notifySyncStatus();
}

export async function syncSettings(force = false): Promise<boolean> {
  if (isSyncThrottled('settings', force)) return true;

  try {
    const res = await safeJsonFetch<{ success: boolean; settings?: SystemSettings }>('/api/settings');
    if (res && res.settings) {
      const wasReset = checkAndApplySystemResetIfNewer(res.settings);
      if (!wasReset) {
        inMemory.settings = mapSettingsFromDb(res.settings, inMemory.settings);
        saveStateToLocalStorage();
        notifySettings();
      }
    }
    markCollectionSynced('settings');
    return true;
  } catch (err: any) {
    console.warn('[Sync] Settings sync notice:', err?.message);
    return false;
  }
}

export async function syncOfficers(force = false): Promise<boolean> {
  if (isSyncThrottled('officers', force)) return true;

  try {
    const res = await safeJsonFetch<{ success: boolean; officers?: OfficerAssignment[] }>('/api/officers');
    if (res && Array.isArray(res.officers) && res.officers.length > 0) {
      inMemory.officers = mergeById(res.officers, inMemory.officers);
      notifyOfficers();
    }
    markCollectionSynced('officers');
    return true;
  } catch (err: any) {
    console.warn('[Sync] Officers sync notice:', err?.message);
    return false;
  }
}

export async function syncRegistrations(force = false): Promise<boolean> {
  if (isSyncThrottled('registrations', force)) return true;

  try {
    const res = await safeJsonFetch<{ success: boolean; registrations?: MotorcycleRegistration[] }>('/api/registrations');
    if (res && Array.isArray(res.registrations) && res.registrations.length > 0) {
      inMemory.registrations = mergeRegistrationsPreservingPhotos(res.registrations, inMemory.registrations);
      notifyRegistrations();
    }
    markCollectionSynced('registrations');
    saveStateToLocalStorage();
    return true;
  } catch (err: any) {
    console.warn('[Sync] Registrations sync notice:', err?.message);
    return false;
  }
}

export async function syncPrintOrders(force = false): Promise<boolean> {
  if (isSyncThrottled('printOrders', force)) return true;

  try {
    const res = await safeJsonFetch<{ success: boolean; printOrders?: PrintBatchOrder[] }>('/api/print-orders');
    if (res && Array.isArray(res.printOrders) && res.printOrders.length > 0) {
      inMemory.printOrders = mergeById(res.printOrders, inMemory.printOrders);
      notifyPrintOrders();
    }
    markCollectionSynced('printOrders');
    saveStateToLocalStorage();
    return true;
  } catch (err: any) {
    console.warn('[Sync] Print orders sync notice:', err?.message);
    return false;
  }
}

export async function syncVerifications(force = false): Promise<boolean> {
  if (isSyncThrottled('verifications', force)) return true;

  try {
    const res = await safeJsonFetch<{ success: boolean; logs?: VerificationLog[] }>('/api/verification-logs');
    if (res && Array.isArray(res.logs) && res.logs.length > 0) {
      inMemory.verifications = mergeById(res.logs, inMemory.verifications);
      notifyVerifications();
    }
    markCollectionSynced('verifications');
    saveStateToLocalStorage();
    return true;
  } catch (err: any) {
    console.warn('[Sync] Verifications sync notice:', err?.message);
    return false;
  }
}

export async function syncUnregisteredReports(force = false): Promise<boolean> {
  if (isSyncThrottled('unregisteredReports', force)) return true;

  try {
    const res = await safeJsonFetch<{ success: boolean; reports?: UnregisteredVehicleReport[] }>('/api/unregistered-reports');
    if (res && Array.isArray(res.reports) && res.reports.length > 0) {
      inMemory.unregisteredReports = mergeById(res.reports, inMemory.unregisteredReports);
      notifyUnregisteredReports();
    }
    markCollectionSynced('unregisteredReports');
    saveStateToLocalStorage();
    return true;
  } catch (err: any) {
    console.warn('[Sync] Unregistered reports sync notice:', err?.message);
    return false;
  }
}

export async function syncPaymentReceipts(force = false): Promise<boolean> {
  if (isSyncThrottled('paymentReceipts', force)) return true;

  try {
    const res = await safeJsonFetch<{ success: boolean; receipts?: PaymentReceipt[] }>('/api/payment-receipts');
    if (res && Array.isArray(res.receipts) && res.receipts.length > 0) {
      inMemory.paymentReceipts = mergeById(res.receipts, inMemory.paymentReceipts);
      notifyPaymentReceipts();
    }
    markCollectionSynced('paymentReceipts');
    saveStateToLocalStorage();
    return true;
  } catch (err: any) {
    console.warn('[Sync] Payment receipts sync notice:', err?.message);
    return false;
  }
}

export async function syncActivePageCollection(activePage: string, force = false): Promise<void> {
  switch (activePage) {
    case 'dashboard':
      await Promise.allSettled([syncRegistrations(force), syncPaymentReceipts(force), syncOfficers(force)]);
      break;
    case 'tables':
    case 'new_registration':
    case 'submissions':
    case 'renewals':
    case 'lost_damaged':
    case 'duplicate_plate':
    case 'ownership_transfer':
    case 'superadmin_owners':
      await syncRegistrations(force);
      break;
    case 'officer_assignments':
      await syncOfficers(force);
      break;
    case 'print_queue':
      await Promise.allSettled([syncPrintOrders(force), syncRegistrations(force)]);
      break;
    case 'unregistered_reports':
      await syncUnregisteredReports(force);
      break;
    case 'officer_verifications':
      await Promise.allSettled([syncVerifications(force), syncRegistrations(force)]);
      break;
    case 'payments':
    case 'payment_receipts':
      await Promise.allSettled([syncPaymentReceipts(force), syncRegistrations(force)]);
      break;
    case 'settings':
    case 'superadmin':
      await Promise.allSettled([syncSettings(force), syncOfficers(force)]);
      break;
    default:
      await syncRegistrations(force);
      break;
  }
}

export async function syncCriticalStartup(activePage: string = 'dashboard'): Promise<void> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (isOffline) {
    loadStateFromLocalStorage();
    hydrateFromIndexedDb().catch(() => {});
    lastSyncTime = new Date();
    isCloudConnected = false;
    notifySyncStatus();
    return;
  }

  try {
    lastSyncTime = new Date();
    isCloudConnected = true;
    notifySyncStatus();
    setGlobalDbError(null);

    // High Priority: Fetch instant pre-aggregated write-side KPIs + server-side Monthly Fee statistics & active page data on-demand
    const results = await Promise.allSettled([
      fetchPreAggregatedKPIs(),
      fetchMonthlyFeeStatisticsServerSide(),
      syncSettings(),
      syncOfficers(),
      syncActivePageCollection(activePage),
    ]);

    const anySuccess = results.some((r) => r.status === 'fulfilled');
    if (!anySuccess) {
      throw new Error('All network startup endpoints failed');
    }

    // Background update offline cache with fresh server data
    saveStateToLocalStorage();
  } catch (err: any) {
    console.warn('[Sync] Network error during startup sync, falling back to offline cache:', err?.message);
    isCloudConnected = false;
    notifySyncStatus();
    loadStateFromLocalStorage();
    hydrateFromIndexedDb().catch(() => {});
  }
}

export async function syncAllCollectionsWithDb(force = false): Promise<void> {
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (isOffline) {
    loadStateFromLocalStorage();
    hydrateFromIndexedDb().catch(() => {});
    isCloudConnected = false;
    notifySyncStatus();
    return;
  }

  lastSyncTime = new Date();
  isCloudConnected = true;
  notifySyncStatus();
  setGlobalDbError(null);

  try {
    // Check bulk sync endpoint first
    const bulkSync = await safeJsonFetch<any>('/api/sync').catch(() => null);
    const d = bulkSync?.data || bulkSync;
    if (d && (Array.isArray(d.registrations) || Array.isArray(d.paymentReceipts) || d.settings)) {
      if (d.settings) {
        const wasReset = checkAndApplySystemResetIfNewer(d.settings);
        if (!wasReset) {
          inMemory.settings = mapSettingsFromDb(d.settings, inMemory.settings);
          notifySettings();
        }
      }
      if (Array.isArray(d.registrations)) {
        inMemory.registrations = mergeRegistrationsPreservingPhotos(d.registrations, inMemory.registrations);
        notifyRegistrations();
      }
      if (Array.isArray(d.officers)) {
        inMemory.officers = mergeById(d.officers, inMemory.officers);
        notifyOfficers();
      }
      if (Array.isArray(d.printOrders)) {
        inMemory.printOrders = mergeById(d.printOrders, inMemory.printOrders);
        notifyPrintOrders();
      }
      if (Array.isArray(d.verifications)) {
        inMemory.verifications = mergeById(d.verifications, inMemory.verifications);
        notifyVerifications();
      }
      if (Array.isArray(d.unregisteredReports)) {
        inMemory.unregisteredReports = mergeById(d.unregisteredReports, inMemory.unregisteredReports);
        notifyUnregisteredReports();
      }
      if (Array.isArray(d.paymentReceipts)) {
        inMemory.paymentReceipts = mergeById(d.paymentReceipts, inMemory.paymentReceipts);
        notifyPaymentReceipts();
      }
      saveStateToLocalStorage();
      return;
    }

    // Fallback parallel sync
    await Promise.allSettled([
      syncSettings(force),
      syncRegistrations(force),
      syncOfficers(force),
      syncPrintOrders(force),
      syncVerifications(force),
      syncUnregisteredReports(force),
      syncPaymentReceipts(force),
    ]);
    saveStateToLocalStorage();
  } catch (err: any) {
    console.warn('[Sync] PostgreSQL sync notice (falling back to offline cache):', err?.message);
    isCloudConnected = false;
    notifySyncStatus();
    loadStateFromLocalStorage();
    hydrateFromIndexedDb().catch(() => {});
  }
}

// --- SYSTEM USERS & AUDIT LOG MANAGEMENT ---
const DEFAULT_PRESET_USERS: SystemUser[] = [
  {
    uid: 'user-clerk-CLERK-001',
    id: 'user-clerk-CLERK-001',
    badgeId: 'CLERK-001',
    phone: '0918123456',
    email: 'clerk@permit.gov.et',
    role: 'clerk',
    fullName: 'Abebe Bekele (Clerk)',
    status: 'active',
    createdAt: '2026-08-22T20:46:29-07:00',
  },
  {
    uid: 'user-officer-OFFICER-8842',
    id: 'user-officer-OFFICER-8842',
    badgeId: 'OFFICER-8842',
    phone: '0918654321',
    email: 'officer@permit.gov.et',
    role: 'officer',
    fullName: 'Officer Solomon Desta',
    status: 'active',
    createdAt: '2026-08-22T20:46:29-07:00',
  },
  {
    uid: 'user-admin-ADMIN-PRO-1',
    id: 'user-admin-ADMIN-PRO-1',
    badgeId: 'ADMIN-PRO-1',
    phone: '0911223344',
    email: 'admin@permit.gov.et',
    role: 'admin',
    fullName: 'Tigist Alemu (System Admin)',
    status: 'active',
    createdAt: '2026-08-22T20:46:29-07:00',
  },
  {
    uid: 'user-superadmin-SUPER-ADMIN-01',
    id: 'user-superadmin-SUPER-ADMIN-01',
    badgeId: 'SUPER-ADMIN-01',
    phone: '0911000001',
    email: 'superadmin@permit.gov.et',
    role: 'superadmin',
    fullName: 'Kaleb Tadesse (Chief Super Admin)',
    status: 'active',
    createdAt: '2026-08-22T20:46:29-07:00',
  },
];

export function subscribeUsers(callback: (users: SystemUser[]) => void): () => void {
  if (inMemory.users.length === 0) {
    inMemory.users = [...DEFAULT_PRESET_USERS];
  }
  callback(inMemory.users);
  listeners.users.add(callback);

  // Load from Railway Express API
  fetch('/api/auth/users')
    .then((r) => r.json())
    .then((data) => {
      if (data && data.success && Array.isArray(data.users) && data.users.length > 0) {
        inMemory.users = mergeById(data.users, inMemory.users);
        notifyUsers();
      }
    })
    .catch(() => {});

  return () => {
    listeners.users.delete(callback);
  };
}

export function subscribeAuditLogs(callback: (logs: SystemAuditLog[]) => void): () => void {
  callback(inMemory.auditLogs);
  listeners.auditLogs.add(callback);

  fetch('/api/audit-logs')
    .then((r) => r.json())
    .then((data) => {
      if (data && data.success && Array.isArray(data.logs)) {
        inMemory.auditLogs = mergeById(data.logs, inMemory.auditLogs);
        notifyAuditLogs();
      }
    })
    .catch(() => {});

  return () => {
    listeners.auditLogs.delete(callback);
  };
}

export async function saveSystemUserToDb(user: Partial<SystemUser> & { password?: string }): Promise<void> {
  return trackGlobalAction(
    async () => {
      const userId = user.uid || user.id || `user-${user.role}-${user.badgeId}`;
      const formatted: SystemUser = {
        uid: userId,
        id: userId,
        badgeId: user.badgeId || 'NEW-USER',
        phone: user.phone || '0918123456',
        email: user.email || `${(user.badgeId || 'user').toLowerCase()}@permit.gov.et`,
        role: user.role || 'clerk',
        fullName: user.fullName || 'User',
        status: user.status || 'active',
        createdAt: user.createdAt || new Date().toISOString(),
        ...user,
      };

      const idx = inMemory.users.findIndex((u) => u.uid === userId || u.badgeId === formatted.badgeId);
      if (idx >= 0) {
        inMemory.users[idx] = { ...inMemory.users[idx], ...formatted };
      } else {
        inMemory.users.unshift(formatted);
      }
      notifyUsers();

      try {
        await fetch('/api/auth/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formatted, password: user.password }),
        }).catch(() => {});
      } catch {}
    },
    'የተጠቃሚ መረጃ እየተቀመጠ ነው...',
    'Saving user account...'
  );
}

export async function updateSystemUserInDb(userId: string, updates: Partial<SystemUser>): Promise<void> {
  return trackGlobalAction(
    async () => {
      const idx = inMemory.users.findIndex((u) => u.uid === userId || u.badgeId === userId);
      if (idx >= 0) {
        inMemory.users[idx] = { ...inMemory.users[idx], ...updates };
        notifyUsers();
      }
      try {
        await fetch('/api/auth/users/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userId, updates }),
        }).catch(() => {});
      } catch {}
    },
    'የተጠቃሚ መረጃ እየተዘመነ ነው...',
    'Updating user account...'
  );
}

export async function deleteSystemUserFromDb(userId: string): Promise<void> {
  return trackGlobalAction(
    async () => {
      inMemory.users = inMemory.users.filter((u) => u.uid !== userId && u.badgeId !== userId);
      notifyUsers();
      try {
        await fetch(`/api/auth/users/${userId}`, { method: 'DELETE' }).catch(() => {});
      } catch {}
    },
    'ተጠቃሚው እየተሰረዘ ነው...',
    'Deleting user account...'
  );
}

export const subscribeSystemUsers = subscribeUsers;
export const subscribeVerificationLogs = subscribeVerifications;

export function getUserRolePermissions(userRole: string): Record<string, 'allow' | 'view_only' | 'deny'> {
  let roleId = 'role-secretary';
  if (userRole === 'officer') roleId = 'role-officer';
  else if (userRole === 'admin' || userRole === 'manager') roleId = 'role-manager';
  else if (userRole === 'it_specialist' || userRole === 'it') roleId = 'role-it';
  else if (userRole === 'superadmin' || userRole === 'super_admin') roleId = 'role-superadmin';
  else if (userRole.startsWith('role-')) roleId = userRole;

  let savedMatrix: Record<string, Record<string | number, 'allow' | 'view_only' | 'deny'>> | null = null;
  if (inMemory.settings?.rolePermissions && Object.keys(inMemory.settings.rolePermissions).length > 0) {
    savedMatrix = inMemory.settings.rolePermissions;
  } else if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('permit_role_permissions');
      if (raw) savedMatrix = JSON.parse(raw);
    } catch {}
  }

  const defaultMatrix: Record<string, Record<number, 'allow' | 'view_only' | 'deny'>> = {
    'role-secretary': {
      1: 'allow', 2: 'allow', 3: 'allow', 4: 'allow',
      5: 'view_only', 6: 'view_only', 7: 'view_only', 8: 'view_only',
      9: 'deny', 10: 'allow', 17: 'allow', 16: 'allow',
      11: 'deny', 12: 'deny', 13: 'deny', 14: 'deny', 15: 'deny',
    },
    'role-officer': {
      1: 'deny', 2: 'deny', 3: 'view_only', 4: 'view_only',
      5: 'allow', 6: 'allow', 7: 'allow', 8: 'allow',
      9: 'deny', 10: 'deny', 17: 'deny', 16: 'deny',
      11: 'deny', 12: 'deny', 13: 'deny', 14: 'deny', 15: 'deny',
    },
    'role-manager': {
      1: 'allow', 2: 'allow', 3: 'allow', 4: 'allow',
      5: 'allow', 6: 'allow', 7: 'allow', 8: 'allow',
      9: 'allow', 10: 'allow', 17: 'allow', 16: 'allow',
      11: 'view_only', 12: 'view_only', 13: 'view_only', 14: 'deny', 15: 'view_only',
    },
    'role-it': {
      1: 'view_only', 2: 'view_only', 3: 'view_only', 4: 'view_only',
      5: 'allow', 6: 'view_only', 7: 'view_only', 8: 'view_only',
      9: 'allow', 10: 'allow', 17: 'allow', 16: 'allow',
      11: 'allow', 12: 'allow', 13: 'allow', 14: 'allow', 15: 'allow',
    },
    'role-superadmin': {
      1: 'allow', 2: 'allow', 3: 'allow', 4: 'allow',
      5: 'allow', 6: 'allow', 7: 'allow', 8: 'allow',
      9: 'allow', 10: 'allow', 17: 'allow', 16: 'allow',
      11: 'allow', 12: 'allow', 13: 'allow', 14: 'allow', 15: 'allow',
    },
  };

  const rolePerms = savedMatrix?.[roleId] || defaultMatrix[roleId] || defaultMatrix['role-secretary'];

  const getS = (taskId: number): 'allow' | 'view_only' | 'deny' => {
    if (userRole === 'superadmin') return 'allow';
    // Fallback: If task 17 was not previously saved in local storage or DB, inherit from task 10 or default
    if (taskId === 17 && rolePerms[17] === undefined && rolePerms['17'] === undefined) {
      return (rolePerms[10] || rolePerms['10']) as any || (userRole === 'officer' ? 'deny' : 'allow');
    }
    return (rolePerms[taskId] || rolePerms[String(taskId)]) as any || 'deny';
  };

  const p1 = getS(1);
  const p2 = getS(2);
  const p3 = getS(3);
  const p5 = getS(5);
  const p8 = getS(8);
  const p9 = getS(9);
  const p10 = getS(10);
  const p14 = getS(14);
  const p16 = getS(16);
  const p17 = getS(17);

  if (userRole === 'clerk') {
    return {
      '1': p1,
      '2': p2,
      '3': p3,
      '4': getS(4),
      '5': p5,
      '6': getS(6),
      '7': getS(7),
      '8': p8,
      '9': p9,
      '10': p10,
      '11': getS(11),
      '12': getS(12),
      '13': getS(13),
      '14': p14,
      '15': getS(15),
      '16': p16,
      '17': p17,
      canViewDashboard: 'allow',
      canRegister: p1 === 'allow' ? 'allow' : 'deny',
      canEditSubmissions: p2 === 'allow' ? 'allow' : 'deny',
      canQrScan: p5,
      canAddReceipts: p10 === 'allow' ? 'allow' : 'deny',
      canViewSubmissions: p3,
      canApproveVehicles: p3,
      canViewPermitStatus: p3,
      canViewPaymentKPIs: p17,
      canViewPaymentRecordsTable: p16,
      canManageSettings: 'deny',
      canAssignOfficers: 'deny',
      canPrintBatch: 'deny',
      canVerifyVehicles: p5,
      canExportExcel: 'deny',
    };
  }

  if (userRole === 'officer') {
    return {
      '1': p1,
      '2': p2,
      '3': p3,
      '4': getS(4),
      '5': p5,
      '6': getS(6),
      '7': getS(7),
      '8': p8,
      '9': p9,
      '10': p10,
      '11': getS(11),
      '12': getS(12),
      '13': getS(13),
      '14': p14,
      '15': getS(15),
      '16': p16,
      '17': p17,
      canViewDashboard: 'allow',
      canRegister: p1 === 'allow' ? 'allow' : 'deny',
      canEditSubmissions: p2 === 'allow' ? 'allow' : 'deny',
      canQrScan: p5,
      canAddReceipts: p10 === 'allow' ? 'allow' : 'deny',
      canViewSubmissions: p3,
      canApproveVehicles: p3,
      canViewPermitStatus: p3,
      canViewPaymentKPIs: p17,
      canViewPaymentRecordsTable: p16,
      canManageSettings: p14 === 'allow' ? 'allow' : 'deny',
      canAssignOfficers: p8 === 'allow' ? 'allow' : 'deny',
      canPrintBatch: p9 === 'allow' ? 'allow' : 'deny',
      canVerifyVehicles: p5,
      canExportExcel: p3,
    };
  }

  return {
    '1': p1,
    '2': p2,
    '3': p3,
    '4': getS(4),
    '5': p5,
    '6': getS(6),
    '7': getS(7),
    '8': p8,
    '9': p9,
    '10': p10,
    '11': getS(11),
    '12': getS(12),
    '13': getS(13),
    '14': p14,
    '15': getS(15),
    '16': p16,
    '17': p17,
    canViewDashboard: 'allow',
    canRegister: p1 === 'allow' ? 'allow' : 'deny',
    canEditSubmissions: p2 === 'allow' ? 'allow' : 'deny',
    canQrScan: p5,
    canAddReceipts: p10 === 'allow' ? 'allow' : 'deny',
    canViewSubmissions: p3,
    canApproveVehicles: p3,
    canViewPermitStatus: p3,
    canViewPaymentKPIs: p17,
    canViewPaymentRecordsTable: p16,
    canManageSettings: p14 === 'allow' ? 'allow' : 'deny',
    canAssignOfficers: p8 === 'allow' ? 'allow' : 'deny',
    canPrintBatch: p9 === 'allow' ? 'allow' : 'deny',
    canVerifyVehicles: p5,
    canExportExcel: p3,
  };
}

export function getPermissionState(userRole: string, taskId: string | number): 'allow' | 'view_only' | 'deny' {
  const permissions = getUserRolePermissions(userRole);
  const key = String(taskId);
  return permissions[key] || (userRole === 'superadmin' || userRole === 'admin' ? 'allow' : 'deny');
}

export function canPerformTask(userRole: string, taskId: string | number): boolean {
  if (userRole === 'superadmin' || userRole === 'admin') {
    return true;
  }
  const state = getPermissionState(userRole, taskId);
  return state === 'allow' || state === 'view_only';
}

export function isTaskAllowed(userRole: string, taskId: string | number): boolean {
  return canPerformTask(userRole, taskId);
}

export function isTaskViewable(userRole: string, taskId: string | number): boolean {
  const state = getPermissionState(userRole, taskId);
  return state === 'allow' || state === 'view_only';
}

export async function resetSystemToFactoryDefaults(): Promise<void> {
  return trackGlobalAction(
    async () => {
      const resetEpoch = Date.now();
      const resetIso = new Date().toISOString();

      inMemory.registrations = [];
      inMemory.officers = [];
      inMemory.printOrders = [];
      inMemory.verifications = [];
      inMemory.unregisteredReports = [];
      inMemory.paymentReceipts = [];
      inMemory.auditLogs = [];
      inMemory.settings = {
        ...DEFAULT_SETTINGS,
        systemResetEpoch: resetEpoch,
        lastSystemResetAt: resetIso,
      };

      saveStoredLastAckResetEpoch(resetEpoch);
      clearAllLocalStoredData();
      saveStateToLocalStorage();

      notifyRegistrations();
      notifyOfficers();
      notifyPrintOrders();
      notifyVerifications();
      notifyUnregisteredReports();
      notifyPaymentReceipts();
      notifyAuditLogs();
      notifySettings();

      try {
        await safeJsonFetch('/api/reset-database', {
          method: 'POST',
          body: JSON.stringify({ systemResetEpoch: resetEpoch, lastSystemResetAt: resetIso }),
        });
      } catch (err) {
        console.warn('Backend reset-database API notice:', err);
      }
    },
    'ዳታቤዙ ወደ ፋብሪካ ቅንብር እየተመለሰ ነው...',
    'Resetting system database...'
  );
}

export const resetDatabaseInDb = resetSystemToFactoryDefaults;

export async function purgeRejectedRegistrations(): Promise<number> {
  return trackGlobalAction(
    async () => {
      const rejected = inMemory.registrations.filter((r) => r.status === 'rejected');
      inMemory.registrations = inMemory.registrations.filter((r) => r.status !== 'rejected');
      
      saveStateToLocalStorage();
      notifyRegistrations();

      if (rejected.length > 0) {
        try {
          await safeJsonFetch('/api/registrations/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids: rejected.map((r) => r.id) }),
          });
        } catch (err) {
          console.warn('Notice during rejected registrations purge:', err);
        }
      }

      return rejected.length;
    },
    'ውድቅ የሆኑት እየተጸዱ ነው...',
    'Purging rejected records...'
  );
}

export async function clearAllAuditLogs(): Promise<void> {
  inMemory.auditLogs = [];
  saveStateToLocalStorage();
  notifyAuditLogs();
  try {
    await safeJsonFetch('/api/reset-data', { method: 'POST' });
  } catch (err) {
    console.warn('Clear audit logs notice:', err);
  }
}

export async function clearAllVerificationLogs(): Promise<void> {
  inMemory.verifications = [];
  saveStateToLocalStorage();
  notifyVerifications();
  try {
    await safeJsonFetch('/api/reset-data', { method: 'POST' });
  } catch (err) {
    console.warn('Clear verifications notice:', err);
  }
}

export async function importFullDatabaseBackup(backupData: {
  users?: SystemUser[];
  registrations?: MotorcycleRegistration[];
  officers?: OfficerAssignment[];
  auditLogs?: SystemAuditLog[];
  unregisteredReports?: UnregisteredVehicleReport[];
  paymentReceipts?: PaymentReceipt[];
  settings?: SystemSettings;
}): Promise<{ success: boolean; importedCounts: Record<string, number> }> {
  const counts: Record<string, number> = {
    registrations: 0,
    users: 0,
    officers: 0,
    auditLogs: 0,
    unregisteredReports: 0,
    paymentReceipts: 0,
  };

  if (Array.isArray(backupData.registrations)) {
    inMemory.registrations = mergeById(backupData.registrations, inMemory.registrations);
    counts.registrations = backupData.registrations.length;
    notifyRegistrations();
  }

  if (Array.isArray(backupData.users)) {
    inMemory.users = mergeById(backupData.users, inMemory.users);
    counts.users = backupData.users.length;
    notifyUsers();
  }

  if (Array.isArray(backupData.officers)) {
    inMemory.officers = mergeById(backupData.officers, inMemory.officers);
    counts.officers = backupData.officers.length;
    notifyOfficers();
  }

  if (Array.isArray(backupData.unregisteredReports)) {
    inMemory.unregisteredReports = mergeById(backupData.unregisteredReports, inMemory.unregisteredReports);
    counts.unregisteredReports = backupData.unregisteredReports.length;
    notifyUnregisteredReports();
  }

  if (Array.isArray(backupData.paymentReceipts)) {
    inMemory.paymentReceipts = mergeById(backupData.paymentReceipts, inMemory.paymentReceipts);
    counts.paymentReceipts = backupData.paymentReceipts.length;
    notifyPaymentReceipts();
  }

  if (Array.isArray(backupData.auditLogs)) {
    inMemory.auditLogs = [...backupData.auditLogs, ...inMemory.auditLogs].slice(0, 200);
    counts.auditLogs = backupData.auditLogs.length;
    notifyAuditLogs();
  }

  if (backupData.settings) {
    inMemory.settings = { ...DEFAULT_SETTINGS, ...backupData.settings };
    notifySettings();
  }

  saveStateToLocalStorage();
  await syncAllCollectionsWithDb().catch(() => {});

  return { success: true, importedCounts: counts };
}

export async function addAuditLogToDb(log: Omit<SystemAuditLog, 'id' | 'timestamp'>): Promise<void> {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const fullLog: SystemAuditLog = {
    id,
    timestamp: new Date().toISOString(),
    ...log,
  };
  inMemory.auditLogs.unshift(fullLog);
  if (inMemory.auditLogs.length > 200) inMemory.auditLogs = inMemory.auditLogs.slice(0, 200);
  notifyAuditLogs();
  try {
    await safeJsonFetch('/api/audit-logs', {
      method: 'POST',
      body: JSON.stringify(fullLog),
    });
  } catch {}
}

export async function saveUserNotificationStateToDb(
  userScopeId: string,
  readIds: string[],
  clearedIds: string[]
): Promise<void> {
  try {
    await safeJsonFetch('/api/notifications/state', {
      method: 'POST',
      body: JSON.stringify({
        userScopeId,
        readIds,
        clearedIds,
        lastReadAt: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.warn('Failed to save notification state to PostgreSQL:', err);
  }
}

export async function loadUserNotificationStateFromDb(
  userScopeId: string
): Promise<{ readIds: string[]; clearedIds: string[] } | null> {
  try {
    const res = await safeJsonFetch<any>(`/api/notifications/state/${encodeURIComponent(userScopeId)}`);
    if (res && res.success && res.state) {
      return {
        readIds: Array.isArray(res.state.readIds) ? res.state.readIds : [],
        clearedIds: Array.isArray(res.state.clearedIds) ? res.state.clearedIds : [],
      };
    }
  } catch (err) {
    console.warn('Failed to load notification state from PostgreSQL:', err);
  }
  return null;
}

export interface PreAggregatedKPIData {
  users: { total: number; admins: number; disabled: number; active: number };
  permits: { pending: number; approved: number; rejected: number; total: number; printed: number };
  revenue: { totalRevenue: number; totalReceipts: number; currency: string };
  verifications: { total: number; warnings: number; illegal: number };
  unregisteredReports: { total: number; pending: number };
  calculatedAt: string;
}

let cachedPreAggregatedKpis: PreAggregatedKPIData | null = null;

export function getCachedPreAggregatedKPIs(): PreAggregatedKPIData | null {
  return cachedPreAggregatedKpis;
}

export function subscribePreAggregatedKPIs(callback: (data: PreAggregatedKPIData) => void): () => void {
  listeners.kpis.add(callback);
  if (cachedPreAggregatedKpis) {
    callback(cachedPreAggregatedKpis);
  }
  fetchPreAggregatedKPIs().then((data) => {
    if (data) callback(data);
  });
  return () => listeners.kpis.delete(callback);
}

export function notifyKpis(): void {
  if (!cachedPreAggregatedKpis) return;
  listeners.kpis.forEach((cb) => cb(cachedPreAggregatedKpis!));
}

export async function fetchPreAggregatedKPIs(): Promise<PreAggregatedKPIData | null> {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const res = await safeJsonFetch<{ success: boolean; data?: PreAggregatedKPIData; serverDurationMs?: number }>('/api/dashboard/kpis');
    const totalMs = (typeof performance !== 'undefined' ? performance.now() - startMs : Date.now() - startMs).toFixed(2);

    if (res && res.success && res.data) {
      console.log(`[KPI Client Perf] /api/dashboard/kpis fetched in ${totalMs}ms (server execution: ${res.serverDurationMs ?? 'N/A'}ms)`);
      cachedPreAggregatedKpis = res.data;
      notifyKpis();
      return res.data;
    } else {
      console.warn(`[KPI Client Perf] /api/dashboard/kpis returned non-success response after ${totalMs}ms:`, res);
    }
  } catch (err) {
    const totalMs = (typeof performance !== 'undefined' ? performance.now() - startMs : Date.now() - startMs).toFixed(2);
    console.warn(`[KPI Client Perf Notice] /api/dashboard/kpis request failed after ${totalMs}ms:`, err);
  }
  return cachedPreAggregatedKpis;
}

// Server-Side Monthly Fee Statistics interface & state cache
export interface ServerMonthlyFeeStatistics {
  targetMonth: number;
  targetYear: number;
  monthNameAm: string;
  monthNameEn: string;
  isCurrentMonth: boolean;
  totalRevenue: number;
  totalReceiptsCount: number;
  paidMembersCount: number;
  dueSoonMembersCount: number;
  unpaidMembersCount: number;
  notEnrolledCount: number;
  activeBillableCount: number;
  complianceRate: number;
  matrixCounts: {
    all: number;
    active: number;
    expiring: number;
    expired: number;
  };
  calculatedAt: string;
}

let cachedServerMonthlyFeeStats: ServerMonthlyFeeStatistics | null = null;

export function getCachedServerMonthlyFeeStatistics(): ServerMonthlyFeeStatistics | null {
  return cachedServerMonthlyFeeStats;
}

export function subscribeMonthlyFeeStatistics(callback: (data: ServerMonthlyFeeStatistics) => void): () => void {
  listeners.monthlyFeeStats.add(callback);
  if (cachedServerMonthlyFeeStats) {
    try {
      callback(cachedServerMonthlyFeeStats);
    } catch (e) {}
  }
  return () => listeners.monthlyFeeStats.delete(callback);
}

export function notifyMonthlyFeeStats(): void {
  if (!cachedServerMonthlyFeeStats) return;
  listeners.monthlyFeeStats.forEach((cb) => cb(cachedServerMonthlyFeeStats!));
}

export async function fetchMonthlyFeeStatisticsServerSide(
  targetMonth?: number,
  targetYear?: number
): Promise<ServerMonthlyFeeStatistics | null> {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const params = new URLSearchParams();
    if (targetMonth) params.set('month', String(targetMonth));
    if (targetYear) params.set('year', String(targetYear));
    const qs = params.toString();
    const url = `/api/statistics/monthly-fee${qs ? `?${qs}` : ''}`;

    const res = await safeJsonFetch<{ success: boolean; data?: ServerMonthlyFeeStatistics; serverDurationMs?: number }>(url);
    const totalMs = (typeof performance !== 'undefined' ? performance.now() - startMs : Date.now() - startMs).toFixed(2);

    if (res && res.success && res.data) {
      console.log(`[Monthly Fee Stats Perf] /api/statistics/monthly-fee fetched in ${totalMs}ms`);
      cachedServerMonthlyFeeStats = res.data;
      notifyMonthlyFeeStats();
      return res.data;
    }
  } catch (err) {
    const totalMs = (typeof performance !== 'undefined' ? performance.now() - startMs : Date.now() - startMs).toFixed(2);
    console.warn(`[Monthly Fee Stats Notice] Server request failed after ${totalMs}ms:`, err);
  }
  return cachedServerMonthlyFeeStats;
}

export interface PaginatedUsersResult {
  users: SystemUser[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export async function fetchPaginatedUsers(
  page = 1,
  limit = 20,
  search = '',
  role = '',
  status = ''
): Promise<PaginatedUsersResult | null> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      search,
      role,
      status,
    });
    const res = await safeJsonFetch<{ success: boolean; users?: SystemUser[]; pagination?: any }>(
      `/api/users/paginated?${params.toString()}`
    );
    if (res && res.success && res.users) {
      return {
        users: res.users,
        pagination: res.pagination,
      };
    }
  } catch (err) {
    console.warn('[User Service] Paginated users fetch notice:', err);
  }
  return null;
}

export async function fetchMaterializedNotifications(role?: string): Promise<any[]> {
  try {
    const url = role ? `/api/notifications/materialized?role=${encodeURIComponent(role)}` : '/api/notifications/materialized';
    const res = await safeJsonFetch<{ success: boolean; notifications?: any[] }>(url);
    if (res && res.success && Array.isArray(res.notifications)) {
      return res.notifications;
    }
  } catch (err) {
    console.warn('[Notification Service] Materialized notifications fetch notice:', err);
  }
  return [];
}

export async function fetchSystemActions(): Promise<any[]> {
  try {
    const res = await safeJsonFetch<{ success: boolean; actions?: any[] }>('/api/actions');
    if (res && res.success && Array.isArray(res.actions)) {
      return res.actions;
    }
  } catch (err) {
    console.warn('[Actions Service] System actions fetch notice:', err);
  }
  return [];
}

export interface PaginatedMembershipFeeDirectoryResult {
  rows: any[];
  totalCount: number;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

export async function fetchMembershipFeeDirectory(options?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  month?: number;
  year?: number;
  role?: string;
  badgeId?: string;
}): Promise<PaginatedMembershipFeeDirectoryResult | null> {
  try {
    const params = new URLSearchParams();
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.search) params.set('search', options.search);
    if (options?.status && options.status !== 'all') params.set('status', options.status);
    if (options?.month) params.set('month', String(options.month));
    if (options?.year) params.set('year', String(options.year));
    if (options?.role) params.set('role', options.role);
    if (options?.badgeId) params.set('badgeId', options.badgeId);

    const res = await safeJsonFetch<{
      success: boolean;
      rows?: any[];
      pagination?: any;
      totalCount?: number;
    }>(`/api/membership-fees?${params.toString()}`);

    if (res && res.success && Array.isArray(res.rows)) {
      return {
        rows: res.rows,
        totalCount: res.totalCount ?? res.rows.length,
        pagination: res.pagination || {
          currentPage: options?.page || 1,
          pageSize: options?.limit || 10,
          totalPages: Math.ceil((res.totalCount ?? res.rows.length) / (options?.limit || 10)) || 1,
          totalCount: res.totalCount ?? res.rows.length,
        },
      };
    }
  } catch (err) {
    console.warn('[Membership Fee Service] Server-side fetch notice:', err);
  }
  return null;
}



