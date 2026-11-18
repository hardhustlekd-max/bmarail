import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './ui/Icon';
import { TACTILE_SPRING, TAP_SCALE, POPOVER_TRANSITION } from '../utils/motionPresets';
import { Language, UserRole, APP_LOGO } from '../types';
import { changeOnlineUserPassword, SYSTEM_ROLE_CREDENTIALS } from '../services/authService';
import { updateSystemUserInDb, saveSettingsToDb, subscribeSettings } from '../services/dbService';
import {
  extendSessionManually,
  triggerInactivityPromptPreview,
} from './AutoLogoutManager';
import { UiScaleMode, getStoredUiScale, saveUiScale } from '../utils/storage';

interface SettingsPageProps {
  userBadgeId: string;
  userRole: UserRole;
  currentLang: Language;
  currentTheme?: 'light' | 'dark';
  onToggleLang?: () => void;
  onToggleTheme?: () => void;
  onLogoutClick?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  userBadgeId,
  userRole,
  currentLang,
  currentTheme = 'light',
  onToggleLang,
  onToggleTheme,
  onLogoutClick,
}) => {
  const isAmharic = currentLang === 'am';

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Preference toggles state
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [calendarSystem, setCalendarSystem] = useState<'ethiopian' | 'gregorian'>('ethiopian');
  const [uiScaleMode, setUiScaleMode] = useState<UiScaleMode>(() => getStoredUiScale());
  const [savedPreferenceMsg, setSavedPreferenceMsg] = useState(false);

  // Sync settings with DB
  useEffect(() => {
    const unsub = subscribeSettings((data) => {
      if (data && data.calendarSystem) {
        setCalendarSystem(data.calendarSystem);
      }
    });
    return () => unsub();
  }, []);

  // User credentials details
  const creds = SYSTEM_ROLE_CREDENTIALS[userRole] || SYSTEM_ROLE_CREDENTIALS.clerk;
  const displayName = creds.fullName;
  const displayPhone = creds.phone || '0918123456';

  // Password strength helper
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { label: '', score: 0, color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 10) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) {
      return {
        label: isAmharic ? 'ደካማ' : 'Weak',
        score: 33,
        color: 'bg-rose-500',
        textColor: 'text-rose-600 dark:text-rose-400',
      };
    }
    if (score <= 4) {
      return {
        label: isAmharic ? 'መካከለኛ' : 'Medium',
        score: 66,
        color: 'bg-slate-500',
        textColor: 'text-slate-600 dark:text-slate-400',
      };
    }
    return {
      label: isAmharic ? 'በጣም ጠንካራ' : 'Strong',
      score: 100,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    };
  };

  const strength = getPasswordStrength(newPassword);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!newPassword || newPassword.length < 6) {
      setFeedback({
        type: 'error',
        message: isAmharic
          ? 'አዲሱ የይለፍ ቃል ቢያንስ 6 ፊደላት ወይም ቁጥሮች መሆን አለበት!'
          : 'New password must be at least 6 characters long!',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({
        type: 'error',
        message: isAmharic
          ? 'አዲሱ የይለፍ ቃል እና ማረጋገጫው አይመሳሰሉም!'
          : 'New password and confirmation password do not match!',
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await changeOnlineUserPassword(
        userRole,
        userBadgeId || creds.badgeId,
        currentPassword,
        newPassword
      );

      setIsLoading(false);
      if (result.success) {
        setFeedback({
          type: 'success',
          message: isAmharic
            ? 'የይለፍ ቃልዎ በተሳካ ሁኔታ ተቀይሯል! ለቀጣይ መግቢያ አዲሱን የይለፍ ቃል ይጠቀሙ።'
            : 'Password changed successfully! Use your new password for your next login.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setFeedback({
          type: 'error',
          message: result.error || (isAmharic ? 'የይለፍ ቃል መቀየር አልተሳካም!' : 'Failed to change password!'),
        });
      }
    } catch (err: any) {
      setIsLoading(false);
      setFeedback({
        type: 'error',
        message: err.message || (isAmharic ? 'የይለፍ ቃል መቀየር አልተሳካም!' : 'An error occurred while updating password.'),
      });
    }
  };

  const handleSavePreferences = async () => {
    setIsSavingPref(true);
    try {
      if (userBadgeId) {
        await updateSystemUserInDb(userBadgeId, {
          preferences: {
            soundAlerts,
            calendarSystem,
            language: currentLang,
            theme: currentTheme,
          },
        } as any);
      }
      await saveSettingsToDb({
        calendarSystem,
      } as any);

      setSavedPreferenceMsg(true);
      setTimeout(() => setSavedPreferenceMsg(false), 3000);
    } catch (err) {
      console.warn('[SettingsPage] Error saving settings to DB:', err);
    } finally {
      setIsSavingPref(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 max-w-5xl mx-auto pb-10">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-outline-variant/60">
        <div className="flex items-center gap-2.5">
          <Icon className="material-symbols-outlined text-icon-xl text-primary shrink-0">settings</Icon>
          <div>
            <h3 className="font-bold text-sm sm:text-base text-on-surface dark:text-white">
              {isAmharic ? 'ቅንብሮች' : 'Settings'}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider bg-primary/10 text-primary border border-primary/20 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            <span>
              {userRole === 'superadmin'
                ? 'Super Admin'
                : userRole === 'admin'
                ? 'Manager / Admin'
                : userRole === 'clerk'
                ? 'Secretary / Clerk'
                : 'Field Officer'}
            </span>
          </span>
        </div>
      </div>

        {/* Grid: Left Column (Profile & Preferences) & Right Column (Password Change) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Left Column (5 Cols): Profile Info & App Preferences */}
          <div className="md:col-span-5 space-y-6">
            
            {/* User Profile Card */}
            <div className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-3 border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
                <Icon className="material-symbols-outlined text-[#475569] dark:text-[#CBD5E1] text-icon-xl">account_circle</Icon>
                <h2 className="text-sm font-bold text-[#1C2434] dark:text-white">
                  {isAmharic ? 'የተጠቃሚ መገለጫ' : 'User Profile Details'}
                </h2>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-full bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-center text-xl font-bold text-[#1C2434] dark:text-white shrink-0 overflow-hidden shadow-2xs">
                  <img src={APP_LOGO} alt="User Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm text-[#1C2434] dark:text-white truncate">{displayName}</h3>
                  <p className="font-mono text-xs font-bold text-[#475569] dark:text-[#CBD5E1] bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] px-2 py-0.5 rounded-sm inline-block mt-0.5">
                    {userBadgeId || creds.badgeId}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 text-11 text-[#10B981] dark:text-[#6EE7B7] font-bold">
                    <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                    <span>{isAmharic ? 'ንቁ መለያ' : 'Active Session'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs border-t border-[#E2E8F0] dark:border-[#2E3A47] pt-3">
                <div className="flex justify-between items-center py-1">
                  <span className="text-[#64748B] dark:text-[#8A99AD]">{isAmharic ? 'ስልክ ቁጥር' : 'Mobile Number'}:</span>
                  <span className="font-bold font-mono text-[#1C2434] dark:text-white truncate max-w-[calc(180px*var(--ui-scale))]">{displayPhone}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[#64748B] dark:text-[#8A99AD]">{isAmharic ? 'የስራ ድርሻ' : 'Role Access'}:</span>
                  <span className="font-bold tracking-wider text-[#1C2434] dark:text-white">{userRole}</span>
                </div>
              </div>
            </div>

            {/* Application Preferences Card */}
            <div className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
                <div className="flex items-center gap-2.5">
                  <Icon className="material-symbols-outlined text-[#475569] dark:text-[#CBD5E1] text-icon-xl">tune</Icon>
                  <h2 className="text-sm font-bold text-[#1C2434] dark:text-white">
                    {isAmharic ? 'የስርዓት ምርጫዎች' : 'System Preferences'}
                  </h2>
                </div>
              </div>

              <div className="space-y-3.5">
                {/* Language Switch */}
                {onToggleLang && (
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#1C2434] dark:text-white block">
                        {isAmharic ? 'ቋንቋ' : 'System Language'}
                      </span>
                      <span className="text-11 text-[#64748B] dark:text-[#8A99AD]">
                        {currentLang === 'am' ? 'አማርኛ' : 'English (US)'}
                      </span>
                    </div>
                    <motion.button
                      type="button"
                      data-motion-control="true"
                      whileTap={TAP_SCALE}
                      transition={TACTILE_SPRING}
                      onClick={onToggleLang}
                      className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-3 py-1.5 rounded-md text-xs font-bold bg-[#F7F9FC] hover:bg-[#E2E8F0] dark:bg-[#24303F] dark:hover:bg-[#333A48] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs touch-manipulation"
                    >
                      <Icon className="material-symbols-outlined text-icon-sm">translate</Icon>
                      <span>{currentLang === 'am' ? 'Switch to English' : 'ወደ አማርኛ ቀይር'}</span>
                    </motion.button>
                  </div>
                )}

                {/* Dark Mode / Light Mode Switch */}
                {onToggleTheme && (
                  <div className="flex items-center justify-between border-t border-[#E2E8F0] dark:border-[#2E3A47] pt-3">
                    <div>
                      <span className="text-xs font-bold text-[#1C2434] dark:text-white block">
                        {isAmharic ? 'የገጽታ ቀለም' : 'Theme Mode'}
                      </span>
                      <span className="text-11 text-[#64748B] dark:text-[#8A99AD]">
                        {currentTheme === 'dark' ? (isAmharic ? 'ጨለማ ሁነታ' : 'Dark Mode') : (isAmharic ? 'ብሩህ ሁነታ' : 'Light Mode')}
                      </span>
                    </div>
                    <motion.button
                      type="button"
                      data-motion-control="true"
                      whileTap={TAP_SCALE}
                      transition={TACTILE_SPRING}
                      onClick={onToggleTheme}
                      className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-3 py-1.5 rounded-md text-xs font-bold bg-[#F7F9FC] hover:bg-[#E2E8F0] dark:bg-[#24303F] dark:hover:bg-[#333A48] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs touch-manipulation"
                    >
                      <Icon className="material-symbols-outlined text-icon-sm">
                        {currentTheme === 'dark' ? 'light_mode' : 'dark_mode'}
                      </Icon>
                      <span>{currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </motion.button>
                  </div>
                )}

                {/* Display Scale */}
                <div className="flex items-center justify-between border-t border-[#E2E8F0] dark:border-[#2E3A47] pt-3">
                  <div>
                    <span className="text-xs font-bold text-[#1C2434] dark:text-white block">
                      {isAmharic ? 'የማሳያ መጠን' : 'Display Scale'}
                    </span>
                    <span className="text-11 text-[#64748B] dark:text-[#8A99AD]">
                      {uiScaleMode === 'auto'
                        ? (isAmharic ? 'በስክሪን መጠን ራስ-ሰር' : 'Auto by Screen')
                        : uiScaleMode === 'compact'
                        ? (isAmharic ? 'ጥብቅ (90%)' : 'Compact (90%)')
                        : uiScaleMode === 'large'
                        ? (isAmharic ? 'ትልቅ (108%)' : 'Large (108%)')
                        : (isAmharic ? 'መደበኛ (100%)' : 'Standard (100%)')}
                    </span>
                  </div>
                  <select
                    value={uiScaleMode}
                    onChange={(e) => {
                      const next = e.target.value as UiScaleMode;
                      setUiScaleMode(next);
                      saveUiScale(next);
                    }}
                    className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-md px-2.5 py-1 text-xs font-bold text-[#1C2434] dark:text-white cursor-pointer"
                  >
                    <option value="auto">{isAmharic ? 'ራስ-ሰር' : 'Auto'}</option>
                    <option value="compact">{isAmharic ? 'ጥብቅ (90%)' : 'Compact (90%)'}</option>
                    <option value="standard">{isAmharic ? 'መደበኛ (100%)' : 'Standard (100%)'}</option>
                    <option value="large">{isAmharic ? 'ትልቅ (108%)' : 'Large (108%)'}</option>
                  </select>
                </div>

                {/* Calendar System */}
                <div className="flex items-center justify-between border-t border-[#E2E8F0] dark:border-[#2E3A47] pt-3">
                  <div>
                    <span className="text-xs font-bold text-[#1C2434] dark:text-white block">
                      {isAmharic ? 'የቀን መቁጠሪያ' : 'Calendar Format'}
                    </span>
                    <span className="text-11 text-[#64748B] dark:text-[#8A99AD]">
                      {calendarSystem === 'ethiopian'
                        ? (isAmharic ? 'የኢትዮጵያ ዘመን አቆጣጠር' : 'Ethiopian Calendar')
                        : 'Gregorian Calendar'}
                    </span>
                  </div>
                  <select
                    value={calendarSystem}
                    onChange={(e) => setCalendarSystem(e.target.value as any)}
                    className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-md px-2.5 py-1 text-xs font-bold text-[#1C2434] dark:text-white cursor-pointer"
                  >
                    <option value="ethiopian">{isAmharic ? 'የኢትዮጵያ' : 'Ethiopian'}</option>
                    <option value="gregorian">{isAmharic ? 'ግሪጎሪያን' : 'Gregorian'}</option>
                  </select>
                </div>

                {/* Notification Audio */}
                <div className="flex items-center justify-between border-t border-[#E2E8F0] dark:border-[#2E3A47] pt-3">
                  <div>
                    <span className="text-xs font-extrabold text-[#1C2434] dark:text-white block">
                      {isAmharic ? 'የድምፅ ማስጠንቀቂያ' : 'Sound Feedback'}
                    </span>
                    <span className="text-11 text-[#64748B] dark:text-[#8A99AD]">
                      {isAmharic ? 'ለስካን እና ለምዝገባ ድምፅ' : 'QR Scan & Action Beeps'}
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundAlerts}
                    data-motion-control="true"
                    onClick={() => setSoundAlerts(!soundAlerts)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-end cursor-pointer touch-manipulation"
                  >
                    <span
                      className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                        soundAlerts ? 'bg-primary' : 'bg-[#E2E8F0] dark:bg-[#2E3A47]'
                      }`}
                    >
                      <motion.span
                        animate={{ x: soundAlerts ? 20 : 0 }}
                        transition={TACTILE_SPRING}
                        className="bg-white dark:bg-[#1C2434] w-4 h-4 rounded-full shadow-md block"
                      />
                    </span>
                  </button>
                </div>

                <div className="pt-2">
                  <motion.button
                    type="button"
                    data-motion-control="true"
                    whileTap={isSavingPref ? undefined : TAP_SCALE}
                    transition={TACTILE_SPRING}
                    onClick={handleSavePreferences}
                    disabled={isSavingPref}
                    className="w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] py-2 bg-[#F7F9FC] hover:bg-[#E2E8F0] dark:bg-[#24303F] dark:hover:bg-[#333A48] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-md text-xs font-bold text-[#1C2434] dark:text-white transition-colors cursor-pointer shadow-2xs disabled:opacity-50 flex items-center justify-center gap-1.5 touch-manipulation"
                  >
                    {isSavingPref ? (
                      <>
                        <Icon className="material-symbols-outlined text-icon-sm animate-spin">sync</Icon>
                        <span>{isAmharic ? 'በማስቀመጥ ላይ...' : 'Saving...'}</span>
                      </>
                    ) : (
                      <span>{isAmharic ? 'ምርጫዎችን አጽድቅ' : 'Save Preferences'}</span>
                    )}
                  </motion.button>
                  <AnimatePresence>
                    {savedPreferenceMsg && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={POPOVER_TRANSITION}
                        className="text-11 font-bold text-primary text-center mt-1.5"
                      >
                        {isAmharic ? 'ምርጫዎችዎ ተቀምጠዋል!' : 'Preferences saved!'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (7 Cols): Password Changing Setting (Core Requirement) */}
          <div className="md:col-span-7 space-y-6">
            
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
              
              <div className="border-b border-slate-100 dark:border-slate-800/60 pb-4">
                <div className="flex items-center gap-2.5">
                  <Icon className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-icon-xl shrink-0">lock_reset</Icon>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {isAmharic ? 'የይለፍ ቃል መቀየሪያ' : 'Change Password'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {isAmharic
                        ? 'የመግቢያ የይለፍ ቃልዎን ይቀይሩ'
                        : 'Update your login password'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Feedback Alert */}
              <AnimatePresence>
                {feedback && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={POPOVER_TRANSITION}
                    className={`p-3.5 rounded-lg text-xs font-bold border flex items-start gap-2.5 shadow-2xs ${
                      feedback.type === 'success'
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-rose-50 dark:bg-rose-950/80 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100'
                    }`}
                  >
                    <Icon className="material-symbols-outlined text-icon-lg shrink-0">
                      {feedback.type === 'success' ? 'check_circle' : 'error'}
                    </Icon>
                    <span className="pt-0.5">{feedback.message}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Password Change Form */}
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                
                {/* 1. Current Password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-[#1C2434] dark:text-white">
                    {isAmharic ? 'አሁን ያለው የይለፍ ቃል' : 'Current Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={isAmharic ? 'የአሁኑን የይለፍ ቃል ያስገቡ' : 'Enter current password'}
                      className="w-full bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg px-3.5 py-2.5 text-xs text-[#1C2434] dark:text-white placeholder:text-[#64748B] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all pr-11 font-mono"
                    />
                    <div className="absolute right-1 inset-y-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        aria-label={showCurrentPass ? (isAmharic ? 'የይለፍ ቃል ደብቅ' : 'Hide password') : (isAmharic ? 'የይለፍ ቃል አሳይ' : 'Show password')}
                        className="w-10 h-10 flex items-center justify-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white transition-colors cursor-pointer rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none touch-manipulation"
                      >
                        <Icon className="material-symbols-outlined text-icon-md">
                          {showCurrentPass ? 'visibility_off' : 'visibility'}
                        </Icon>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. New Password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-[#1C2434] dark:text-white">
                    {isAmharic ? 'አዲስ የይለፍ ቃል' : 'New Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={isAmharic ? 'አዲስ ጠንካራ የይለፍ ቃል ያስገቡ' : 'Enter new strong password'}
                      className="w-full bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg px-3.5 py-2.5 text-xs text-[#1C2434] dark:text-white placeholder:text-[#64748B] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all pr-11 font-mono"
                      required
                      minLength={6}
                    />
                    <div className="absolute right-1 inset-y-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        aria-label={showNewPass ? (isAmharic ? 'የይለፍ ቃል ደብቅ' : 'Hide password') : (isAmharic ? 'የይለፍ ቃል አሳይ' : 'Show password')}
                        className="w-10 h-10 flex items-center justify-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white transition-colors cursor-pointer rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none touch-manipulation"
                      >
                        <Icon className="material-symbols-outlined text-icon-md">
                          {showNewPass ? 'visibility_off' : 'visibility'}
                        </Icon>
                      </button>
                    </div>
                  </div>

                  {/* Password Strength Indicator (GPU scaleX) */}
                  {newPassword && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between items-center text-2xs">
                        <span className="text-[#64748B] dark:text-[#8A99AD]">{isAmharic ? 'የይለፍ ቃል ጥንካሬ:' : 'Password Strength:'}</span>
                        <span className={`font-black ${strength.textColor}`}>{strength.label}</span>
                      </div>
                      <div className="w-full h-1.5 bg-[#E2E8F0] dark:bg-[#2E3A47] rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full w-full origin-left ${strength.color}`}
                          initial={false}
                          animate={{ scaleX: strength.score / 100 }}
                          transition={POPOVER_TRANSITION}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Confirm New Password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-black text-[#1C2434] dark:text-white">
                    {isAmharic ? 'አዲሱን የይለፍ ቃል ያረጋግጡ' : 'Confirm New Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={isAmharic ? 'አዲሱን የይለፍ ቃል በድጋሚ ያስገቡ' : 'Re-enter new password'}
                      className="w-full bg-[#F7F9FC] dark:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg px-3.5 py-2.5 text-xs text-[#1C2434] dark:text-white placeholder:text-[#64748B] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-all pr-11 font-mono"
                      required
                      minLength={6}
                    />
                    <div className="absolute right-1 inset-y-0 flex items-center">
                      <button
                        type="button"
                        onClick={() => setShowConfirmPass(!showConfirmPass)}
                        aria-label={showConfirmPass ? (isAmharic ? 'የይለፍ ቃል ደብቅ' : 'Hide password') : (isAmharic ? 'የይለፍ ቃል አሳይ' : 'Show password')}
                        className="w-10 h-10 flex items-center justify-center text-[#64748B] hover:text-[#1C2434] dark:hover:text-white transition-colors cursor-pointer rounded-full hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none touch-manipulation"
                      >
                        <Icon className="material-symbols-outlined text-icon-md">
                          {showConfirmPass ? 'visibility_off' : 'visibility'}
                        </Icon>
                      </button>
                    </div>
                  </div>

                  {confirmPassword && newPassword && (
                    <div className="flex items-center gap-1.5 text-11 pt-0.5">
                      {confirmPassword === newPassword ? (
                        <span className="text-[#10B981] font-bold flex items-center gap-1">
                          <Icon className="material-symbols-outlined text-15">check_circle</Icon>
                          {isAmharic ? 'የይለፍ ቃሎቹ ይጣጣማሉ' : 'Passwords match'}
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-[#FDA4AF] font-bold flex items-center gap-1">
                          <Icon className="material-symbols-outlined text-15">cancel</Icon>
                          {isAmharic ? 'የይለፍ ቃሎቹ አይመሳሰሉም' : 'Passwords do not match'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Password Requirements Guide */}
                <div className="bg-[#F7F9FC] dark:bg-[#24303F] p-3 rounded-lg border border-[#E2E8F0] dark:border-[#2E3A47] text-11 space-y-1 text-[#64748B] dark:text-[#8A99AD]">
                  <span className="font-bold text-[#1C2434] dark:text-white block">
                    {isAmharic ? 'የይለፍ ቃል መመሪያዎች:' : 'Password Requirements:'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-2xs">
                    <span className="flex items-center gap-1">
                      <Icon className="material-symbols-outlined text-13 text-primary">check</Icon>
                      {isAmharic ? 'ቢያንስ 6 ፊደላት' : 'Min 6 characters'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon className="material-symbols-outlined text-13 text-primary">check</Icon>
                      {isAmharic ? 'ትላልቅና ትናንሽ ፊደላት' : 'Upper & lowercase'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon className="material-symbols-outlined text-13 text-primary">check</Icon>
                      {isAmharic ? 'ቁጥሮች (0-9)' : 'Numbers (0-9)'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon className="material-symbols-outlined text-13 text-primary">check</Icon>
                      {isAmharic ? 'ልዩ ምልክቶች (@, #, $)' : 'Symbols (!, @, #)'}
                    </span>
                  </div>
                </div>

                {/* Submit Action Button */}
                <div className="pt-2">
                  <motion.button
                    type="submit"
                    data-motion-control="true"
                    whileTap={isLoading ? undefined : TAP_SCALE}
                    transition={TACTILE_SPRING}
                    disabled={isLoading}
                    className="w-full min-h-[44px] md:min-h-[var(--ui-control-h-md)] bg-primary hover:bg-primary-hover text-on-primary font-bold text-xs sm:text-sm py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 border-0 shadow-none hover:shadow-none transition-colors duration-150 cursor-pointer disabled:opacity-50 touch-manipulation"
                  >
                    {isLoading ? (
                      <Icon className="material-symbols-outlined text-icon-md animate-spin">sync</Icon>
                    ) : (
                      <Icon className="material-symbols-outlined text-icon-md">lock_reset</Icon>
                    )}
                    <span>
                      {isLoading
                        ? (isAmharic ? 'በመቀየር ላይ...' : 'Updating...')
                        : (isAmharic ? 'የይለፍ ቃል ቀይር' : 'Update Password')}
                    </span>
                  </motion.button>
                </div>

              </form>

            </div>

            {/* Auto-Logout Inactivity Policy Card */}
            <div className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#F7F9FC] dark:bg-[#24303F] text-primary border border-[#E2E8F0] dark:border-[#2E3A47] flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="material-symbols-outlined text-icon-lg">alarm</Icon>
                  </div>
                  <div>
                    <span className="text-xs font-black text-[#1C2434] dark:text-white block">
                      {isAmharic ? 'የስራ ክፍለ-ጊዜ ደህንነት (Auto-Logout Policy)' : 'Session Security (Auto-Logout Policy)'}
                    </span>
                    <span className="text-11 text-[#64748B] dark:text-[#8A99AD] block mt-0.5 leading-relaxed">
                      {isAmharic
                        ? 'ከ15 ደቂቃ በፊት "በመለያዬ እንዳለሁ አቆየኝ" የሚል ማስጠንቀቂያ ይቀርባል፤ ክፍለ ጊዜውን ሳያቋርጡ ለማራዘም ያስችላል።'
                        : 'Prompts you with "Keep me logged in" before the 15-minute inactivity timer triggers, allowing you to extend your session.'}
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-md text-11 font-bold bg-[#F7F9FC] dark:bg-[#24303F] text-[#1C2434] dark:text-white border border-[#E2E8F0] dark:border-[#2E3A47] whitespace-nowrap shrink-0 shadow-2xs">
                  15 {isAmharic ? 'ደቂቃ' : 'min'}
                </span>
              </div>

              {/* Quick actions for testing and manual extension */}
              <div className="pt-2 border-t border-[#E2E8F0] dark:border-[#2E3A47] flex flex-wrap items-center justify-end gap-2">
                <motion.button
                  type="button"
                  data-motion-control="true"
                  whileTap={TAP_SCALE}
                  transition={TACTILE_SPRING}
                  onClick={() => triggerInactivityPromptPreview()}
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-3 py-1.5 rounded-lg text-xs font-bold text-[#1C2434] dark:text-white hover:bg-[#F7F9FC] dark:hover:bg-[#24303F] border border-[#E2E8F0] dark:border-[#2E3A47] transition-colors cursor-pointer flex items-center gap-1.5 touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-sm text-primary">preview</Icon>
                  <span>{isAmharic ? 'ማስጠንቀቂያውን ሞክር (Preview Prompt)' : 'Preview Prompt'}</span>
                </motion.button>

                <motion.button
                  type="button"
                  data-motion-control="true"
                  whileTap={TAP_SCALE}
                  transition={TACTILE_SPRING}
                  onClick={() => extendSessionManually()}
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-3 py-1.5 rounded-lg text-xs font-bold bg-primary hover:bg-primary-hover text-on-primary shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-sm">lock_reset</Icon>
                  <span>{isAmharic ? 'ክፍለ ጊዜውን አራዝም (+15 ደቂቃ)' : 'Extend Session (+15 min)'}</span>
                </motion.button>
              </div>
            </div>

            {/* Quick Logout Card (Using non-red theme) */}
            {onLogoutClick && (
              <div className="bg-white dark:bg-[#1C2434] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl p-4 shadow-xs flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-black text-[#1C2434] dark:text-white block">
                    {isAmharic ? 'ከሲስተም መውጣት' : 'System Sign Out'}
                  </span>
                  <span className="text-11 text-[#64748B] dark:text-[#8A99AD]">
                    {isAmharic ? 'የአሁኑን ክፍለ ጊዜ ያጠናቅቁ' : 'End current working session'}
                  </span>
                </div>
                <motion.button
                  type="button"
                  data-motion-control="true"
                  whileTap={TAP_SCALE}
                  transition={TACTILE_SPRING}
                  onClick={onLogoutClick}
                  className="min-h-[44px] sm:min-h-[var(--ui-control-h-sm)] px-4 py-2 rounded-lg bg-[#1C2434] hover:bg-[#24303F] dark:bg-[#24303F] dark:hover:bg-[#333A48] text-white text-xs font-black border border-[#2E3A47] shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-icon-sm text-white">logout</Icon>
                  <span>{isAmharic ? 'ውጣ' : 'Logout'}</span>
                </motion.button>
              </div>
            )}

          </div>

        </div>

    </div>
  );
};
