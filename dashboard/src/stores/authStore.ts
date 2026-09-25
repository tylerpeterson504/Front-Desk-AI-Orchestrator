import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setCredentials: (user: User, token: string) => void;
  clearCredentials: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setCredentials: (user, token) => set({
        user,
        token,
        isAuthenticated: true,
        error: null
      }),

      clearCredentials: () => set({
        user: null,
        token: null,
        isAuthenticated: false
      }),

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error })
    }),
    {
      name: 'auth-storage',
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as AuthState;
        return { user: state.user, token: state.token, isAuthenticated: state.isAuthenticated };
      },
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

// Token storage for backward compatibility with existing code
export const tokenStore = {
  get: () => useAuthStore.getState().token,
  set: (token: string) => {
    const user = useAuthStore.getState().user;
    if (user) useAuthStore.getState().setCredentials(user, token);
  },
  clear: () => useAuthStore.getState().clearCredentials()
};
