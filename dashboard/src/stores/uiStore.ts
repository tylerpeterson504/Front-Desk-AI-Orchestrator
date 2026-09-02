import { create } from 'zustand';

interface UIState {
  isLoading: boolean;
  alert: {
    type: 'success' | 'error' | 'warning' | 'info' | null;
    message: string;
    show: boolean;
  };
  setLoading: (isLoading: boolean) => void;
  showAlert: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  hideAlert: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  alert: {
    type: null,
    message: '',
    show: false
  },

  setLoading: (isLoading) => set({ isLoading }),

  showAlert: (type, message) => set({
    alert: {
      type,
      message,
      show: true
    }
  }),

  hideAlert: () => set({
    alert: {
      type: null,
      message: '',
      show: false
    }
  })
}));
