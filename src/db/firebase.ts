/**
 * Railway PostgreSQL & Express REST Database Client
 * Replaces Firebase Firestore SDK with standard REST API calls to PostgreSQL backend
 */

export const FIREBASE_COLLECTIONS = {
  REGISTRATIONS: 'motorcycle_registrations',
  OFFICERS: 'officer_assignments',
  PRINT_ORDERS: 'print_batch_orders',
  VERIFICATIONS: 'verification_logs',
  UNREGISTERED_REPORTS: 'unregistered_vehicle_reports',
  PAYMENT_RECEIPTS: 'payment_receipts',
  SETTINGS: 'system_settings',
  AUDIT_LOGS: 'system_audit_logs',
  USERS: 'system_users',
  NOTIFICATION_STATES: 'notification_states',
} as const;

export const COLLECTIONS = FIREBASE_COLLECTIONS;

export const firebaseConfig = {
  projectId: 'railway-postgresql-database',
  apiKey: 'railway-jwt-auth',
  firestoreDatabaseId: 'permit',
  storageBucket: 'railway-storage-bucket',
};

export function isFirebaseConfigured(): boolean {
  return true; // PostgreSQL backend is fully configured
}

export function isFirestoreOnline(): boolean {
  return true;
}

export function getFirestoreDb(): any {
  return null;
}

export function getFirebaseStorage(): any {
  return null;
}

export enum OperationType {
  FETCH = 'FETCH',
  UPSERT = 'UPSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  SUBSCRIBE = 'SUBSCRIBE',
}

export function handleFirestoreError(error: any, op: OperationType, coll?: string): void {
  console.warn(`[Database] Operation ${op} on ${coll || 'general'}:`, error?.message || error);
}

/**
 * Helper to get Auth token header
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

/**
 * Fetch all documents from a table via Express API
 */
export async function fetchAllDocuments<T = any>(collectionName: string): Promise<T[]> {
  try {
    let url = '/api/sync';
    if (collectionName === FIREBASE_COLLECTIONS.REGISTRATIONS) url = '/api/registrations';
    else if (collectionName === FIREBASE_COLLECTIONS.OFFICERS) url = '/api/officers';
    else if (collectionName === FIREBASE_COLLECTIONS.PRINT_ORDERS) url = '/api/print-orders';
    else if (collectionName === FIREBASE_COLLECTIONS.UNREGISTERED_REPORTS) url = '/api/unregistered-reports';
    else if (collectionName === FIREBASE_COLLECTIONS.VERIFICATIONS) url = '/api/verification-logs';
    else if (collectionName === FIREBASE_COLLECTIONS.PAYMENT_RECEIPTS) url = '/api/payment-receipts';
    else if (collectionName === FIREBASE_COLLECTIONS.USERS) url = '/api/auth/users';
    else if (collectionName === FIREBASE_COLLECTIONS.AUDIT_LOGS) url = '/api/audit-logs';

    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) return [];
    const data = await res.json();

    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data.registrations)) return data.registrations as T[];
    if (Array.isArray(data.officers)) return data.officers as T[];
    if (Array.isArray(data.printOrders)) return data.printOrders as T[];
    if (Array.isArray(data.reports)) return data.reports as T[];
    if (Array.isArray(data.verifications)) return data.verifications as T[];
    if (Array.isArray(data.receipts)) return data.receipts as T[];
    if (Array.isArray(data.users)) return data.users as T[];
    if (Array.isArray(data.logs)) return data.logs as T[];
    return [];
  } catch (err) {
    console.warn(`[Database] fetchAllDocuments notice for ${collectionName}:`, err);
    return [];
  }
}

/**
 * Fetch single document by ID
 */
export async function getDocument<T = any>(collectionName: string, docId: string): Promise<T | null> {
  if (collectionName === FIREBASE_COLLECTIONS.SETTINGS) {
    try {
      const res = await fetch('/api/settings', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        return data.settings as T;
      }
    } catch (e) {}
  }
  const all = await fetchAllDocuments<T>(collectionName);
  return (all as any[]).find((item) => item.id === docId || item.uid === docId) || null;
}

/**
 * Upsert a document to PostgreSQL
 */
export async function upsertDocument(collectionName: string, docId: string, data: Record<string, any>): Promise<void> {
  let url = '/api/registrations';
  let payload: any = { ...data, id: docId };

  if (collectionName === FIREBASE_COLLECTIONS.REGISTRATIONS) url = '/api/registrations';
  else if (collectionName === FIREBASE_COLLECTIONS.OFFICERS) url = '/api/officers';
  else if (collectionName === FIREBASE_COLLECTIONS.PRINT_ORDERS) url = '/api/print-orders';
  else if (collectionName === FIREBASE_COLLECTIONS.UNREGISTERED_REPORTS) url = '/api/unregistered-reports';
  else if (collectionName === FIREBASE_COLLECTIONS.VERIFICATIONS) url = '/api/verification-logs';
  else if (collectionName === FIREBASE_COLLECTIONS.PAYMENT_RECEIPTS) url = '/api/payment-receipts';
  else if (collectionName === FIREBASE_COLLECTIONS.SETTINGS) url = '/api/settings';
  else if (collectionName === FIREBASE_COLLECTIONS.USERS) url = '/api/auth/users';
  else if (collectionName === FIREBASE_COLLECTIONS.AUDIT_LOGS) url = '/api/audit-logs';
  else if (collectionName === FIREBASE_COLLECTIONS.NOTIFICATION_STATES) url = '/api/notifications/state';

  await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn(`[Database] upsertDocument error on ${collectionName}:`, err);
  });
}

/**
 * Update document fields in PostgreSQL
 */
export async function updateDocumentFields(collectionName: string, docId: string, updates: Record<string, any>): Promise<void> {
  let url = '/api/registrations/status';
  let payload: any = { id: docId, ...updates };

  if (collectionName === FIREBASE_COLLECTIONS.REGISTRATIONS) {
    url = '/api/registrations/update';
    payload = { id: docId, updates };
  } else if (collectionName === FIREBASE_COLLECTIONS.OFFICERS) {
    url = '/api/officers/update';
    payload = { id: docId, updates };
  } else if (collectionName === FIREBASE_COLLECTIONS.PRINT_ORDERS) {
    url = '/api/print-orders/status';
    payload = { id: docId, ...updates };
  } else if (collectionName === FIREBASE_COLLECTIONS.UNREGISTERED_REPORTS) {
    url = '/api/unregistered-reports/status';
    payload = { id: docId, ...updates };
  } else if (collectionName === FIREBASE_COLLECTIONS.USERS) {
    url = '/api/auth/users/update';
    payload = { id: docId, updates };
  }

  await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn(`[Database] updateDocumentFields error on ${collectionName}:`, err);
  });
}

/**
 * Delete a document from PostgreSQL
 */
export async function deleteDocument(collectionName: string, docId: string): Promise<void> {
  let url = `/api/registrations/${docId}`;
  if (collectionName === FIREBASE_COLLECTIONS.REGISTRATIONS) url = `/api/registrations/${docId}`;
  else if (collectionName === FIREBASE_COLLECTIONS.OFFICERS) url = `/api/officers/${docId}`;
  else if (collectionName === FIREBASE_COLLECTIONS.PAYMENT_RECEIPTS) url = `/api/payment-receipts/${docId}`;
  else if (collectionName === FIREBASE_COLLECTIONS.USERS) url = `/api/auth/users/${docId}`;

  await fetch(url, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  }).catch((err) => {
    console.warn(`[Database] deleteDocument error on ${collectionName}:`, err);
  });
}

/**
 * Polling subscription helper
 */
export function subscribeCollectionDocs<T = any>(
  collectionName: string,
  onNext: (docs: T[]) => void,
  onError?: (err: Error) => void
): () => void {
  let isSubscribed = true;

  const loadData = async () => {
    if (!isSubscribed) return;
    try {
      const docs = await fetchAllDocuments<T>(collectionName);
      if (isSubscribed) onNext(docs);
    } catch (err: any) {
      if (onError && isSubscribed) onError(err);
    }
  };

  loadData();
  const intervalId = setInterval(loadData, 10000); // 10s poll

  return () => {
    isSubscribed = false;
    clearInterval(intervalId);
  };
}
