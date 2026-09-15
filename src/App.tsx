import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { CrashNotificationModal } from './components/CrashNotificationModal';
import { AutoLogoutManager, INACTIVITY_TIMEOUT_MS } from './components/AutoLogoutManager';
import { Language, UserRole } from './types';
import {
  getStoredAuthSession,
  saveAuthSession,
  getStoredLang,
  saveLang,
  getStoredTheme,
  saveTheme,
  saveActivePage,
  getStoredLastActivity,
  saveStoredLastActivity,
  clearStoredLastActivity,
  getStoredSessionExpiredReason,
  saveStoredSessionExpiredReason,
} from './utils/storage';
import {
  ensureOnlineAuth,
  loginOnlineUser,
  logoutOnlineUser,
} from './services/authService';
import {
  loadStateFromLocalStorage,
  saveStateToLocalStorage,
  syncCriticalStartup,
  subscribeSettings,
  saveSettingsToDb,
} from './services/dbService';

export default function App() {
  const [lang, setLang] = useState<Language>(() => getStoredLang());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredTheme());

  // Listen to DB settings to apply theme globally in real-time across devices/tabs
  useEffect(() => {
    const unsub = subscribeSettings((settings) => {
      if (settings && settings.themeMode && (settings.themeMode === 'light' || settings.themeMode === 'dark')) {
        setTheme(settings.themeMode);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
    saveTheme(theme);
  }, [theme]);

  // Dynamically configure system language on the document root and body
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-lang', lang);
    document.documentElement.setAttribute('data-system-lang', lang);

    if (lang === 'am') {
      document.documentElement.classList.add('system-lang-am', 'lang-am');
      document.documentElement.classList.remove('system-lang-en', 'lang-en');
      document.body.classList.add('system-lang-am', 'lang-am');
      document.body.classList.remove('system-lang-en', 'lang-en');
    } else {
      document.documentElement.classList.remove('system-lang-am', 'lang-am');
      document.documentElement.classList.add('system-lang-en', 'lang-en');
      document.body.classList.remove('system-lang-am', 'lang-am');
      document.body.classList.add('system-lang-en', 'lang-en');
    }
  }, [lang]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      saveSettingsToDb({ themeMode: next }).catch((err) => {
        console.warn('Failed to save theme toggle to DB:', err);
      });
      return next;
    });
  };

  const savedSession = getStoredAuthSession();
  const initialLastActivity = getStoredLastActivity();
  const isSessionExpiredOnBoot =
    Boolean(savedSession?.isLoggedIn) &&
    Date.now() - initialLastActivity >= INACTIVITY_TIMEOUT_MS;

  // Clear stale session on boot if user was away for more than 15 minutes
  if (isSessionExpiredOnBoot && savedSession) {
    saveAuthSession(null);
    clearStoredLastActivity();
  }

  const [isLoggedIn, setIsLoggedIn] = useState(
    savedSession?.isLoggedIn && !isSessionExpiredOnBoot ? true : false
  );
  const [userBadgeId, setUserBadgeId] = useState(
    savedSession && !isSessionExpiredOnBoot ? savedSession.userBadgeId : ''
  );
  const [userRole, setUserRole] = useState<UserRole>(
    savedSession && !isSessionExpiredOnBoot ? savedSession.userRole : 'clerk'
  );
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(
    () => {
      if (isSessionExpiredOnBoot) {
        return getStoredLang() === 'am'
          ? 'የስራ ክፍለ ጊዜዎ ከ15 ደቂቃ እንቅስቃሴ አልባነት በኋላ ለደህንነት ሲባል ተዘግቷል። እባክዎ እንደገና ይግቡ።'
          : 'Your session was cleared after 15 minutes of inactivity for security. Please sign in again.';
      }
      return getStoredSessionExpiredReason();
    }
  );

  // Restore state and authentication session on load
  useEffect(() => {
    // 1. Immediately restore local storage cached state
    loadStateFromLocalStorage();

    // 2. Synchronize critical startup configuration with cloud DB
    syncCriticalStartup().catch((err) => {
      console.warn('App mount sync notice:', err);
    });

    if (savedSession?.isLoggedIn && !isSessionExpiredOnBoot) {
      saveStoredLastActivity(Date.now());
      loginOnlineUser(savedSession.userRole, savedSession.userBadgeId).catch(() => {
        ensureOnlineAuth();
      });
    } else {
      ensureOnlineAuth();
    }
  }, []);

  const toggleLanguage = () => {
    setLang((prev) => {
      const next = prev === 'am' ? 'en' : 'am';
      saveLang(next);
      return next;
    });
  };

  const handleLoginSuccess = (badgeId: string, role: UserRole) => {
    setUserBadgeId(badgeId);
    setUserRole(role);
    setIsLoggedIn(true);
    setSessionExpiredMessage(null);
    saveStoredSessionExpiredReason(null);
    saveStoredLastActivity(Date.now());
    saveAuthSession({
      isLoggedIn: true,
      userBadgeId: badgeId,
      userRole: role,
    });
    // Restore and persist state automatically on sign-in
    loadStateFromLocalStorage();
    saveStateToLocalStorage();
    syncCriticalStartup().catch(() => {});
  };

  const handleLogout = (reason: 'inactivity' | 'manual' = 'manual') => {
    // Ensure all records in memory are saved to local storage before session changes
    saveStateToLocalStorage();
    saveActivePage('dashboard');
    setIsLoggedIn(false);
    setUserBadgeId('');
    saveAuthSession(null);
    clearStoredLastActivity();
    logoutOnlineUser();

    if (reason === 'inactivity') {
      const message =
        lang === 'am'
          ? 'የስራ ክፍለ ጊዜዎ ከ15 ደቂቃ እንቅስቃሴ አልባነት በኋላ ለደህንነት ሲባል ተዘግቷል። እባክዎ እንደገና ይግቡ።'
          : 'Your session was cleared after 15 minutes of inactivity for security. Please sign in again.';
      setSessionExpiredMessage(message);
      saveStoredSessionExpiredReason(message);
    } else {
      setSessionExpiredMessage(null);
      saveStoredSessionExpiredReason(null);
    }
  };

  const handleSwitchRole = (newRole: UserRole) => {
    setUserRole(newRole);
    saveStoredLastActivity(Date.now());
    saveAuthSession({
      isLoggedIn: true,
      userBadgeId,
      userRole: newRole,
    });
    saveStateToLocalStorage();
    loginOnlineUser(newRole, userBadgeId);
  };

  return (
    <div
      className={`h-screen h-[100dvh] max-h-screen max-h-[100dvh] overflow-hidden bg-surface text-on-surface flex flex-col ${
        lang === 'am' ? 'system-lang-am lang-am font-ethiopic' : 'system-lang-en lang-en font-sans'
      }`}
      lang={lang}
      data-system-lang={lang}
    >
      {isLoggedIn ? (
        <>
          <HomePage
            userBadgeId={userBadgeId}
            userRole={userRole}
            currentLang={lang}
            currentTheme={theme}
            onToggleLang={toggleLanguage}
            onToggleTheme={toggleTheme}
            onLogout={() => handleLogout('manual')}
            onSwitchRole={handleSwitchRole}
          />
          {/* 15-Minute Inactivity Auto-Logout Security Watcher & Warning Dialog */}
          <AutoLogoutManager
            isAmharic={lang === 'am'}
            onAutoLogout={() => handleLogout('inactivity')}
            onManualLogout={() => handleLogout('manual')}
          />
        </>
      ) : (
        <LoginPage
          currentLang={lang}
          currentTheme={theme}
          onToggleLang={toggleLanguage}
          onToggleTheme={toggleTheme}
          onLoginSuccess={handleLoginSuccess}
          sessionExpiredMessage={sessionExpiredMessage}
          onClearSessionExpiredMessage={() => {
            setSessionExpiredMessage(null);
            saveStoredSessionExpiredReason(null);
          }}
        />
      )}

      {/* Global Crash Report & Runtime Error Popup Notification */}
      <CrashNotificationModal currentLang={lang} />
    </div>
  );
}

