import axios, { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api, { authAPI, setOnUnauthorized } from '../src/services/api';
import { useAuthStore } from '../src/stores/authStore';

const originalAdapter = api.defaults.adapter;

function unauthorized(config: any) {
  return new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
    config,
    data: {},
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
      requests.push({
        url: config.url,
        withCredentials: config.withCredentials,
        transport: config.headers.get('X-Refresh-Token-Transport') as string,
      });
      return { config, data: { token: 'access' }, status: 200, statusText: 'OK', headers: {} };
    };

    await authAPI.login('agent@example.com', 'password');
    await authAPI.logout();

    expect(requests).toEqual([
      { url: '/auth/login', withCredentials: true, transport: 'cookie' },
      { url: '/auth/logout', withCredentials: true, transport: 'cookie' },
    ]);
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('retries unauthorized requests with the rotated cookie and updates the access token', async () => {
    useAuthStore
      .getState()
      .setCredentials(
        { id: '1', email: 'agent@example.com', name: 'Agent', role: 'agent' },
        'old-access'
      );
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'new-access' } });
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      attempts += 1;
      if (attempts === 1) {
        throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
          config,
          data: {},
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
        });
      }
      expect(config.headers.get('Authorization')).toBe('Bearer new-access');
      return { config, data: { ok: true }, status: 200, statusText: 'OK', headers: {} };
    };

    await expect(api.get('/properties')).resolves.toMatchObject({ data: { ok: true } });
    expect(refresh).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      {},
      {
        headers: { 'X-Refresh-Token-Transport': 'cookie' },
        withCredentials: true,
        timeout: 15000,
      }
    );
    expect(useAuthStore.getState().token).toBe('new-access');
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('clears credentials and notifies once when the refresh cookie is rejected', async () => {
    const onUnauthorized = vi.fn();
    setOnUnauthorized(onUnauthorized);
    useAuthStore
      .getState()
      .setCredentials(
        { id: '1', email: 'agent@example.com', name: 'Agent', role: 'agent' },
        'expired-access'
      );
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Refresh denied'));
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
        config,
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
      });
    };
    await expect(api.get('/properties')).rejects.toMatchObject({ response: { status: 401 } });
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shares one refresh request across concurrent unauthorized responses', async () => {
    useAuthStore
      .getState()
      .setCredentials(
        { id: '1', email: 'agent@example.com', name: 'Agent', role: 'agent' },
        'old-access'
      );
    let resolveRefresh: (value: unknown) => void = () => {};
    const refresh = vi
      .spyOn(axios, 'post')
      .mockReturnValue(new Promise((resolve) => (resolveRefresh = resolve)));
    api.defaults.adapter = async (config) => {
      if (config.headers.get('Authorization') === 'Bearer old-access') {
        throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
          config,
          data: {},
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
        });
      }
      return { config, data: { ok: true }, status: 200, statusText: 'OK', headers: {} };
    };

    const requests = Promise.all([api.get('/properties'), api.get('/templates')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(refresh).toHaveBeenCalledOnce();
    resolveRefresh({ data: { token: 'new-access' } });

    const [first, second] = await requests;
    expect(first.data).toEqual({ ok: true });
    expect(second.data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().token).toBe('new-access');
  });

  it('does not repeatedly refresh a request that still returns 401 after retry', async () => {
    useAuthStore
      .getState()
      .setCredentials(
        { id: '1', email: 'agent@example.com', name: 'Agent', role: 'agent' },
        'expired-access'
      );
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'new-access' } });
    let attempts = 0;
    api.defaults.adapter = async (config) => {
      attempts += 1;
      throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, {
        config,
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
      });
    };
    await expect(api.get('/properties')).rejects.toMatchObject({ response: { status: 401 } });
    expect(attempts).toBe(2);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('discards a refresh that completes after logout', async () => {
    useAuthStore
      .getState()
      .setCredentials(
        { id: '1', email: 'agent@example.com', name: 'Agent', role: 'agent' },
        'old-access'
      );
    let resolveRefresh: (value: unknown) => void = () => {};
    vi.spyOn(axios, 'post').mockReturnValue(new Promise((resolve) => (resolveRefresh = resolve)));
    api.defaults.adapter = async (config) => {
      if (config.headers.get('Authorization') !== 'Bearer late-access') throw unauthorized(config);
      return { config, data: { ok: true }, status: 200, statusText: 'OK', headers: {} };
    };

    const request = api.get('/properties');
    await tick();
    useAuthStore.getState().clearCredentials();
    resolveRefresh({ data: { token: 'late-access' } });

    await expect(request).rejects.toMatchObject({ response: { status: 401 } });
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('keeps the next session when a refresh from an ended session is discarded', async () => {
    let resolveEndedRefresh: (value: unknown) => void = () => {};
    const refresh = vi
      .spyOn(axios, 'post')
      .mockReturnValueOnce(new Promise((resolve) => (resolveEndedRefresh = resolve)))
      .mockResolvedValueOnce({ data: { token: 'b-refreshed' } });
    api.defaults.adapter = async (config) => {
      const authorization = config.headers.get('Authorization');
      if (authorization === 'Bearer old-access' || authorization === 'Bearer b-access') {
        throw unauthorized(config);
      }
      return { config, data: { ok: true }, status: 200, statusText: 'OK', headers: {} };
    };
    useAuthStore
      .getState()
      .setCredentials({ id: '1', email: 'a@example.com', name: 'A', role: 'agent' }, 'old-access');
    const endedSession = api.get('/properties');
    await tick();

    useAuthStore.getState().clearCredentials();
    useAuthStore
      .getState()
      .setCredentials({ id: '2', email: 'b@example.com', name: 'B', role: 'agent' }, 'b-access');
    const nextSession = await api.get('/templates');
    resolveEndedRefresh({ data: { token: 'late-access' } });

    await expect(endedSession).rejects.toMatchObject({ response: { status: 401 } });
    expect(nextSession.data).toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().token).toBe('b-refreshed');
    expect(useAuthStore.getState().user?.id).toBe('2');
  });
});
