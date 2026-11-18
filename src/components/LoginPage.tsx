import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './ui/Icon';
import { Language, UserRole, APP_LOGO } from '../types';
import { validateBadgeId } from '../utils/validation';
import { loginOnlineUser } from '../services/authService';
import { CentralPageSpinner } from './ui/CentralPageSpinner';
import {
  POPOVER_TRANSITION,
  ROUTE_TRANSITION,
  TACTILE_SPRING,
  TAP_SCALE,
} from '../utils/motionPresets';

interface LoginPageProps {
  currentLang?: Language;
  currentTheme?: 'light' | 'dark';
  onToggleLang?: () => void;
  onToggleTheme?: () => void;
  onLoginSuccess?: (badgeId: string, role: UserRole) => void;
  sessionExpiredMessage?: string | null;
  onClearSessionExpiredMessage?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  currentLang = 'en',
  onLoginSuccess,
  sessionExpiredMessage,
  onClearSessionExpiredMessage,
}) => {
  const [badgeId, setBadgeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const lang = currentLang;

  const [badgeIdError, setBadgeIdError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBadgeIdError('');
    setAuthError('');

    if (!badgeId.trim()) {
      setBadgeIdError(lang === 'am' ? 'እባክዎን የመታወቂያ ቁጥር ያስገቡ' : 'Badge / Employee ID is required');
      return;
    }

    // Validate badgeId format if custom string
    if (badgeId.trim() && !badgeId.includes('@')) {
      const validation = validateBadgeId(badgeId, lang === 'am');
      if (!validation.isValid) {
        setBadgeIdError(validation.message);
        return;
      }
    }

    setIsLoading(true);

    try {
      const result = await loginOnlineUser(badgeId, password);
      setIsLoading(false);
      if (result.success && result.user) {
        if (onLoginSuccess) {
          onLoginSuccess(result.user.badgeId, result.user.role);
        }
      } else {
        setAuthError(result.error || (lang === 'am' ? 'የተሳሳተ መታወቂያ ወይም የይለፍ ቃል' : 'Invalid ID or password'));
      }
    } catch (err: any) {
      console.warn('[LoginPage] Online auth error:', err);
      setIsLoading(false);
      setAuthError(err?.message || (lang === 'am' ? 'የመግባት ስህተት ተከስቷል' : 'Authentication failed. Please check credentials.'));
    }
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans text-on-surface bg-surface min-h-0 overflow-y-auto">
      
      {/* ================= TOP NAVBAR ================= */}
      <header className="w-full bg-[#1C2434] text-white shadow-sm px-3 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between shrink-0 z-50 gap-2 sm:gap-4 border-b border-[#2E3A47]">
        
        {/* Left Brand & Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-white/20 shadow-xs flex items-center justify-center shrink-0 overflow-hidden">
            <img src={APP_LOGO} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
          </div>
          <div className="min-w-0">
            <h1 className={`text-white leading-tight truncate whitespace-nowrap ${lang === 'am' ? 'font-black text-sm sm:text-base md:text-lg tracking-normal' : 'font-black text-xs sm:text-sm md:text-base tracking-tight'}`}>
              {lang === 'am' ? 'ባህር ዳር ሞተረኞች ማህበር' : 'Bahir Dar Motorist Association'}
            </h1>
          </div>
        </div>
      </header>

      {/* ================= MAIN LOGIN CONTAINER ================= */}
      <main className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6 py-6 sm:py-10 my-auto min-h-0">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={ROUTE_TRANSITION}
          className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded-xl shadow-md p-5 sm:p-6 space-y-4 relative -translate-y-[3%] sm:-translate-y-[6%]"
        >
          
          {/* Header Inside Card */}
          <div className="text-center pb-0.5">
            <h2 className="font-extrabold text-lg text-on-surface tracking-tight leading-tight">
              {lang === 'am' ? 'ወደ ሲስተም መግቢያ' : 'System Login'}
            </h2>
            <p className="text-xs text-on-surface-variant font-medium mt-1">
              {lang === 'am'
                ? 'እባክዎን የመታወቂያ ቁጥር እና የይለፍ ቃልዎን ያስገቡ'
                : 'Enter your badge ID and password to sign in'}
            </p>
          </div>

          <AnimatePresence initial={false}>
            {sessionExpiredMessage && (
              <motion.div
                key="session-expired"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={POPOVER_TRANSITION}
                className="p-3 rounded-lg text-xs bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] text-[#1C2434] dark:text-[#DEE4EE] flex items-start gap-2.5 shadow-2xs"
              >
                <Icon className="material-symbols-outlined text-icon-md text-primary shrink-0 mt-0.5">
                  info
                </Icon>
                <div className="flex-1 min-w-0">
                  <span className="block font-black text-xs text-[#1C2434] dark:text-white">
                    {lang === 'am' ? 'የስራ ክፍለ-ጊዜ ማብቂያ' : 'Session Expired for Security'}
                  </span>
                  <span className="text-11 font-medium leading-relaxed block mt-0.5 text-[#64748B] dark:text-[#8A99AD]">
                    {sessionExpiredMessage}
                  </span>
                </div>
                {onClearSessionExpiredMessage && (
                  <button
                    type="button"
                    onClick={onClearSessionExpiredMessage}
                    className="w-9 h-9 -mr-1.5 -mt-1.5 flex items-center justify-center text-[#64748B] hover:text-[#1C2434] dark:text-[#8A99AD] dark:hover:text-white rounded-lg hover:bg-[#E2E8F0]/60 dark:hover:bg-[#333A48] cursor-pointer shrink-0 transition-colors"
                    title={lang === 'am' ? 'ዝጋ' : 'Dismiss'}
                    aria-label={lang === 'am' ? 'ዝጋ' : 'Dismiss'}
                  >
                    <Icon className="material-symbols-outlined text-icon-sm">close</Icon>
                  </button>
                )}
              </motion.div>
            )}

            {authError && (
              <motion.div
                key="auth-error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={POPOVER_TRANSITION}
                className="p-3 rounded-lg text-xs font-bold bg-rose-50 dark:bg-[#FB5454]/15 border border-rose-200 dark:border-[#FB5454]/30 text-rose-700 dark:text-[#FDA4AF] flex items-center gap-2 shadow-2xs"
              >
                <Icon className="material-symbols-outlined text-icon-sm text-rose-600 dark:text-[#FB5454] shrink-0">error</Icon>
                <span>{authError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            
            {/* Badge ID Input */}
            <div className="space-y-1.5">
              <label htmlFor="badge-id-input" className="block text-xs sm:text-sm font-bold text-on-surface-variant">
                {lang === 'am' ? 'የመታወቂያ ቁጥር' : 'Badge ID'}
              </label>
              <div className="relative">
                <input
                  id="badge-id-input"
                  type="text"
                  value={badgeId}
                  onChange={(e) => setBadgeId(e.target.value)}
                  placeholder={lang === 'am' ? 'የመታወቂያ ቁጥር ያስገቡ' : 'Enter Badge ID'}
                  required
                  autoComplete="off"
                  className={`w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-surface-container-low border ${
                    badgeIdError ? 'border-error' : 'border-outline-variant'
                  } rounded-lg px-3.5 py-2.5 text-sm font-medium text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono pr-11`}
                />
                <div className="absolute right-3 inset-y-0 flex items-center justify-center text-on-surface-variant pointer-events-none">
                  <Icon className="material-symbols-outlined text-icon-md leading-none">person</Icon>
                </div>
              </div>
              {badgeIdError && (
                <p className="text-11 font-medium text-error mt-1">{badgeIdError}</p>
              )}
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label htmlFor="password-input" className="block text-xs sm:text-sm font-bold text-on-surface-variant">
                {lang === 'am' ? 'የይለፍ ቃል' : 'Password'}
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={lang === 'am' ? 'የይለፍ ቃል ያስገቡ' : 'Enter Password'}
                  required
                  className="w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-surface-container-low border border-outline-variant rounded-lg px-3.5 py-2.5 text-sm font-medium text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono pr-12"
                />
                <div className="absolute right-1 inset-y-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? (lang === 'am' ? 'የይለፍ ቃል ደብቅ' : 'Hide password') : (lang === 'am' ? 'የይለፍ ቃል አሳይ' : 'Show password')}
                    className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer rounded-lg hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    <Icon className="material-symbols-outlined text-icon-md">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </Icon>
                  </button>
                </div>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2.5 min-h-[var(--ui-control-h-md)] cursor-pointer select-none text-on-surface-variant font-medium">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded-sm border-outline text-primary focus:ring-primary/20 accent-primary w-4 h-4 cursor-pointer"
                />
                <span>{lang === 'am' ? 'አስታውሰኝ' : 'Remember Session'}</span>
              </label>
            </div>

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isLoading}
              data-motion-control="true"
              whileTap={!isLoading ? TAP_SCALE : undefined}
              transition={TACTILE_SPRING}
              className="w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-primary hover:bg-primary-hover text-on-primary py-2.5 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 border-0 shadow-none hover:shadow-none transition-colors duration-150 disabled:opacity-60 cursor-pointer mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <Icon className="material-symbols-outlined text-icon-md leading-none">login</Icon>
              <span>{lang === 'am' ? 'ይግቡ' : 'Sign in'}</span>
            </motion.button>
          </form>

          {/* Card Footer */}
          <div className="text-center pt-2 border-t border-outline-variant">
            <p className="text-11 text-outline font-medium">
              {lang === 'am'
                ? 'ባህር ዳር ሞተረኞች ማህበር • 2026'
                : 'Bahirdar Motorist Association • 2026'}
            </p>
          </div>
        </motion.div>
      </main>

      {/* Central Spinning Page Loader */}
      {isLoading && <CentralPageSpinner />}
    </div>
  );
};

