// Same-origin by default: the backend serves this dashboard in production.
// Override with REACT_APP_API_URL for development against a local backend
// (e.g. REACT_APP_API_URL=http://localhost:3001/api).
const API_BASE = process.env.REACT_APP_API_URL || '/api';
const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refresh_token';

// Anything that needs the tokens goes through these so there is one place that
// knows where they live. The access token is short-lived (15 minutes); the
// refresh token is what keeps a session alive, and is single-use — every
// refresh returns a replacement, so it must be written back.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setSession: ({ token, refresh_token: refreshToken }) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
};

// Subscribers (the app shell) are told when the server rejects our token so the
// UI can drop back to the login screen instead of showing empty pages.
const unauthorizedHandlers = new Set();

export function onUnauthorized(handler) {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

function getHeaders() {
  const token = tokenStore.get();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {})
  };
}

// Paths that must never trigger a refresh attempt: they are how a session is
// established or ended, so a 401 from them is final.
const SESSION_PATHS = new Set(['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']);

// One refresh in flight at a time. Several pages loading at once will all get
// 401s within milliseconds of each other; without this they would each rotate
// the refresh token, and the losers would present a superseded one — which the
// server treats as theft and revokes the whole family.
let refreshInFlight = null;

function refreshSession() {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return Promise.resolve(false);

  refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      tokenStore.setSession(data);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

function logoutLocally() {
  tokenStore.clear();
  unauthorizedHandlers.forEach((handler) => handler());
}

async function send(method, path, body) {
  return fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });
}

async function request(method, path, body) {
  let res = await send(method, path, body);

  if (res.status === 401 && !SESSION_PATHS.has(path)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await send(method, path, body);
    }
    if (!refreshed || res.status === 401) {
      logoutLocally();
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), {
      status: res.status,
      requestId: err.request_id
    });
  }

  if (res.status === 204) return { data: null };
  const data = await res.json();
  return { data };
}

export const authAPI = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (email, password, name) => request('POST', '/auth/register', { email, password, name }),
  me: () => request('GET', '/auth/me'),
  logout: async () => {
    const refreshToken = tokenStore.getRefresh();
    try {
      if (refreshToken) {
        await request('POST', '/auth/logout', { refresh_token: refreshToken });
      }
    } finally {
      tokenStore.clear();
    }
  },
  logoutEverywhere: () => request('POST', '/auth/logout-all')
};

export const propertiesAPI = {
  getAll: () => request('GET', '/properties'),
  getOne: (id) => request('GET', `/properties/${id}`),
  create: (data) => request('POST', '/properties', data),
  update: (id, data) => request('PUT', `/properties/${id}`, data),
  delete: (id) => request('DELETE', `/properties/${id}`),
  getWifi: (id) => request('GET', `/properties/${id}/wifi`)
};

export const templatesAPI = {
  getAll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request('GET', `/templates${qs ? `?${qs}` : ''}`);
  },
  getOne: (id) => request('GET', `/templates/${id}`),
  create: (data) => request('POST', '/templates', data),
  update: (id, data) => request('PUT', `/templates/${id}`, data),
  delete: (id) => request('DELETE', `/templates/${id}`)
};

export const shiftNotesAPI = {
  getToday: () => request('GET', '/shift-notes'),
  create: (data) => request('POST', '/shift-notes', data),
  update: (id, data) => request('PUT', `/shift-notes/${id}`, data),
  delete: (id) => request('DELETE', `/shift-notes/${id}`)
};

export const auditAPI = {
  getLogs: (limit = 100, offset = 0) => request('GET', `/audit-logs?limit=${limit}&offset=${offset}`)
};
