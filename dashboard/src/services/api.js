const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const TOKEN_KEY = 'token';

// Anything that needs the token goes through these so there is one place that
// knows where it lives.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY)
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

async function request(method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));

    // An expired or revoked token should log us out rather than surface as a
    // generic failure on every page.
    if (res.status === 401 && path !== '/auth/login') {
      tokenStore.clear();
      unauthorizedHandlers.forEach((handler) => handler());
    }

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
  me: () => request('GET', '/auth/me')
};

export const propertiesAPI = {
  getAll: () => request('GET', '/properties'),
  getOne: (id) => request('GET', `/properties/${id}`),
  create: (data) => request('POST', '/properties', data),
  update: (id, data) => request('PUT', `/properties/${id}`, data),
  delete: (id) => request('DELETE', `/properties/${id}`),
  // Audit-logged on the server; only call this on an explicit user action.
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
  getLogs: (limit = 100, offset = 0) =>
    request('GET', `/audit-logs?limit=${limit}&offset=${offset}`)
};
