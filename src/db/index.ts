import dotenv from 'dotenv';
import {
  isFirebaseConfigured,
  getFirestoreDb,
  FIREBASE_COLLECTIONS,
  fetchAllDocuments,
  getDocument,
  upsertDocument,
  updateDocumentFields,
  deleteDocument,
  subscribeCollectionDocs,
  handleFirestoreError,
  OperationType,
  firebaseConfig,
} from './firebase.ts';
import {
  ADMIN_COLLECTIONS,
  adminFetchAllDocuments,
  adminGetDocument,
  adminUpsertDocument,
  adminUpdateDocumentFields,
  adminDeleteDocument,
  adminClearCollection,
} from './firebaseAdmin.ts';

dotenv.config({ override: true });

export {
  isFirebaseConfigured,
  getFirestoreDb,
  getFirestoreDb as getAdminFirestoreDb,
  FIREBASE_COLLECTIONS,
  fetchAllDocuments,
  getDocument,
  upsertDocument,
  updateDocumentFields,
  deleteDocument,
  subscribeCollectionDocs,
  handleFirestoreError,
  OperationType,
  firebaseConfig,
  ADMIN_COLLECTIONS,
  adminFetchAllDocuments,
  adminGetDocument,
  adminUpsertDocument,
  adminUpdateDocumentFields,
  adminDeleteDocument,
  adminClearCollection,
};


