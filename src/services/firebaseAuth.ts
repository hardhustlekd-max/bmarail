import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth,
  AuthError,
} from 'firebase/auth';
import { firebaseConfig, upsertDocument, getDocument, fetchAllDocuments } from '../db/firebase.ts';
import { SystemUser, UserRole } from '../types.ts';

const USERS_COLLECTION = 'users';

let firebaseAppInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

/**
 * Returns the initialized Firebase Auth instance.
 */
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    firebaseAppInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(firebaseAppInstance);
  }
  return authInstance;
}

/**
 * Interface for login response
 */
export interface FirebaseAuthResult {
  success: boolean;
  user?: SystemUser;
  firebaseUser?: FirebaseUser;
  error?: string;
}

/**
 * Helper to map Firebase Auth error codes to user-friendly messages.
 */
function mapAuthErrorToMessage(err: any): string {
  if (!err) return 'An unknown authentication error occurred.';
  const code = err.code || err.message || '';

  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists in Enforcement Pro.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact the administrator.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connection.';
    default:
      return err.message || 'Authentication failed. Please try again.';
  }
}

/**
 * Authenticates a system user using Firebase signInWithEmailAndPassword.
 * Also retrieves or creates the associated user profile in Firestore.
 */
export async function loginWithFirebaseAuth(
  email: string,
  password: string,
  preferredRole?: UserRole
): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  const cleanEmail = email.trim().toLowerCase();

  try {
    const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const fbUser = userCredential.user;

    // Retrieve system user profile from Firestore users collection
    let profile = await getDocument<SystemUser>(USERS_COLLECTION, fbUser.uid);

    if (!profile) {
      // Create fallback profile if document does not exist yet
      const badgeId = fbUser.email ? fbUser.email.split('@')[0].toUpperCase() : 'EMP-' + fbUser.uid.substring(0, 5);
      profile = {
        uid: fbUser.uid,
        email: fbUser.email || cleanEmail,
        badgeId,
        role: preferredRole || 'clerk',
        fullName: fbUser.displayName || email.split('@')[0],
        lastLoginAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await upsertDocument(USERS_COLLECTION, fbUser.uid, profile);
    } else {
      // Update last login timestamp
      const now = new Date().toISOString();
      profile.lastLoginAt = now;
      await upsertDocument(USERS_COLLECTION, fbUser.uid, { lastLoginAt: now });
    }

    return {
      success: true,
      user: profile,
      firebaseUser: fbUser,
    };
  } catch (err: any) {
    console.error('[FirebaseAuth] loginWithFirebaseAuth error:', err);
    return {
      success: false,
      error: mapAuthErrorToMessage(err),
    };
  }
}

/**
 * Creates a new system user using Firebase createUserWithEmailAndPassword.
 * Persists the user's role, badge ID, and profile metadata to Firestore.
 */
export async function registerWithFirebaseAuth(
  email: string,
  password: string,
  fullName: string,
  badgeId: string,
  role: UserRole = 'clerk'
): Promise<FirebaseAuthResult> {
  const auth = getFirebaseAuth();
  const cleanEmail = email.trim().toLowerCase();
  const cleanBadge = badgeId.trim().toUpperCase();

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const fbUser = userCredential.user;

    const newSystemUser: SystemUser = {
      uid: fbUser.uid,
      email: fbUser.email || cleanEmail,
      badgeId: cleanBadge,
      fullName: fullName.trim(),
      role,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    // Store user record in Firestore
    await upsertDocument(USERS_COLLECTION, fbUser.uid, newSystemUser);

    return {
      success: true,
      user: newSystemUser,
      firebaseUser: fbUser,
    };
  } catch (err: any) {
    console.error('[FirebaseAuth] registerWithFirebaseAuth error:', err);
    return {
      success: false,
      error: mapAuthErrorToMessage(err),
    };
  }
}

/**
 * Signs out the currently authenticated Firebase user.
 */
export async function logoutFirebaseAuth(): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    await signOut(auth);
  } catch (err) {
    console.warn('[FirebaseAuth] Error signing out:', err);
  }
}

/**
 * Returns the currently signed in Firebase user, or null if none.
 */
export function getCurrentFirebaseAuthUser(): FirebaseUser | null {
  const auth = getFirebaseAuth();
  return auth.currentUser;
}

/**
 * Subscribes to Firebase Authentication state changes.
 */
export function onFirebaseAuthChange(
  callback: (user: FirebaseUser | null) => void
): () => void {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

/**
 * Fetches all user profiles from the Firestore users collection.
 */
export async function fetchAllFirebaseAuthUsers(): Promise<SystemUser[]> {
  try {
    const users = await fetchAllDocuments<SystemUser>(USERS_COLLECTION);
    return users;
  } catch (err) {
    console.error('[FirebaseAuth] Error fetching users list:', err);
    return [];
  }
}
