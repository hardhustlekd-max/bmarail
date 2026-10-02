import { UserRole, Language } from '../types';

export const KEYS = {
  AUTH: 'bd_motor_auth_session',
  LANG: 'bd_motor_lang',
  THEME: 'bd_motor_theme',
  ACTIVE_PAGE: 'bd_motor_active_page',
  APP_STATE: 'bd_motor_app_state_cache',
  LAST_ACK_RESET_EPOCH: 'bd_motor_last_ack_reset_epoch',
  LAST_ACTIVITY: 'bd_motor_last_activity',
  SESSION_EXPIRED_REASON: 'bd_motor_session_expired_reason',
};

/**
 * Media and document photo field identifiers.
 * In a system-wide text-only local cache, these fields are sanitized so heavy image
 * binaries/base64 strings are never stored in localStorage or IndexedDB.
 */
const MEDIA_FIELD_NAMES = new Set([
  'userportraitphoto',
  'userportraitthumbnail',
  'ownerphoto',
  'nationalidphoto',
  'nationalidbackphoto',
  'drivinglicensephoto',
  'drivingpermitphoto',
  'receiptscreenshot',
  'evidencephoto',
  'portraitphoto',
  'licensephoto',
  'permitphoto',
  'idphoto',
  'idbackphoto',
]);

/**
 * Recursively strips any photos, document scans, base64 data URLs, or media payloads
 * from any object, array, or string before it is written to local storage or IndexedDB.
 * Enforces strictly text-only local caching: NO photos or documents are ever cached locally.
 */
export function sanitizeTextOnlyStorage<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    const trimmed = data.trim();
    // Aggressive strip of ANY data URL or long base64 string
    if (
      trimmed.startsWith('data:') ||
      trimmed.startsWith('blob:') ||
      (trimmed.length > 500 && /^[A-Za-z0-9+/=]{200,}$/.test(trimmed))
    ) {
      return '' as unknown as T;
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeTextOnlyStorage(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(data as Record<string, any>)) {
      const lowerKey = key.toLowerCase().replace(/[^a-z]/g, '');
      if (MEDIA_FIELD_NAMES.has(lowerKey)) {
        // Stop caching photos and documents locally: only text from DB is cached locally
        result[key] = '';
      } else {
        result[key] = sanitizeTextOnlyStorage(val);
      }
    }
    return result as T;
  }

  return data;
}

export interface AuthSession {
  isLoggedIn: boolean;
  userBadgeId: string;
  userRole: UserRole;
  lastActiveTimestamp?: number;
}

export function getStoredItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? sanitizeTextOnlyStorage(JSON.parse(item)) : defaultValue;
  } catch (e) {
    console.warn(`Error reading localStorage key "${key}":`, e);
    return defaultValue;
  }
}

export function setStoredItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    const sanitized = sanitizeTextOnlyStorage(value);
    localStorage.setItem(key, JSON.stringify(sanitized));
  } catch (e) {
    console.warn(`Error writing localStorage key "${key}":`, e);
  }
}

export function removeStoredItem(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`Error removing localStorage key "${key}":`, e);
  }
}

export function getStoredLastAckResetEpoch(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(KEYS.LAST_ACK_RESET_EPOCH);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveStoredLastAckResetEpoch(epoch: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEYS.LAST_ACK_RESET_EPOCH, String(epoch));
  } catch (e) {
    console.warn('Error saving last ack reset epoch:', e);
  }
}

export function clearAllLocalStoredData(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEYS.APP_STATE);
  } catch (e) {
    console.warn('Error clearing local app state:', e);
  }
}

// UI & Session State
export function getStoredAuthSession(): AuthSession | null {
  return getStoredItem<AuthSession | null>(KEYS.AUTH, null);
}

export function saveAuthSession(session: AuthSession | null): void {
  if (session) {
    setStoredItem(KEYS.AUTH, session);
  } else {
    removeStoredItem(KEYS.AUTH);
  }
}

export function getStoredLang(): Language {
  return getStoredItem<Language>(KEYS.LANG, 'am');
}

export function saveLang(lang: Language): void {
  setStoredItem(KEYS.LANG, lang);
}

export function getStoredTheme(): 'light' | 'dark' {
  return getStoredItem<'light' | 'dark'>(KEYS.THEME, 'light');
}

export function saveTheme(theme: 'light' | 'dark'): void {
  setStoredItem(KEYS.THEME, theme);
}

export function getStoredActivePage(): string {
  const page = getStoredItem<string>(KEYS.ACTIVE_PAGE, 'dashboard');
  if (page === 'settings') return 'dashboard';
  return page;
}

export function saveActivePage(page: string): void {
  setStoredItem(KEYS.ACTIVE_PAGE, page);
}

export function getStoredLastActivity(): number {
  if (typeof window === 'undefined') return Date.now();
  try {
    const raw = localStorage.getItem(KEYS.LAST_ACTIVITY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
  } catch {
    return Date.now();
  }
}

export function saveStoredLastActivity(time: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEYS.LAST_ACTIVITY, String(time));
  } catch (e) {
    console.warn('Error saving last activity:', e);
  }
}

export function clearStoredLastActivity(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEYS.LAST_ACTIVITY);
  } catch (e) {}
}

export function getStoredSessionExpiredReason(): string | null {
  return getStoredItem<string | null>(KEYS.SESSION_EXPIRED_REASON, null);
}

export function saveStoredSessionExpiredReason(reason: string | null): void {
  if (reason) {
    setStoredItem(KEYS.SESSION_EXPIRED_REASON, reason);
  } else {
    removeStoredItem(KEYS.SESSION_EXPIRED_REASON);
  }
}

