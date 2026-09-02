import React, { Fragment, ReactNode } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ExclamationTriangleIcon } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
  children?: ReactNode;
}

const variantStyles = {
  danger: {
    icon: 'text-red-500',
    confirm: 'bg-red-600 hover:bg-red-700 text-white',
    cancel: 'bg-gray-100 hover:bg-gray-200 text-gray-900'
  },
  warning: {
    icon: 'text-yellow-500',
    confirm: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    cancel: 'bg-gray-100 hover:bg-gray-200 text-gray-900'
  },
  info: {
    icon: 'text-blue-500',
    confirm: 'bg-blue-600 hover:bg-blue-700 text-white',
    cancel: 'bg-gray-100 hover:bg-gray-200 text-gray-900'
  }
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
  children
}) => {
  const styles = variantStyles[variant];

  const handleConfirm = async () => {
    if (!isLoading) {
      await onConfirm();
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" aria-hidden="true" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all"
              >
                <div className="flex items-center justify-center mb-4">
                  <ExclamationTriangleIcon
                    className={'h-8 w-8 ' + styles.icon}
                    aria-hidden="true"
                  />
                </div>

                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 text-center"
                >
                  {title}
                </Dialog.Title>

                <div className="mt-2">
                  <p className="text-sm text-gray-500 text-center">{message}</p>
                  {children}
                </div>

                <div className="mt-6 flex justify-center gap-4">
                  <button
                    type="button"
                    className={'inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' + styles.cancel}
                    onClick={onClose}
                    disabled={isLoading}
                  >
                    {cancelText}
                  </button>

                  <button
                    type="button"
                    className={'inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' + styles.confirm}
                    onClick={handleConfirm}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Processing...
                      </>
                    ) : (
                      confirmText
                    )}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

// Custom hook for confirmation dialog
export function useConfirmDialog(): [
  {
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    isLoading: boolean;
    resolve: (value: boolean) => void;
  },
  (options: { title: string; message: string; variant?: 'danger' | 'warning' | 'info' }) => Promise<boolean>
] {
  const [state, setState] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    isLoading: boolean;
    resolve: (value: boolean) => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    isLoading: false,
    resolve: () => {}
  });

  const confirm = React.useCallback(
    (options: { title: string; message: string; variant?: 'danger' | 'warning' | 'info' }) => {
      return new Promise<boolean>((resolve) => {
        setState({
          isOpen: true,
          title: options.title,
          message: options.message,
          variant: options.variant || 'danger',
          isLoading: false,
          resolve
        });
      });
    },
    []
  );

  const handleClose = React.useCallback(() => {
    state.resolve(false);
    setState((prev) => ({ ...prev, isOpen: false }));
  }, [state]);

  const handleConfirm = React.useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    state.resolve(true);
    setState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
  }, [state]);

  React.useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (state.isOpen) {
        state.resolve(false);
      }
    };
  }, [state]);

  return [state, confirm];
}
