import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setCredentials: (user: User, token: string, refreshToken: string) => void;
  clearCredentials: () => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      setCredentials: (user, token, refreshToken) => set({
        user,
        token,
        refreshToken,
        isAuthenticated: true,
        error: null
      }),

      clearCredentials: () => set({
        user: null,
        token: null,
        refreshToken: null,
        isAuthenticated: false
      }),

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

// Token storage for backward compatibility with existing code
export const tokenStore = {
  get: () => useAuthStore.getState().token,
  set: (token: string) => useAuthStore.getState().setCredentials(
    useAuthStore.getState().user!,
    token,
    useAuthStore.getState().refreshToken || ''
  ),
  clear: () => useAuthStore.getState().clearCredentials()
};
