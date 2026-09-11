/**
 * Railway PostgreSQL Admin Database Adapter
 * Replaces Firebase Admin SDK with PostgreSQL database operations
 */
import {
  dbGetAll,
  dbGetById,
  dbUpsert,
  dbUpdateFields,
  dbDelete,
  dbClearTable,
} from '../server/db.ts';

export const ADMIN_COLLECTIONS = {
  REGISTRATIONS: 'motorcycle_registrations',
  OFFICERS: 'officer_assignments',
  PRINT_ORDERS: 'print_batch_orders',
  VERIFICATIONS: 'verification_logs',
  UNREGISTERED_REPORTS: 'unregistered_vehicle_reports',
  PAYMENT_RECEIPTS: 'payment_receipts',
  SETTINGS: 'system_settings',
  AUDIT_LOGS: 'system_audit_logs',
  USERS: 'system_users',
} as const;

export async function adminFetchAllDocuments<T = any>(collectionName: string): Promise<T[]> {
  return dbGetAll<T>(collectionName);
}

export async function adminGetDocument<T = any>(collectionName: string, docId: string): Promise<T | null> {
  return dbGetById<T>(collectionName, docId);
}

export async function adminUpsertDocument(collectionName: string, docId: string, data: Record<string, any>): Promise<void> {
  return dbUpsert(collectionName, docId, data);
}

export async function adminUpdateDocumentFields(collectionName: string, docId: string, updates: Record<string, any>): Promise<void> {
  return dbUpdateFields(collectionName, docId, updates);
}

export async function adminDeleteDocument(collectionName: string, docId: string): Promise<void> {
  return dbDelete(collectionName, docId);
}

export async function adminClearCollection(collectionName: string): Promise<void> {
  return dbClearTable(collectionName);
}
