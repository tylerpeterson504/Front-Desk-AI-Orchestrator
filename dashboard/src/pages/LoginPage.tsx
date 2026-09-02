import React from 'react';
import { Alert } from '../components/Alert';
import { authAPI } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { Loader2, LockKeyhole } from '../components/icons';
import { User } from '../types';

interface LoginPageProps {
  onAuthenticated: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthenticated }) => {
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const setCredentials = useAuthStore((state) => state.setCredentials);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await authAPI.login(email.trim(), password);
      if (!response.token) throw new Error('Login response did not include a token');

      // Store both the access token and the refresh token
      setCredentials(response.user, response.token, response.refresh_token);
      onAuthenticated(response.user);
    } catch (err: unknown) {
      const errorMessage = (err as { status?: number; message?: string }).status === 401
        ? 'Incorrect email or password'
        : (err as { message?: string }).message || 'Login failed';
      setError(errorMessage);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6 space-x-2 text-gray-800">
          <LockKeyhole size={22} />
          <h1 className="text-xl font-semibold">Front Desk AI</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow space-y-4">
          {error && <Alert type="error" message={error} onClose={() => setError('')} />}

          <div>
            <label htmlFor="email" className="block text-sm text-gray-600 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-gray-600 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-4">
          Accounts are created by an administrator.
        </p>
      </div>
    </div>
  );
};
