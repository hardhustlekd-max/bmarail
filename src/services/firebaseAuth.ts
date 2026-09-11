/**
 * Railway Authentication Adapter
 * Replaces Firebase Client Auth with custom JWT authentication
 */
import { SystemUser, UserRole } from '../types.ts';
import {
  loginOnlineUser,
  registerOnlineUser,
  logoutOnlineUser,
  getCurrentUser,
  onAuthStateChange,
  fetchOnlineSystemUsers,
} from './authService.ts';

export const loginWithFirebaseAuth = loginOnlineUser;
export const registerWithFirebaseAuth = registerOnlineUser;
export const logoutFirebaseAuth = logoutOnlineUser;
export const getCurrentFirebaseAuthUser = getCurrentUser;
export const onFirebaseAuthChange = onAuthStateChange;
export const fetchAllFirebaseAuthUsers = fetchOnlineSystemUsers;

export function isFirebaseConfigured(): boolean {
  return true;
}
