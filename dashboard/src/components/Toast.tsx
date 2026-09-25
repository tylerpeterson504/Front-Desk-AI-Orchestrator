import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  pushToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextToastId = 1;
const DEFAULT_TTL_MS = 5000;

/** Provides dismissible notifications that automatically disappear after five seconds. */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextToastId++;
      setToasts((current) => [...current, { id, type, message }]);
      // Auto-dismiss after a fixed TTL so transient failures cannot pile up.
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id));
      }, DEFAULT_TTL_MS);
    },
    []
  );

  const value = useMemo(() => ({ toasts, pushToast, dismissToast }), [toasts, pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              'flex items-start justify-between rounded-lg px-4 py-3 shadow-lg text-sm text-white max-w-sm ' +
              (toast.type === 'success'
                ? 'bg-green-600'
                : toast.type === 'error'
                  ? 'bg-red-600'
                  : 'bg-blue-600')
            }
          >
            <span>{toast.message}</span>
            <button
              type="button"
              className="ml-4 text-white/80 hover:text-white"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

/** Returns the toast controls and active notifications from the nearest ToastProvider. */
export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToasts must be used within a ToastProvider');
  }
  return ctx;
}
