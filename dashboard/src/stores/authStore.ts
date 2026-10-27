import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  // Bumped on every credential clear, so a refresh started under an older value is discarded.
  sessionCounter: number;
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
      sessionCounter: 0,

      setCredentials: (user, token) =>
        set({
          user,
          token,
          isAuthenticated: true,
          error: null,
        }),

      clearCredentials: () =>
        set((state) => ({
          user: null,
          token: null,
          isAuthenticated: false,
          sessionCounter: state.sessionCounter + 1,
        })),

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'auth-storage',
      // v2 keeps the access token in memory; older entries keep only user and isAuthenticated.
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as AuthState;
        return { user: state.user, isAuthenticated: state.isAuthenticated };
      },
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Token storage for backward compatibility with existing code
export const tokenStore = {
  get: () => useAuthStore.getState().token,
  set: (token: string) => useAuthStore.setState({ token }),
  clear: () => useAuthStore.getState().clearCredentials(),
};
