import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { HomePage } from './components/HomePage';
import { Language, UserRole } from './types';
import {
  getStoredAuthSession,
  saveAuthSession,
  getStoredLang,
  saveLang,
  getStoredTheme,
  saveTheme,
  saveActivePage,
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
} from './services/dbService';

export default function App() {
  const [lang, setLang] = useState<Language>(() => getStoredLang());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredTheme());

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
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const savedSession = getStoredAuthSession();
  const [isLoggedIn, setIsLoggedIn] = useState(savedSession?.isLoggedIn ?? false);
  const [userBadgeId, setUserBadgeId] = useState(savedSession?.userBadgeId ?? '');
  const [userRole, setUserRole] = useState<UserRole>(savedSession?.userRole ?? 'clerk');

  // Restore state and authentication session on load
  useEffect(() => {
    // 1. Immediately restore local storage cached state
    loadStateFromLocalStorage();

    // 2. Synchronize critical startup configuration with cloud DB
    syncCriticalStartup().catch((err) => {
      console.warn('App mount sync notice:', err);
    });

    if (savedSession?.isLoggedIn) {
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

  const handleLogout = () => {
    // Ensure all records in memory are saved to local storage before session changes
    saveStateToLocalStorage();
    saveActivePage('dashboard');
    setIsLoggedIn(false);
    setUserBadgeId('');
    saveAuthSession(null);
    logoutOnlineUser();
  };

  const handleSwitchRole = (newRole: UserRole) => {
    setUserRole(newRole);
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
        <HomePage
          userBadgeId={userBadgeId}
          userRole={userRole}
          currentLang={lang}
          currentTheme={theme}
          onToggleLang={toggleLanguage}
          onToggleTheme={toggleTheme}
          onLogout={handleLogout}
          onSwitchRole={handleSwitchRole}
        />
      ) : (
        <LoginPage
          currentLang={lang}
          currentTheme={theme}
          onToggleLang={toggleLanguage}
          onToggleTheme={toggleTheme}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}

