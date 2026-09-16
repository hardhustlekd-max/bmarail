import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Icon } from '../components/ui/Icon';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  timestamp: number;
  durationMs?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning', durationMs?: number) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', durationMs = 4500) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const normalizedType = (type as string) === 'warning' ? 'error' : type;
      const newToast: ToastItem = {
        id,
        message,
        type: normalizedType,
        timestamp: Date.now(),
        durationMs,
      };

      setToasts((prev) => [...prev.slice(-4), newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
      {children}
      {/* Universal Floating Toast Container */}
      <div
        className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0"
        aria-live="assertive"
      >
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';

          const bgClass = isSuccess
            ? 'bg-slate-900 border-emerald-500/80 text-white shadow-emerald-950/40'
            : isError
            ? 'bg-slate-900 border-rose-500/80 text-white shadow-rose-950/40'
            : 'bg-slate-900 border-blue-500/80 text-white shadow-blue-950/40';

          const iconName = isSuccess
            ? 'check_circle'
            : isError
            ? 'error'
            : 'info';

          const iconColor = isSuccess
            ? 'text-emerald-400'
            : isError
            ? 'text-rose-400'
            : 'text-blue-400';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-lg border shadow-xl backdrop-blur-md transition-all duration-200 ${bgClass}`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className={`material-symbols-outlined text-[20px] shrink-0 ${iconColor}`}>
                  {iconName}
                </Icon>
                <p className="text-xs font-semibold leading-relaxed break-words">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors shrink-0 cursor-pointer"
                title="Dismiss"
              >
                <Icon className="material-symbols-outlined text-[16px]">close</Icon>
              </button>
            </div>
          );
        })}
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
