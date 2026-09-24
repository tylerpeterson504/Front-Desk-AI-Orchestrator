import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import api, { authAPI, setOnUnauthorized } from '../src/services/api';

function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    config,
    data: { error: 'Unauthorized' },
    headers: new AxiosHeaders(),
    status: 401,
    statusText: 'Unauthorized'
  });
}

describe('dashboard authentication requests', () => {
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    onUnauthorized.mockClear();
    setOnUnauthorized(onUnauthorized);
  });

  afterEach(() => vi.restoreAllMocks());

  it('refreshes with the backend contract, stores rotated tokens, and retries with the new access token', async () => {
    localStorage.setItem('access_token', 'expired-access');
    localStorage.setItem('refresh_token', 'old-refresh');
    const authorizationHeaders: unknown[] = [];
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      authorizationHeaders.push(config.headers.Authorization);
      if (authorizationHeaders.length === 1) throw unauthorized(config);
      return { config, data: { id: 'current-user' }, headers: new AxiosHeaders(), status: 200, statusText: 'OK' };
    });
    api.defaults.adapter = adapter;
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { token: 'new-access', refresh_token: 'new-refresh' }
    });

    await expect(authAPI.me()).resolves.toEqual({ id: 'current-user' });

    expect(refresh).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledWith(api.defaults.baseURL + '/auth/refresh', {
      refresh_token: 'old-refresh'
    });
    expect(authorizationHeaders).toEqual(['Bearer expired-access', 'Bearer new-access']);
    expect(localStorage.getItem('access_token')).toBe('new-access');
    expect(localStorage.getItem('refresh_token')).toBe('new-refresh');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('clears credentials and notifies once if refresh is rejected', async () => {
    localStorage.setItem('access_token', 'expired-access');
    localStorage.setItem('refresh_token', 'invalid-refresh');
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => { throw unauthorized(config); });
    api.defaults.adapter = adapter;
    const refresh = vi.spyOn(axios, 'post').mockRejectedValue(new Error('Refresh denied'));

    await expect(authAPI.me()).rejects.toMatchObject({ response: { status: 401 } });

    expect(adapter).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not attempt a refresh without a stored refresh token', async () => {
    localStorage.setItem('access_token', 'expired-access');
    api.defaults.adapter = vi.fn(async (config: InternalAxiosRequestConfig) => { throw unauthorized(config); });
    const refresh = vi.spyOn(axios, 'post');

    await expect(authAPI.me()).rejects.toMatchObject({ response: { status: 401 } });

    expect(refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('does not repeatedly refresh a request that still returns 401 after retry', async () => {
    localStorage.setItem('refresh_token', 'old-refresh');
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => { throw unauthorized(config); });
    api.defaults.adapter = adapter;
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { token: 'new-access', refresh_token: 'new-refresh' }
    });

    await expect(authAPI.me()).rejects.toMatchObject({ response: { status: 401 } });

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('sends the stored refresh token to logout for server-side revocation', async () => {
    localStorage.setItem('refresh_token', 'session-to-revoke');
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      config, data: undefined, headers: new AxiosHeaders(), status: 204, statusText: 'No Content'
    }));
    api.defaults.adapter = adapter;

    await authAPI.logout();

    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter.mock.calls[0]?.[0].url).toBe('/auth/logout');
    expect(JSON.parse(adapter.mock.calls[0]![0].data)).toEqual({ refresh_token: 'session-to-revoke' });
  });

  it('sends a null refresh token when signing out without a stored session', async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      config, data: undefined, headers: new AxiosHeaders(), status: 204, statusText: 'No Content'
    }));
    api.defaults.adapter = adapter;

    await authAPI.logout();

    expect(JSON.parse(adapter.mock.calls[0]![0].data)).toEqual({ refresh_token: null });
  });
});
