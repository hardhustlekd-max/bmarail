import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from './ui/Icon';
import { BaseModal } from './ui/BaseModal';
import { TACTILE_SPRING, TAP_SCALE, POPOVER_TRANSITION } from '../utils/motionPresets';
import {
  CrashReport,
  onCrashReported,
  copyCrashReportToClipboard,
  getSavedCrashReports,
  clearSavedCrashReports,
} from '../utils/crashReporter';
import { Language } from '../types';

interface CrashNotificationModalProps {
  currentLang?: Language;
  onDismissExternal?: () => void;
}

export const CrashNotificationModal: React.FC<CrashNotificationModalProps> = ({
  currentLang = 'en',
  onDismissExternal,
}) => {
  const [activeReport, setActiveReport] = useState<CrashReport | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [allReports, setAllReports] = useState<CrashReport[]>([]);
  const [viewingHistory, setViewingHistory] = useState(false);

  const isAmharic = currentLang === 'am';

  useEffect(() => {
    // Listen for incoming crashes captured across window and ErrorBoundary
    const unsubscribe = onCrashReported((report) => {
      setActiveReport(report);
      setIsOpen(true);
      setShowDetails(false);
      setCopied(false);
      setAllReports(getSavedCrashReports());
    });

    return unsubscribe;
  }, []);

  const handleCopy = async () => {
    if (!activeReport) return;
    const ok = await copyCrashReportToClipboard(activeReport);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleReload = () => {
    window.location.reload();
  };

  const handleClose = () => {
    setIsOpen(false);
    setViewingHistory(false);
    if (onDismissExternal) {
      onDismissExternal();
    }
  };

  const handleClearHistory = () => {
    clearSavedCrashReports();
    setAllReports([]);
    setActiveReport(null);
    setIsOpen(false);
    setViewingHistory(false);
  };

  return (
    <BaseModal
      isOpen={isOpen && !!activeReport}
      onClose={handleClose}
      className="max-w-xl border-rose-500/40"
      mobileSheet={true}
    >
      {activeReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="crash-dialog-title"
          className="flex flex-col max-h-[85dvh] sm:max-h-[90vh]"
        >
          {/* Header Alert Strip */}
          <div className="bg-rose-700 text-white px-5 py-4 flex items-center justify-between border-b border-rose-800 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className="material-symbols-outlined text-[16px] sm:text-[18px] text-rose-100 shrink-0">
                report_problem
              </Icon>
              <div className="min-w-0">
                <h2 id="crash-dialog-title" className="text-base sm:text-lg font-black tracking-tight leading-tight truncate">
                  {isAmharic ? 'የስርዓት ስህተት ማሳወቂያ' : 'Application Crash Notification'}
                </h2>
                <p className="text-[11px] sm:text-xs text-rose-100 font-medium">
                  {isAmharic
                    ? 'ያልተጠበቀ የስርዓት ስህተት ተመዝግቧል'
                    : 'A runtime error was caught and safely captured'}
                </p>
              </div>
            </div>

            <motion.button
              type="button"
              data-motion-control="true"
              whileTap={TAP_SCALE}
              transition={TACTILE_SPRING}
              onClick={handleClose}
              aria-label={isAmharic ? 'ዝጋ' : 'Close'}
              className="w-11 h-11 sm:w-9 sm:h-9 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 touch-manipulation"
            >
              <Icon className="material-symbols-outlined text-[20px]">close</Icon>
            </motion.button>
          </div>

          {/* Content Body */}
          <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-on-surface flex-1 min-h-0">
            {/* Summary Box */}
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3.5 sm:p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200">
                  <Icon className="material-symbols-outlined text-[13px]">bug_report</Icon>
                  {activeReport.type}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {activeReport.id}
                </span>
              </div>

              <p className="text-sm sm:text-base font-bold text-rose-950 dark:text-rose-200 break-words font-mono">
                {activeReport.errorMessage}
              </p>

              <div className="mt-2.5 pt-2.5 border-t border-rose-200/60 dark:border-rose-900/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span>
                  <strong>{isAmharic ? 'ሰዓት' : 'Time'}:</strong> {activeReport.localTime}
                </span>
                {activeReport.userBadgeId && (
                  <span>
                    <strong>{isAmharic ? 'ባለሙያ' : 'User'}:</strong> {activeReport.userBadgeId} (
                    {activeReport.userRole})
                  </span>
                )}
                {activeReport.memoryUsage && (
                  <span>
                    <strong>{isAmharic ? 'ማህደረ-ትውስታ' : 'Memory'}:</strong>{' '}
                    {activeReport.memoryUsage.usedJSHeapSizeMB}MB
                  </span>
                )}
              </div>
            </div>

            {/* Collapsible Technical Details (Stack Trace) */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="w-full min-h-[44px] px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer touch-manipulation"
              >
                <div className="flex items-center gap-2">
                  <Icon className="material-symbols-outlined text-[18px] text-slate-500">
                    code
                  </Icon>
                  <span>
                    {isAmharic ? 'ቴክኒካዊ የስህተት ዝርዝር' : 'Technical Stack Details'}
                  </span>
                </div>
                <Icon
                  className={`material-symbols-outlined text-[18px] transition-transform ${
                    showDetails ? 'rotate-180' : ''
                  }`}
                >
                  expand_more
                </Icon>
              </button>

              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={POPOVER_TRANSITION}
                    className="p-3 bg-slate-900 text-slate-200 text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed select-all"
                  >
                    {activeReport.componentStack && (
                      <div className="mb-2">
                        <span className="text-amber-400 font-bold block mb-1">
                          [React Component Stack]
                        </span>
                        <pre className="whitespace-pre-wrap text-slate-300 text-[10px]">
                          {activeReport.componentStack}
                        </pre>
                      </div>
                    )}
                    <div>
                      <span className="text-rose-400 font-bold block mb-1">
                        [Error Stack Trace]
                      </span>
                      <pre className="whitespace-pre-wrap text-slate-300 text-[10px]">
                        {activeReport.stack || activeReport.errorMessage}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* History Accordion if multiple reports exist */}
            {allReports.length > 1 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setViewingHistory(!viewingHistory)}
                  className="min-h-[40px] text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer touch-manipulation"
                >
                  <Icon className="material-symbols-outlined text-[16px]">history</Icon>
                  <span>
                    {isAmharic
                      ? `የተመዘገቡ ስህተቶች ታሪክ (${allReports.length})`
                      : `View Crash History (${allReports.length} reports)`}
                  </span>
                </button>

                <AnimatePresence>
                  {viewingHistory && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={POPOVER_TRANSITION}
                      className="mt-2 space-y-2 max-h-36 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-800"
                    >
                      {allReports.map((rep) => (
                        <div
                          key={rep.id}
                          onClick={() => setActiveReport(rep)}
                          className={`p-2 rounded-md text-[11px] flex items-center justify-between cursor-pointer transition-colors ${
                            activeReport.id === rep.id
                              ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-900 dark:text-rose-100 font-bold'
                              : 'hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span className="truncate max-w-[280px]">{rep.errorMessage}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">{rep.localTime}</span>
                        </div>
                      ))}
                      <div className="pt-1 flex justify-end">
                        <button
                          type="button"
                          onClick={handleClearHistory}
                          className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-bold cursor-pointer py-1 px-2"
                        >
                          {isAmharic ? 'ታሪክ አጽዳ' : 'Clear All History'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 pb-[max(1rem,env(safe-area-inset-bottom,16px))] bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            <motion.button
              type="button"
              data-motion-control="true"
              whileTap={TAP_SCALE}
              transition={TACTILE_SPRING}
              onClick={handleCopy}
              className={`min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border transition-colors cursor-pointer touch-manipulation ${
                copied
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="material-symbols-outlined text-[18px]">
                {copied ? 'check_circle' : 'content_copy'}
              </Icon>
              <span>
                {copied
                  ? isAmharic
                    ? 'ሪፖርቱ ተቀድቷል!'
                    : 'Report Copied!'
                  : isAmharic
                  ? 'የስህተት ሪፖርት ቅዳ (Copy)'
                  : 'Copy Diagnostics'}
              </span>
            </motion.button>

            <div className="flex items-center gap-2">
              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={handleClose}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer touch-manipulation"
              >
                {isAmharic ? 'ዝጋ እና ቀጥል' : 'Dismiss'}
              </motion.button>

              <motion.button
                type="button"
                data-motion-control="true"
                whileTap={TAP_SCALE}
                transition={TACTILE_SPRING}
                onClick={handleReload}
                className="flex-1 sm:flex-none min-h-[44px] px-5 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer touch-manipulation"
              >
                <Icon className="material-symbols-outlined text-[18px]">refresh</Icon>
                <span>{isAmharic ? 'ድጋሚ ጫን (Reload)' : 'Reload App'}</span>
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </BaseModal>
  );
};
