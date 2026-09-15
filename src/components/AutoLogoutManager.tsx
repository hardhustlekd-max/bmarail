import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from './ui/Icon';
import {
  getStoredLastActivity,
  saveStoredLastActivity,
  KEYS,
} from '../utils/storage';

// 15 minutes of inactivity for security
export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
// Warning prompt starts 2 minutes (120 seconds) before the 15-minute auto-logout triggers
export const WARNING_BEFORE_LOGOUT_MS = 2 * 60 * 1000;
// Throttle background activity event listeners to avoid unnecessary storage writes
const ACTIVITY_THROTTLE_MS = 2000;

// Custom events to trigger/test from settings or anywhere in the app
export const EXTEND_SESSION_EVENT = 'bma-extend-session-event';
export const TEST_INACTIVITY_PROMPT_EVENT = 'bma-test-inactivity-prompt-event';

export function extendSessionManually(): void {
  saveStoredLastActivity(Date.now());
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EXTEND_SESSION_EVENT));
  }
}

export function triggerInactivityPromptPreview(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TEST_INACTIVITY_PROMPT_EVENT));
  }
}

interface AutoLogoutManagerProps {
  isAmharic: boolean;
  onAutoLogout: () => void;
  onManualLogout?: () => void;
}

export const AutoLogoutManager: React.FC<AutoLogoutManagerProps> = ({
  isAmharic,
  onAutoLogout,
  onManualLogout,
}) => {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);
  const [isTestPreview, setIsTestPreview] = useState(false);
  const [showExtensionToast, setShowExtensionToast] = useState(false);
  const extensionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastActiveRef = useRef<number>(getStoredLastActivity());
  const lastThrottleRef = useRef<number>(Date.now());
  const keepLoggedInButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the "Keep me logged in" button when modal appears
  useEffect(() => {
    if (showWarning) {
      // Small timeout to allow DOM render
      const timer = setTimeout(() => {
        keepLoggedInButtonRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showWarning]);

  // Show a brief, elegant non-disruptive toast when session is successfully extended
  const triggerToast = useCallback(() => {
    if (extensionToastTimerRef.current) {
      clearTimeout(extensionToastTimerRef.current);
    }
    setShowExtensionToast(true);
    extensionToastTimerRef.current = setTimeout(() => {
      setShowExtensionToast(false);
    }, 4000);
  }, []);

  // Record user activity (during normal usage before warning appears)
  const recordActivity = useCallback(() => {
    // If the warning dialog is currently active, do NOT silently dismiss it via random mouse movement;
    // user must explicitly click "Keep me logged in" or press Enter
    if (showWarning) return;

    const now = Date.now();
    lastActiveRef.current = now;

    if (now - lastThrottleRef.current > ACTIVITY_THROTTLE_MS) {
      lastThrottleRef.current = now;
      saveStoredLastActivity(now);
    }
  }, [showWarning]);

  // Explicit action: "Keep me logged in" - resets timer, clears modal, displays confirmation toast
  const handleKeepLoggedIn = useCallback(() => {
    const now = Date.now();
    lastActiveRef.current = now;
    lastThrottleRef.current = now;
    saveStoredLastActivity(now);
    setShowWarning(false);
    setIsTestPreview(false);
    triggerToast();
  }, [triggerToast]);

  // Immediate logout from prompt
  const handleImmediateLogout = useCallback(() => {
    setShowWarning(false);
    setIsTestPreview(false);
    if (onManualLogout) {
      onManualLogout();
    } else {
      onAutoLogout();
    }
  }, [onAutoLogout, onManualLogout]);

  useEffect(() => {
    // Initial sync on mount
    const initialLast = getStoredLastActivity();
    lastActiveRef.current = initialLast;
    saveStoredLastActivity(Date.now());

    // User interaction events to detect activity during normal browsing
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'scroll',
      'click',
    ];

    const handleUserInteraction = () => {
      recordActivity();
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleUserInteraction, { passive: true });
    });

    // Handle tab visibility change (e.g. computer waking from sleep)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const storedLast = getStoredLastActivity();
        lastActiveRef.current = storedLast;
        const elapsed = Date.now() - storedLast;

        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          onAutoLogout();
        } else if (elapsed >= INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS) {
          const timeLeft = INACTIVITY_TIMEOUT_MS - elapsed;
          setSecondsRemaining(Math.max(1, Math.ceil(timeLeft / 1000)));
          setShowWarning(true);
        } else {
          recordActivity();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Sync across browser tabs
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === KEYS.LAST_ACTIVITY && e.newValue) {
        const parsed = parseInt(e.newValue, 10);
        if (Number.isFinite(parsed) && parsed > lastActiveRef.current) {
          lastActiveRef.current = parsed;
          setShowWarning(false);
          setIsTestPreview(false);
        }
      }
      if (e.key === KEYS.AUTH && !e.newValue) {
        onAutoLogout();
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    // Listen for manual session extension events
    const handleManualExtendEvent = () => {
      lastActiveRef.current = Date.now();
      setShowWarning(false);
      setIsTestPreview(false);
      triggerToast();
    };
    window.addEventListener(EXTEND_SESSION_EVENT, handleManualExtendEvent);

    // Listen for test preview events
    const handleTestPreviewEvent = () => {
      setSecondsRemaining(119);
      setIsTestPreview(true);
      setShowWarning(true);
    };
    window.addEventListener(TEST_INACTIVITY_PROMPT_EVENT, handleTestPreviewEvent);

    // Periodic ticker (runs every 1 second)
    const interval = setInterval(() => {
      // If currently showing test preview, just decrement down to 0
      if (isTestPreview) {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            setShowWarning(false);
            setIsTestPreview(false);
            return 120;
          }
          return prev - 1;
        });
        return;
      }

      const now = Date.now();
      const currentLastActivity = Math.max(lastActiveRef.current, getStoredLastActivity());
      const elapsed = now - currentLastActivity;
      const timeLeft = INACTIVITY_TIMEOUT_MS - elapsed;

      if (timeLeft <= 0) {
        // 15-minute inactivity limit reached: clear session and auto-logout
        clearInterval(interval);
        setShowWarning(false);
        onAutoLogout();
      } else if (timeLeft <= WARNING_BEFORE_LOGOUT_MS) {
        // Inside warning window (last 2 minutes before the 15-min limit)
        const secs = Math.max(1, Math.ceil(timeLeft / 1000));
        setSecondsRemaining(secs);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserInteraction);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageEvent);
      window.removeEventListener(EXTEND_SESSION_EVENT, handleManualExtendEvent);
      window.removeEventListener(TEST_INACTIVITY_PROMPT_EVENT, handleTestPreviewEvent);
      if (extensionToastTimerRef.current) {
        clearTimeout(extensionToastTimerRef.current);
      }
    };
  }, [isTestPreview, onAutoLogout, recordActivity, triggerToast]);

  // Format mm:ss
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formattedCountdown = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  const progressPercent = Math.min(100, Math.max(0, (secondsRemaining / (WARNING_BEFORE_LOGOUT_MS / 1000)) * 100));

  return (
    <>
      {/* Toast Notification for Session Extension */}
      {showExtensionToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[999999] max-w-sm bg-surface-container-lowest dark:bg-slate-900 border border-emerald-500/40 rounded-xl shadow-2xl p-3.5 flex items-start gap-3 animate-in slide-in-from-bottom-3 duration-200"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="material-symbols-outlined text-[20px]">verified_user</Icon>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-on-surface dark:text-white">
              {isAmharic ? 'የስራ ክፍለ ጊዜዎ ተራዝሟል!' : 'Session Successfully Extended!'}
            </p>
            <p className="text-[11px] text-secondary dark:text-slate-300 mt-0.5 leading-relaxed">
              {isAmharic
                ? 'ተጨማሪ 15 ደቂቃዎች ተጨምረዋል። ስራዎን ያለማቋረጥ መቀጠል ይችላሉ።'
                : '15 minutes added to your session. You can continue working safely.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowExtensionToast(false)}
            className="text-outline hover:text-on-surface p-1 rounded cursor-pointer shrink-0"
            title={isAmharic ? 'ዝጋ' : 'Dismiss'}
          >
            <Icon className="material-symbols-outlined text-[16px]">close</Icon>
          </button>
        </div>
      )}

      {/* Main Inactivity Warning Modal: Prompts "Keep me logged in" */}
      {showWarning && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="inactivity-prompt-title"
          aria-describedby="inactivity-prompt-desc"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleKeepLoggedIn();
            }
          }}
        >
          <div className="w-full max-w-lg bg-surface-container-lowest dark:bg-slate-900 border border-amber-500/40 dark:border-amber-600/40 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Warning Header Bar with Pulsing Badge */}
            <div className="bg-amber-500/15 dark:bg-amber-950/40 border-b border-amber-500/30 px-5 sm:px-6 py-4 flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-amber-500/25 dark:bg-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                <Icon className="material-symbols-outlined text-[26px] animate-pulse">alarm</Icon>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    id="inactivity-prompt-title"
                    className="text-sm sm:text-base font-black text-amber-950 dark:text-amber-200 leading-tight"
                  >
                    {isAmharic ? 'ክፍለ ጊዜው ሊጠናቀቅ ነው፡ በመለያዎ እንዳሉ ይቀጥሉ?' : 'Session Expiring Soon: Keep Session Active?'}
                  </h3>
                  {isTestPreview && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                      Test Preview
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-400/80 font-semibold mt-0.5">
                  {isAmharic
                    ? 'የ15 ደቂቃ እንቅስቃሴ አልባነት የደህንነት ማብቂያ'
                    : '15-minute municipal inactivity security threshold'}
                </p>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 space-y-5 text-center">
              <p
                id="inactivity-prompt-desc"
                className="text-xs sm:text-sm text-secondary dark:text-slate-300 leading-relaxed max-w-md mx-auto"
              >
                {isAmharic
                  ? 'ላለፉት 13 ደቂቃዎች ምንም እንቅስቃሴ አልተገኘም። ለከተማው አስተዳደር ሚስጥራዊ መረጃዎች ደህንነት ሲባል ክፍለ ጊዜዎ በቅርቡ በራስ-ሰር ይዘጋል፡'
                  : 'You have been inactive for over 13 minutes. To protect sensitive municipal records, your session will automatically end in:'}
              </p>

              {/* Countdown Clock Display Card */}
              <div className="p-4 rounded-xl bg-surface-container-high dark:bg-slate-800/80 border border-outline-variant/70 dark:border-slate-700 max-w-xs mx-auto shadow-inner space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Icon className="material-symbols-outlined text-[24px] text-amber-600 dark:text-amber-400 animate-spin">
                    schedule
                  </Icon>
                  <div className="text-left">
                    <span className="text-[10px] font-extrabold uppercase text-outline dark:text-slate-400 block tracking-wider">
                      {isAmharic ? 'የቀረው ጊዜ (Countdown)' : 'Automatic Logout In'}
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-on-surface dark:text-white tabular-nums tracking-tight">
                      {formattedCountdown}
                    </span>
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="w-full bg-surface-container-highest dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      secondsRemaining <= 30
                        ? 'bg-rose-500'
                        : secondsRemaining <= 60
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg p-3 text-left flex items-start gap-2.5">
                <Icon className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                  info
                </Icon>
                <p className="text-[11px] text-amber-900 dark:text-amber-300 font-medium leading-relaxed">
                  {isAmharic
                    ? 'ስራዎን ሳያቋርጡ ለመቀጠል ከታች ያለውን "በመለያዬ እንዳለሁ አቆየኝ" የሚለውን ይጫኑ ወይም የቁልፍ ሰሌዳዎን "Enter" ይጫኑ። ይህ ተጨማሪ 15 ደቂቃ ይሰጥዎታል።'
                    : 'Click "Keep me logged in" below or press [Enter] to extend your session for another 15 minutes without losing any unsaved work.'}
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 sm:p-5 bg-surface-container/60 dark:bg-slate-800/60 border-t border-outline-variant/60 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleImmediateLogout}
                className="order-2 sm:order-1 px-4 py-2.5 rounded-lg text-xs font-bold text-secondary dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-surface-container-high dark:hover:bg-slate-700 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Icon className="material-symbols-outlined text-[16px]">logout</Icon>
                <span>{isAmharic ? 'አሁን ውጣ (Sign Out)' : 'Sign Out Now'}</span>
              </button>

              <button
                ref={keepLoggedInButtonRef}
                type="button"
                onClick={handleKeepLoggedIn}
                className="order-1 sm:order-2 px-6 py-3 rounded-lg text-xs sm:text-sm font-black bg-[#0B1E48] hover:bg-[#162B5B] text-white shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 group"
              >
                <Icon className="material-symbols-outlined text-[18px] text-yellow-400 group-hover:rotate-180 transition-transform duration-500">
                  lock_reset
                </Icon>
                <span>{isAmharic ? 'በመለያዬ እንዳለሁ አቆየኝ' : 'Keep me logged in'}</span>
                <span className="ml-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-yellow-400/20 text-yellow-300 border border-yellow-400/30">
                  +15 min
                </span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
