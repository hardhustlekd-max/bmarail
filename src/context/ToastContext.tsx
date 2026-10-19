import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { Icon } from '../components/ui/Icon';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastOptions {
  title?: string;
  tag?: string;
  durationMs?: number;
}

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  tag?: string;
  timestamp: number;
  durationMs: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  activeToast: ToastItem | null;
  queueCount: number;
  addToast: (
    message: string,
    type?: ToastType,
    optionsOrDuration?: number | ToastOptions
  ) => void;
  removeToast: (id?: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Short default display duration so notifications don't stay for a long time
const DEFAULT_DURATION_MS = 2600;
// Accelerated duration when subsequent notifications are waiting in the queue
const QUEUED_DURATION_MS = 2000;

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activeToast, setActiveToast] = useState<ToastItem | null>(null);
  const [queue, setQueue] = useState<ToastItem[]>([]);

  // Deduplication cache: tracks recent message timestamps to prevent rapid duplicates
  const recentToastsRef = useRef<Map<string, number>>(new Map());
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Advance to next toast in queue
  const nextToast = useCallback(() => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }

    setQueue((prevQueue) => {
      if (prevQueue.length === 0) {
        setActiveToast(null);
        return [];
      }
      const [nextItem, ...remainingQueue] = prevQueue;
      setActiveToast(nextItem);
      return remainingQueue;
    });
  }, []);

  const removeToast = useCallback(
    (id?: string) => {
      if (!id || (activeToast && activeToast.id === id)) {
        nextToast();
      } else {
        setQueue((prev) => prev.filter((t) => t.id !== id));
      }
    },
    [activeToast, nextToast]
  );

  // Set auto-dismiss timer whenever activeToast changes
  useEffect(() => {
    if (!activeToast) return;

    const duration =
      queue.length > 0 && activeToast.durationMs === DEFAULT_DURATION_MS
        ? QUEUED_DURATION_MS
        : activeToast.durationMs;

    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
    }

    activeTimerRef.current = setTimeout(() => {
      nextToast();
    }, duration);

    return () => {
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }
    };
  }, [activeToast, queue.length, nextToast]);

  const addToast = useCallback(
    (
      message: string,
      type: ToastType = 'info',
      optionsOrDuration?: number | ToastOptions
    ) => {
      if (!message || !message.trim()) return;

      const trimmedMsg = message.trim();
      const options: ToastOptions =
        typeof optionsOrDuration === 'number'
          ? { durationMs: optionsOrDuration }
          : optionsOrDuration || {};

      const durationMs = options.durationMs && options.durationMs > 0 ? options.durationMs : DEFAULT_DURATION_MS;
      const dedupeKey = `${type}::${trimmedMsg}`;
      const now = Date.now();

      // Check if the exact same message was emitted in the last 1500ms
      const lastEmittedAt = recentToastsRef.current.get(dedupeKey);
      if (lastEmittedAt && now - lastEmittedAt < 1500) {
        return;
      }
      recentToastsRef.current.set(dedupeKey, now);

      // Clean up stale cache keys older than 8s
      for (const [key, ts] of recentToastsRef.current.entries()) {
        if (now - ts > 8000) {
          recentToastsRef.current.delete(key);
        }
      }

      const id = `toast-${now}-${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = {
        id,
        message: trimmedMsg,
        type,
        title: options.title,
        tag: options.tag,
        timestamp: now,
        durationMs,
      };

      // If no active toast, show immediately; otherwise queue to show one after the other
      setActiveToast((current) => {
        if (!current) {
          return newToast;
        } else {
          // If identical message is already active, don't re-queue
          if (current.type === type && current.message === trimmedMsg) {
            return current;
          }
          setQueue((prev) => {
            // Prevent duplicate in queue
            const alreadyInQueue = prev.some((t) => t.type === type && t.message === trimmedMsg);
            if (alreadyInQueue) return prev;
            return [...prev, newToast];
          });
          return current;
        }
      });
    },
    []
  );

  const clearToasts = useCallback(() => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    recentToastsRef.current.clear();
    setActiveToast(null);
    setQueue([]);
  }, []);

  // For backward compatibility, toasts array returns [activeToast] if present
  const toasts = activeToast ? [activeToast] : [];

  return (
    <ToastContext.Provider
      value={{
        toasts,
        activeToast,
        queueCount: queue.length,
        addToast,
        removeToast,
        clearToasts,
      }}
    >
      {children}

      {/* 
        UNIVERSAL FLOATING TOASTER
        - Position: Under top navigation bar (top-right on desktop & tablet, center-top on mobile)
        - Sequential Queue: Shows 1 notification at a time, one after the other for a short duration
      */}
      <div
        id="toast-notifications-container"
        className="fixed top-[62px] sm:top-[68px] left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-auto sm:right-6 z-[99999] pointer-events-none flex flex-col items-center sm:items-end w-[92vw] max-w-sm sm:max-w-md sm:w-auto"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeToast && (
          <div
            key={activeToast.id}
            className={`pointer-events-auto relative overflow-hidden w-full rounded-xl p-3 sm:p-3.5 shadow-xl text-white transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
              activeToast.type === 'success'
                ? 'bg-[#10B981] border border-emerald-400/60 shadow-emerald-950/25'
                : activeToast.type === 'warning'
                ? 'bg-[#F59E0B] border border-amber-400/60 shadow-amber-950/25'
                : activeToast.type === 'error'
                ? 'bg-[#EF4444] border border-rose-400/60 shadow-rose-950/25'
                : 'bg-slate-900 border border-slate-700 shadow-black/30'
            }`}
          >
            {/* Top highlight line */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-white/30 pointer-events-none" />

            <div className="flex items-start gap-2.5 relative z-10">
              {/* Icon badge with crisp contrasting container */}
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0 mt-0.5 shadow-xs text-white">
                <Icon className="material-symbols-outlined text-[18px] sm:text-[20px]">
                  {activeToast.type === 'success'
                    ? 'check_circle'
                    : activeToast.type === 'warning'
                    ? 'warning'
                    : activeToast.type === 'error'
                    ? 'error'
                    : 'info'}
                </Icon>
              </div>

              {/* Message text */}
              <div className="flex-1 min-w-0 pr-1 text-left">
                {activeToast.title && (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-black tracking-wide opacity-95">
                      {activeToast.title}
                    </span>
                    {activeToast.tag && (
                      <span className="px-1.5 py-0.2 rounded bg-black/25 text-[10px] font-mono font-bold">
                        {activeToast.tag}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs font-bold leading-snug text-white break-words">
                  {activeToast.message}
                </p>
              </div>

              {/* Queue badge counter if more notifications are waiting */}
              {queue.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-black/25 text-[10px] font-mono font-bold text-white/90 shrink-0 self-center">
                  +{queue.length}
                </span>
              )}

              {/* Dismiss button */}
              <button
                type="button"
                onClick={() => nextToast()}
                className="text-white/80 hover:text-white hover:bg-white/20 p-1 rounded-md shrink-0 cursor-pointer transition-colors"
                title="Dismiss"
              >
                <Icon className="material-symbols-outlined text-[16px] font-bold">close</Icon>
              </button>
            </div>

            {/* Auto-dismiss countdown bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/20 overflow-hidden">
              <div
                className="h-full bg-white/40 origin-left animate-toast-countdown"
                style={{
                  animationDuration: `${
                    queue.length > 0 && activeToast.durationMs === DEFAULT_DURATION_MS
                      ? QUEUED_DURATION_MS
                      : activeToast.durationMs
                  }ms`,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
