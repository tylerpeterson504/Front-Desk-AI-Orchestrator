import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon, XCircleIcon, XIcon } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextType {
  addToast: (type: ToastType, message: string, title?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const toastIcons = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: ExclamationCircleIcon,
  info: InformationCircleIcon
};

const getToastColors = (type: ToastType) => {
  const colors = {
    success: 'bg-green-100 border-green-400 text-green-800',
    error: 'bg-red-100 border-red-400 text-red-800',
    warning: 'bg-yellow-100 border-yellow-400 text-yellow-800',
    info: 'bg-blue-100 border-blue-400 text-blue-800'
  };
  return colors[type];
};

const getButtonColors = (type: ToastType) => {
  const colors = {
    success: 'text-green-500 hover:bg-green-200',
    error: 'text-red-500 hover:bg-red-200',
    warning: 'text-yellow-500 hover:bg-yellow-200',
    info: 'text-blue-500 hover:bg-blue-200'
  };
  return colors[type];
};

interface ToastProps {
  toast: ToastMessage;
  onRemove: (id: string) => void;
}

const ToastComponent: React.FC<ToastProps> = ({ toast, onRemove }) => {
  const Icon = toastIcons[toast.type];
  const colors = getToastColors(toast.type);
  const buttonColors = getButtonColors(toast.type);

  return (
    <div
      className={'rounded-md p-4 mb-4 border-l-4 ' + colors}
      role="alert"
    >
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="ml-3">
          {toast.title && (
            <p className="text-sm font-medium">{toast.title}</p>
          )}
          <p className="text-sm">{toast.message}</p>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              type="button"
              className={'inline-flex rounded-md p-1.5 ' + buttonColors}
              onClick={() => onRemove(toast.id)}
            >
              <span className="sr-only">Dismiss</span>
              <XIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastType, message: string, title?: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message, title }]);
    
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 w-80">
        {toasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onRemove={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const useSuccessToast = () => {
  const { addToast } = useToast();
  return (message: string, title?: string) => addToast('success', message, title);
};

export const useErrorToast = () => {
  const { addToast } = useToast();
  return (message: string, title?: string) => addToast('error', message, title);
};

export const useWarningToast = () => {
  const { addToast } = useToast();
  return (message: string, title?: string) => addToast('warning', message, title);
};

export const useInfoToast = () => {
  const { addToast } = useToast();
  return (message: string, title?: string) => addToast('info', message, title);
};
