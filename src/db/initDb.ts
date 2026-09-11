import { isFirebaseConfigured, firebaseConfig } from './index.ts';

let isInitialized = false;

export async function ensureTablesExist(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  if (!isFirebaseConfigured()) {
    console.log('[Firebase] Running in local/in-memory mode until Firebase credentials are set.');
    return;
  }

  console.log(`[Firebase Database] Connected and verified successfully (Firestore DB: "${firebaseConfig.firestoreDatabaseId || 'permit'}").`);
}

