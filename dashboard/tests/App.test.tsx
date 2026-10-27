import axios, { AxiosError } from 'axios';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import api from '../src/services/api';
import { useAuthStore } from '../src/stores/authStore';
import type { User } from '../src/types';

const user: User = {
  id: 'u1',
  email: 'agent@hotel.com',
  name: 'Test Agent',
  role: 'agent',
  property_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const originalAdapter = api.defaults.adapter;

function ok(config: any, data: unknown) {
  return { config, data, status: 200, statusText: 'OK', headers: {} };
}

function unauthorized(config: any) {
  return new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
    config,
    data: {},
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
  } as any);
}

afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  useAuthStore.getState().clearCredentials();
});

describe('App session handling', () => {
  it('keeps the open page mounted when the access token changes', async () => {
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/me') return ok(config, user);
      if (config.url === '/templates') return ok(config, []);
      throw new Error(`unexpected request ${config.url}`);
    };
    useAuthStore.setState({ user, token: 'first', isAuthenticated: true });
    render(<App />);
    const heading = await screen.findByRole('heading', { name: 'Templates' });

    await act(async () => {
      useAuthStore.setState({ token: 'second' });
    });

    expect(screen.getByRole('heading', { name: 'Templates' })).toBe(heading);
  });

  it('returns to the sign-in page when the session expires', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Refresh denied'));
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/me') return ok(config, user);
      if (config.url === '/templates') throw unauthorized(config);
      throw new Error(`unexpected request ${config.url}`);
    };
    useAuthStore.setState({ user, token: 'expired', isAuthenticated: true });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Front Desk AI' })).toBeTruthy();
  });
});
