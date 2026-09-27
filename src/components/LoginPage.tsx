import React, { useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { Language, UserRole, APP_LOGO } from '../types';
import { validateBadgeId } from '../utils/validation';
import { SYSTEM_ROLE_CREDENTIALS, loginOnlineUser } from '../services/authService';

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
  currentTheme = 'light',
  onToggleLang,
  onToggleTheme,
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
      <header className="w-full bg-white dark:bg-[#1C2434] text-[#1C2434] dark:text-[#DEE4EE] border-b border-[#E2E8F0] dark:border-[#2E3A47] shadow-xs px-4 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between shrink-0 z-50 gap-2 sm:gap-4 transition-colors">
        
        {/* Left Brand & Logo */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 shrink">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white shadow-xs flex items-center justify-center shrink-0 overflow-hidden border border-[#E2E8F0] dark:border-[#2E3A47]">
            <img src={APP_LOGO} alt="Logo" className="w-full h-full object-cover rounded-full" referrerPolicy="no-referrer" />
          </div>
          <div className="min-w-0">
            <h1 className={`text-[#1C2434] dark:text-white leading-tight truncate whitespace-nowrap ${lang === 'am' ? 'font-black text-sm sm:text-base md:text-lg tracking-normal' : 'font-black text-xs sm:text-sm md:text-base tracking-tight'}`}>
              {lang === 'am' ? 'ባህር ዳር ሞተረኞች ማህበር' : 'Bahir Dar Motorist Association'}
            </h1>
          </div>
        </div>

        {/* Right Action Tools (Language Toggle & Theme Toggle) */}
        <div className="flex items-center gap-2">
          {onToggleLang && (
            <button
              type="button"
              onClick={onToggleLang}
              className="h-8.5 px-3 rounded-sm border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] hover:text-slate-900 dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 select-none"
              title={lang === 'am' ? 'ወደ እንግሊዝኛ ቀይር' : 'Switch to Amharic'}
              aria-label="Toggle Language"
            >
              <Icon className="material-symbols-outlined text-[16px] text-slate-700 dark:text-slate-300">translate</Icon>
              <span className="font-bold">{lang === 'am' ? 'English' : 'አማርኛ'}</span>
            </button>
          )}

          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="w-8.5 h-8.5 rounded-full border border-[#E2E8F0] dark:border-[#2E3A47] bg-[#F7F9FC] dark:bg-[#24303F] text-[#64748B] dark:text-[#8A99AD] hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 select-none"
              title={currentTheme === 'dark' ? (lang === 'am' ? 'ወደ ብርሃን ገጽታ ቀይር' : 'Switch to Light Mode') : (lang === 'am' ? 'ወደ ጨለማ ገጽታ ቀይር' : 'Switch to Dark Mode')}
              aria-label="Toggle Dark Mode"
            >
              <Icon className="material-symbols-outlined text-[18px] text-amber-500">
                {currentTheme === 'dark' ? 'dark_mode' : 'light_mode'}
              </Icon>
            </button>
          )}
        </div>
      </header>

      {/* ================= MAIN LOGIN CONTAINER ================= */}
      <main className="flex-1 flex flex-col justify-center items-center p-4 sm:p-6 pt-8 sm:pt-6 py-6 sm:py-10 mt-4 sm:mt-0 my-auto min-h-0 -translate-y-[5%] sm:-translate-y-[10%]">
        <div className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant rounded-xl shadow-md p-4 sm:p-6 space-y-4 relative">
          
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

          {sessionExpiredMessage && (
            <div className="p-3 rounded-lg text-xs bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/30 dark:border-amber-800 text-amber-800 dark:text-amber-300 flex items-start gap-2.5 animate-in fade-in">
              <Icon className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                alarm
              </Icon>
              <div className="flex-1 min-w-0">
                <span className="block font-black text-xs text-amber-950 dark:text-amber-200">
                  {lang === 'am' ? 'የስራ ክፍለ-ጊዜ ማብቂያ' : 'Session Expired for Security'}
                </span>
                <span className="text-[11px] font-medium leading-relaxed block mt-0.5 text-amber-800/90 dark:text-amber-300/90">
                  {sessionExpiredMessage}
                </span>
              </div>
              {onClearSessionExpiredMessage && (
                <button
                  type="button"
                  onClick={onClearSessionExpiredMessage}
                  className="text-amber-600 hover:text-amber-800 dark:text-amber-400 p-0.5 rounded cursor-pointer shrink-0"
                  title={lang === 'am' ? 'ዝጋ' : 'Dismiss'}
                >
                  <Icon className="material-symbols-outlined text-[16px]">close</Icon>
                </button>
              )}
            </div>
          )}

          {authError && (
            <div className="p-2.5 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-center gap-2 animate-in fade-in">
              <Icon className="material-symbols-outlined text-[16px] shrink-0">error</Icon>
              <span>{authError}</span>
            </div>
          )}

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
                  className={`w-full bg-surface-container-low border ${
                    badgeIdError ? 'border-error' : 'border-outline-variant'
                  } rounded-lg px-3.5 py-2.5 text-xs sm:text-sm font-medium text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono pr-11`}
                />
                <div className="absolute right-3 inset-y-0 flex items-center justify-center text-on-surface-variant pointer-events-none">
                  <Icon className="material-symbols-outlined text-[18px] leading-none">person</Icon>
                </div>
              </div>
              {badgeIdError && (
                <p className="text-[11px] font-medium text-error mt-1">{badgeIdError}</p>
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
                  className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-3.5 py-2.5 text-xs sm:text-sm font-medium text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-mono pr-11"
                />
                <div className="absolute right-2 inset-y-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? (lang === 'am' ? 'የይለፍ ቃል ደብቅ' : 'Hide password') : (lang === 'am' ? 'የይለፍ ቃል አሳይ' : 'Show password')}
                    className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none"
                  >
                    <Icon className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </Icon>
                  </button>
                </div>
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none text-on-surface-variant font-medium">
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
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary-hover text-white py-2.5 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] disabled:opacity-60 cursor-pointer mt-1"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>{lang === 'am' ? 'በመግባት ላይ...' : 'Signing in...'}</span>
                </>
              ) : (
                <>
                  <Icon className="material-symbols-outlined text-[18px] leading-none">login</Icon>
                  <span>{lang === 'am' ? 'ይግቡ' : 'Sign in'}</span>
                </>
              )}
            </button>
          </form>

          {/* Card Footer */}
          <div className="text-center pt-2 border-t border-outline-variant">
            <p className="text-[11px] text-outline font-medium">
              {lang === 'am'
                ? 'ባህር ዳር ሞተረኞች ማህበር • 2026'
                : 'Bahirdar Motorist Association • 2026'}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

