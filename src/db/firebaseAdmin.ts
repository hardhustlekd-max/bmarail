import {
  firebaseConfig,
  FIREBASE_COLLECTIONS,
  fetchAllDocuments as clientFetchAll,
  getDocument as clientGetDoc,
  upsertDocument as clientUpsertDoc,
  updateDocumentFields as clientUpdateDoc,
  deleteDocument as clientDeleteDoc,
} from './firebase.ts';

export const ADMIN_COLLECTIONS = {
  ...FIREBASE_COLLECTIONS,
  USERS: 'users',
} as const;

export async function adminFetchAllDocuments<T = any>(collectionName: string): Promise<T[]> {
  return clientFetchAll<T>(collectionName);
}

export async function adminGetDocument<T = any>(collectionName: string, docId: string): Promise<T | null> {
  return clientGetDoc<T>(collectionName, docId);
}

export async function adminUpsertDocument(collectionName: string, docId: string, data: Record<string, any>): Promise<void> {
  return clientUpsertDoc(collectionName, docId, data);
}

export async function adminUpdateDocumentFields(collectionName: string, docId: string, updates: Record<string, any>): Promise<void> {
  return clientUpdateDoc(collectionName, docId, updates);
}

export async function adminDeleteDocument(collectionName: string, docId: string): Promise<void> {
  return clientDeleteDoc(collectionName, docId);
}

export async function adminClearCollection(collectionName: string): Promise<void> {
  const docs = await adminFetchAllDocuments(collectionName);
  await Promise.all(docs.map((item: any) => adminDeleteDocument(collectionName, item.id)));
}

