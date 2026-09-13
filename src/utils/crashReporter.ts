export interface CrashReport {
  id: string;
  timestamp: string;
  localTime: string;
  errorName: string;
  errorMessage: string;
  stack?: string;
  componentStack?: string;
  type: 'render_error' | 'unhandled_rejection' | 'uncaught_exception' | 'manual_report';
  url: string;
  userAgent: string;
  screenSize: string;
  online: boolean;
  userBadgeId?: string;
  userRole?: string;
  memoryUsage?: {
    usedJSHeapSizeMB?: number;
    totalJSHeapSizeMB?: number;
    jsHeapSizeLimitMB?: number;
  };
}

const STORAGE_KEY = 'bma_crash_reports';
const MAX_SAVED_REPORTS = 25;

type CrashListener = (report: CrashReport) => void;
const listeners: Set<CrashListener> = new Set();

/**
 * Register a listener to be notified immediately when an error or crash is reported
 */
export function onCrashReported(listener: CrashListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Capture client memory statistics if performance.memory API is available
 */
function getMemoryStats() {
  if (typeof window !== 'undefined' && (performance as any)?.memory) {
    const mem = (performance as any).memory;
    return {
      usedJSHeapSizeMB: Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10,
      totalJSHeapSizeMB: Math.round((mem.totalJSHeapSize / (1024 * 1024)) * 10) / 10,
      jsHeapSizeLimitMB: Math.round((mem.jsHeapSizeLimit / (1024 * 1024)) * 10) / 10,
    };
  }
  return undefined;
}

/**
 * Retrieve saved crash reports from localStorage
 */
export function getSavedCrashReports(): CrashReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read crash reports from storage', err);
    return [];
  }
}

/**
 * Clear stored crash reports
 */
export function clearSavedCrashReports(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear crash reports', err);
  }
}

/**
 * Record a crash, save to local storage, and broadcast to subscribers (UI popup modal)
 */
export function recordCrash(
  error: any,
  options: {
    type?: CrashReport['type'];
    componentStack?: string;
    extraInfo?: Record<string, any>;
  } = {}
): CrashReport {
  let userBadgeId: string | undefined;
  let userRole: string | undefined;

  try {
    const sessionStr = localStorage.getItem('bma_auth_session');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      userBadgeId = session.userBadgeId;
      userRole = session.userRole;
    }
  } catch (_) {
    // Ignore auth read errors
  }

  const errorName = error?.name || 'Error';
  const errorMessage =
    error?.message || (typeof error === 'string' ? error : 'Unknown runtime exception occurred');
  const stack = error?.stack || undefined;

  const now = new Date();
  const report: CrashReport = {
    id: `CRASH-${now.getTime()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    timestamp: now.toISOString(),
    localTime: now.toLocaleString(),
    errorName,
    errorMessage,
    stack,
    componentStack: options.componentStack,
    type: options.type || 'uncaught_exception',
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    screenSize:
      typeof window !== 'undefined'
        ? `${window.innerWidth}x${window.innerHeight} (dpr ${window.devicePixelRatio || 1})`
        : '',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    userBadgeId,
    userRole,
    memoryUsage: getMemoryStats(),
  };

  // Save to localStorage
  try {
    const existing = getSavedCrashReports();
    const updated = [report, ...existing].slice(0, MAX_SAVED_REPORTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (saveErr) {
    console.warn('Unable to persist crash report to localStorage', saveErr);
  }

  // Console output for developers
  console.error('[CRASH REPORT CAPTURED]', report);

  // Notify all active listeners (e.g. Popup Notification Modal)
  listeners.forEach((listener) => {
    try {
      listener(report);
    } catch (listenerErr) {
      console.error('Error invoking crash listener', listenerErr);
    }
  });

  return report;
}

/**
 * Format crash report as a clean diagnostic text string ready for clipboard or support tickets
 */
export function formatCrashReportForSharing(report: CrashReport): string {
  return `========================================
BAHIR DAR MOTORCYCLE PERMIT SYSTEM
CRASH & DIAGNOSTIC REPORT
========================================
Report ID:     ${report.id}
Timestamp:     ${report.localTime} (${report.timestamp})
Type:          ${report.type}
Error Name:    ${report.errorName}
Message:       ${report.errorMessage}

--- User & Session ---
Badge ID:      ${report.userBadgeId || 'N/A (Not Logged In)'}
Role:          ${report.userRole || 'N/A'}
Online Status: ${report.online ? 'Online' : 'Offline'}
Page URL:      ${report.url}
Screen:        ${report.screenSize}
${
  report.memoryUsage
    ? `Memory:        ${report.memoryUsage.usedJSHeapSizeMB}MB / ${report.memoryUsage.totalJSHeapSizeMB}MB (Heap limit: ${report.memoryUsage.jsHeapSizeLimitMB}MB)`
    : ''
}

--- Browser / Environment ---
User Agent:    ${report.userAgent}

--- Component Stack ---
${report.componentStack || 'No React component stack available'}

--- Error Call Stack ---
${report.stack || 'No call stack available'}
========================================`;
}

/**
 * Copy formatted crash report to clipboard
 */
export async function copyCrashReportToClipboard(report: CrashReport): Promise<boolean> {
  const text = formatCrashReportForSharing(report);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn('navigator.clipboard failed, fallback to textarea', e);
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (fallbackErr) {
    console.error('Fallback copy failed', fallbackErr);
    return false;
  }
}

/**
 * Initialize global window error handlers to capture unhandled exceptions and promise rejections
 */
let globalHandlersInitialized = false;

export function initGlobalCrashHandlers(): void {
  if (typeof window === 'undefined' || globalHandlersInitialized) return;
  globalHandlersInitialized = true;

  window.addEventListener('error', (event) => {
    // Filter out benign websocket errors if any
    if (
      event.message?.includes('failed to connect to websocket') ||
      event.message?.includes('ResizeObserver loop')
    ) {
      return;
    }

    recordCrash(event.error || event.message, {
      type: 'uncaught_exception',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    // Filter out harmless aborted network or websocket rejections
    if (event.reason?.name === 'AbortError') return;

    recordCrash(event.reason || 'Unhandled Promise Rejection', {
      type: 'unhandled_rejection',
    });
  });

  console.info('[CrashReporter] Global crash and exception capture initialized.');
}
