/**
 * Advanced Client-Side Image & Document Logger
 *
 * Provides real-time console telemetry, error diagnostics, and DevTools inspection
 * for image loading across the entire BMA Motorcycle Permit Application.
 *
 * Access in browser console:
 *   window.__IMAGE_DEBUG__.getLogs()
 *   window.__IMAGE_DEBUG__.getFailures()
 *   window.__IMAGE_DEBUG__.testImageUrl(url)
 */

export interface ImageLogEntry {
  id: string;
  timestamp: string;
  type: 'load' | 'success' | 'retry' | 'error';
  url: string;
  resolvedUrl?: string;
  context?: string;
  durationMs?: number;
  dimensions?: { width: number; height: number };
  errorDetails?: string;
}

const MAX_LOG_HISTORY = 100;
const logHistory: ImageLogEntry[] = [];
const failedUrls = new Set<string>();
const succeededUrls = new Set<string>();

/**
 * Visual styling for console output
 */
const STYLES = {
  badge: 'background: #1e293b; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;',
  success: 'background: #059669; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;',
  warn: 'background: #D97706; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;',
  error: 'background: #DC2626; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;',
  url: 'color: #2563EB; font-family: monospace; font-size: 11px; text-decoration: underline;',
  dim: 'color: #6B7280; font-size: 10px;',
};

function addEntry(entry: Omit<ImageLogEntry, 'id' | 'timestamp'>): ImageLogEntry {
  const fullEntry: ImageLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  logHistory.unshift(fullEntry);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.pop();
  }
  return fullEntry;
}

export const imageLogger = {
  /**
   * Log when an image begins loading
   */
  logLoad(url: string, details?: { context?: string; resolvedUrl?: string }) {
    if (!url) return;
    addEntry({
      type: 'load',
      url,
      resolvedUrl: details?.resolvedUrl,
      context: details?.context,
    });
  },

  /**
   * Log when an image renders successfully
   */
  logSuccess(
    url: string,
    dimensions?: { width: number; height: number },
    durationMs?: number,
    details?: { context?: string }
  ) {
    if (!url) return;
    succeededUrls.add(url);
    failedUrls.delete(url);

    addEntry({
      type: 'success',
      url,
      context: details?.context,
      dimensions,
      durationMs,
    });

    // Console confirmation
    console.info(
      `%cIMAGE OK%c ${details?.context ? `[${details.context}] ` : ''}${url.length > 80 ? url.substring(0, 80) + '...' : url} (${dimensions?.width || '?'}x${dimensions?.height || '?'}px${durationMs ? `, ${durationMs}ms` : ''})`,
      STYLES.success,
      'color: #059669; font-size: 11px;'
    );
  },

  /**
   * Log when an image load fails initially and falls back to proxy
   */
  logRetry(url: string, retryUrl: string, reason: string, details?: { context?: string }) {
    addEntry({
      type: 'retry',
      url,
      resolvedUrl: retryUrl,
      context: details?.context,
      errorDetails: reason,
    });

    console.warn(
      `%cIMAGE RETRY%c ${details?.context ? `[${details.context}] ` : ''}Direct load failed: "${url.length > 60 ? url.substring(0, 60) + '...' : url}". Attempting proxy: "${retryUrl.length > 60 ? retryUrl.substring(0, 60) + '...' : retryUrl}" (${reason})`,
      STYLES.warn,
      'color: #D97706; font-size: 11px;'
    );
  },

  /**
   * Log permanent image load failure with comprehensive diagnostics
   */
  logError(
    url: string,
    error: any,
    details?: {
      context?: string;
      attemptedUrls?: string[];
      naturalWidth?: number;
      naturalHeight?: number;
      [key: string]: any;
    }
  ) {
    if (!url) return;
    failedUrls.add(url);

    const errorMessage = typeof error === 'string' ? error : error?.message || 'Failed to decode or retrieve image';

    const entry = addEntry({
      type: 'error',
      url,
      context: details?.context,
      errorDetails: errorMessage,
    });

    console.group(`%cIMAGE ERROR%c Failed to load document/photo: ${details?.context || 'Unknown component'}`, STYLES.error, 'color: #DC2626; font-weight: bold;');
    console.error('Target URL:', url);
    if (details?.attemptedUrls && details.attemptedUrls.length > 0) {
      console.error('Attempted URLs in order:', details.attemptedUrls);
    }
    console.error('Failure Details:', errorMessage);
    console.info('Tip: Run window.__IMAGE_DEBUG__.testImageUrl("' + url + '") in console to diagnose HTTP status, headers, and CORS.');
    console.groupEnd();

    return entry;
  },
};

/**
 * Diagnostic tool for testing any image URL directly from browser console
 */
async function testImageUrl(url: string): Promise<void> {
  console.group(`%cIMAGE DIAGNOSTIC%c Testing URL: ${url}`, STYLES.badge, STYLES.url);
  const startTime = performance.now();

  try {
    const res = await fetch(url, { method: 'GET' });
    const duration = Math.round(performance.now() - startTime);

    console.log('HTTP Status:', res.status, res.statusText);
    console.log('Duration:', `${duration}ms`);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Length:', res.headers.get('content-length'), 'bytes');
    console.log('CORS (Access-Control-Allow-Origin):', res.headers.get('access-control-allow-origin') || 'Not present');
    console.log('Cache-Control:', res.headers.get('cache-control'));

    if (!res.ok) {
      console.error(`HTTP error: Server returned ${res.status}. If 403, bucket is private and must use proxy. If 404, file key does not exist.`);
    } else {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        console.error('CRITICAL: Server returned HTML instead of image binary! This usually means an SPA fallback or missing route caught the request.');
      } else if (contentType.startsWith('image/')) {
        console.info('SUCCESS: Server returned valid image MIME header.');
      }
    }
  } catch (err: any) {
    console.error('Fetch Failed (CORS or Network Error):', err.message || err);
  }
  console.groupEnd();
}

// Attach global developer helper in browser environment
if (typeof window !== 'undefined') {
  (window as any).__IMAGE_DEBUG__ = {
    getLogs: () => [...logHistory],
    getFailures: () => Array.from(failedUrls),
    getSuccesses: () => Array.from(succeededUrls),
    clearLogs: () => {
      logHistory.length = 0;
      failedUrls.clear();
      succeededUrls.clear();
      console.log('[ImageDebug] Logs cleared.');
    },
    testImageUrl,
  };

  // Global window error listener for unhandled <img> tag errors
  window.addEventListener(
    'error',
    (event: Event) => {
      const target = event.target as HTMLElement;
      if (target && target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        const src = img.currentSrc || img.src;
        if (src && !src.startsWith('data:image/svg')) {
          imageLogger.logError(src, 'Window error event on <img />', {
            context: img.alt || img.id || img.className || 'Native <img>',
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          });
        }
      }
    },
    true // capture phase to catch resource loading errors
  );
}
