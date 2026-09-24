import axios, { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api, { authAPI } from '../src/services/api';
import { useAuthStore } from '../src/stores/authStore';

const originalAdapter = api.defaults.adapter;

afterEach(() => {
  api.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
  useAuthStore.getState().clearCredentials();
  localStorage.removeItem('refresh_token');
});

describe('dashboard auth API', () => {
  it('requests a cookie on login and logout without persisting a refresh token', async () => {
    const requests: Array<{ url?: string; withCredentials?: boolean; transport?: string }> = [];
    api.defaults.adapter = async (config) => {
      requests.push({ url: config.url, withCredentials: config.withCredentials, transport: config.headers.get('X-Refresh-Token-Transport') as string });
      return { config, data: { token: 'access' }, status: 200, statusText: 'OK', headers: {} };
    };

    await authAPI.login('agent@example.com', 'password');
    await authAPI.logout();

    expect(requests).toEqual([
      { url: '/auth/login', withCredentials: true, transport: 'cookie' },
      { url: '/auth/logout', withCredentials: true, transport: 'cookie' }
    ]);
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('retries unauthorized requests with the rotated cookie and updates the access token', async () => {
    useAuthStore.getState().setCredentials({ id: '1', email: 'agent@example.com', name: 'Agent', role: 'agent' }, 'old-access');
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'new-access' } });
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      attempts += 1;
      if (attempts === 1) {
        throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined,
          { config, data: {}, status: 401, statusText: 'Unauthorized', headers: {} });
      }
      expect(config.headers.get('Authorization')).toBe('Bearer new-access');
      return { config, data: { ok: true }, status: 200, statusText: 'OK', headers: {} };
    };

    await expect(api.get('/properties')).resolves.toMatchObject({ data: { ok: true } });
    expect(refresh).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), {}, {
      headers: { 'X-Refresh-Token-Transport': 'cookie' }, withCredentials: true
    });
    expect(useAuthStore.getState().token).toBe('new-access');
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });
});
