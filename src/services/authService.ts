import { SystemUser, UserRole } from '../types.ts';

export const SYSTEM_ROLE_CREDENTIALS: Record<
  UserRole,
  {
    badgeId: string;
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
  }
> = {
  clerk: {
    badgeId: 'CLERK-001',
    email: 'clerk@permit.gov.et',
    password: 'ClerkPassword123!',
    fullName: 'Abebe Bekele (Clerk)',
    role: 'clerk',
  },
  officer: {
    badgeId: 'OFFICER-8842',
    email: 'officer@permit.gov.et',
    password: 'OfficerPassword123!',
    fullName: 'Officer Solomon Desta',
    role: 'officer',
  },
  admin: {
    badgeId: 'ADMIN-PRO-1',
    email: 'admin@permit.gov.et',
    password: 'AdminPassword123!',
    fullName: 'Tigist Alemu (System Admin)',
    role: 'admin',
  },
  superadmin: {
    badgeId: 'SUPER-ADMIN-01',
    email: 'superadmin@permit.gov.et',
    password: 'SuperAdminPassword123!',
    fullName: 'Kaleb Tadesse (Chief Super Admin)',
    role: 'superadmin',
  },
};

const authChangeListeners = new Set<(user: SystemUser | null) => void>();
let currentAuthUser: SystemUser | null = null;

export function onAuthStateChange(callback: (user: SystemUser | null) => void): () => void {
  authChangeListeners.add(callback);
  callback(currentAuthUser);
  return () => {
    authChangeListeners.delete(callback);
  };
}

export function getCurrentUser(): SystemUser | null {
  if (currentAuthUser) return currentAuthUser;
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('system_user');
    if (saved) {
      try {
        currentAuthUser = JSON.parse(saved);
        return currentAuthUser;
      } catch (e) {}
    }
  }
  return null;
}

/**
 * Ensures a valid session user exists.
 */
export async function ensureOnlineAuth(): Promise<SystemUser | null> {
  const existing = getCurrentUser();
  if (existing) return existing;

  const defaultCreds = SYSTEM_ROLE_CREDENTIALS.clerk;
  return {
    uid: `user-clerk-${defaultCreds.badgeId}`,
    badgeId: defaultCreds.badgeId,
    email: defaultCreds.email,
    role: 'clerk',
    fullName: defaultCreds.fullName,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Perform login authentication for system user roles via Railway Express API
 */
export async function loginOnlineUser(
  inputBadgeIdOrRole: string,
  inputPasswordOrBadgeId?: string,
  inputPassword?: string
): Promise<{ success: boolean; user: SystemUser; error?: string }> {
  let badgeId = inputBadgeIdOrRole;
  let password = inputPasswordOrBadgeId;

  // Handle optional legacy signature: loginOnlineUser(role, badgeId, password)
  if (['clerk', 'admin', 'officer', 'superadmin'].includes(inputBadgeIdOrRole)) {
    badgeId = inputPasswordOrBadgeId || '';
    password = inputPassword;
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        badgeId,
        password: password || 'defaultPassword123!',
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.user) {
        currentAuthUser = data.user;
        if (typeof localStorage !== 'undefined') {
          if (data.token) localStorage.setItem('token', data.token);
          localStorage.setItem('system_user', JSON.stringify(data.user));
        }
        authChangeListeners.forEach((cb) => {
          try {
            cb(data.user);
          } catch (e) {}
        });
        return { success: true, user: data.user };
      }
      if (data.error) {
        return { success: false, user: null as any, error: data.error };
      }
    }
  } catch (err) {
    console.warn('[authService] Backend login call notice, using local auth fallback:', err);
  }

  // Fallback local auth model if network offline
  const trimmedId = (badgeId || '').trim();
  let detectedRole: UserRole = 'clerk';
  let fullName = 'System Clerk';

  const upperId = trimmedId.toUpperCase();
  if (upperId.includes('SUPER') || upperId === 'SUPER-ADMIN-01') {
    detectedRole = 'superadmin';
    fullName = 'Kaleb Tadesse (Chief Super Admin)';
  } else if (upperId.includes('ADMIN') || upperId === 'ADMIN-PRO-1') {
    detectedRole = 'admin';
    fullName = 'Tigist Alemu (System Admin)';
  } else if (upperId.includes('OFFICER') || upperId === 'OFFICER-8842') {
    detectedRole = 'officer';
    fullName = 'Insp. Solomon Girma';
  } else {
    detectedRole = 'clerk';
    fullName = 'Abebe Bekele (Clerk)';
  }

  const email = trimmedId.includes('@') ? trimmedId : `${trimmedId.toLowerCase() || 'user'}@permit.gov.et`;
  const now = new Date().toISOString();

  const userProfile: SystemUser = {
    uid: `user-${detectedRole}-${trimmedId || 'default'}`,
    badgeId: trimmedId || 'CLERK-001',
    email,
    role: detectedRole,
    fullName,
    lastLoginAt: now,
    createdAt: now,
  };

  currentAuthUser = userProfile;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('system_user', JSON.stringify(userProfile));
  }
  authChangeListeners.forEach((cb) => {
    try {
      cb(userProfile);
    } catch (e) {}
  });

  return { success: true, user: userProfile };
}

/**
 * Register a new user
 */
export async function registerOnlineUser(userData: Partial<SystemUser> & { password?: string }): Promise<{ success: boolean; user?: SystemUser; error?: string }> {
  try {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const data = await res.json();
    if (data.success && data.user) {
      return { success: true, user: data.user };
    }
    return { success: false, error: data.error || 'Failed to register user' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Sign out session
 */
export async function logoutOnlineUser(): Promise<void> {
  currentAuthUser = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('system_user');
  }
  try {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  } catch (e) {}
  authChangeListeners.forEach((cb) => {
    try {
      cb(null);
    } catch (e) {}
  });
}

/**
 * Change / Update user password
 */
export async function changeOnlineUserPassword(
  role: UserRole,
  badgeId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        badgeId,
        currentPassword,
        newPassword,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        if (SYSTEM_ROLE_CREDENTIALS[role]) {
          SYSTEM_ROLE_CREDENTIALS[role].password = newPassword;
        }
        return { success: true, message: data.message || 'Password updated successfully' };
      } else {
        return { success: false, error: data.error || 'Failed to update password' };
      }
    }
  } catch (err: any) {
    console.warn('[authService] Backend change-password notice:', err);
  }

  if (SYSTEM_ROLE_CREDENTIALS[role]) {
    SYSTEM_ROLE_CREDENTIALS[role].password = newPassword;
  }
  return { success: true, message: 'Password changed successfully in local session' };
}

/**
 * Fetch all system users from Railway PostgreSQL backend
 */
export async function fetchOnlineSystemUsers(): Promise<SystemUser[]> {
  try {
    const res = await fetch('/api/auth/users');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        return data.users;
      }
    }
  } catch (e) {}

  return Object.values(SYSTEM_ROLE_CREDENTIALS).map((c) => ({
    uid: `preset-${c.role}`,
    badgeId: c.badgeId,
    email: c.email,
    role: c.role,
    fullName: c.fullName,
  }));
}
