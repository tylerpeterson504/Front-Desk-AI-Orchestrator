// Same-origin by default: the backend serves this dashboard in production.
// Override with REACT_APP_API_URL for development against a local backend
// (e.g. REACT_APP_API_URL=http://localhost:3001/api).
const API_BASE = process.env.REACT_APP_API_URL || '/api';
const TOKEN_KEY = 'token';
const REFRESH_KEY = 'refresh_token';
const unauthorizedListeners = new Set();

// Anything that needs the tokens goes through these so there is one place that
// knows where they live. The access token is short-lived (15 minutes); the
// refresh token is what keeps a session alive, and is single-use — every
// refresh returns a replacement, so it must be written back.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setSession: ({ token, refresh_token: refreshToken }) => {
    localStorage.setItem(TOKEN_KEY, token);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }
};

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function refreshTokens() {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) throw new ApiError('No refresh token', 401, 'NO_REFRESH');

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  if (!res.ok) {
    tokenStore.clear();
    throw new ApiError('Session expired', 401, 'REFRESH_FAILED');
  }
  const data = await res.json();
  tokenStore.setSession(data);
  return data.token;
}

async function request(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = tokenStore.get();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  // Single-use refresh token flow: on 401, try exactly one refresh + retry.
  if (res.status === 401 && auth && retry) {
    try {
      await refreshTokens();
      return request(path, { method, body, auth, retry: false });
    } catch (error) {
      unauthorizedListeners.forEach((listener) => listener(error));
      throw error;
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
      code = data.code;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(message, res.status, code);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', {
    method: 'POST',
    body: { refresh_token: tokenStore.getRefresh() },
    auth: false
  }),

  // Properties
  getProperties: () => request('/properties'),
  getProperty: (id) => request(`/properties/${id}`),
  createProperty: (payload) => request('/properties', { method: 'POST', body: payload }),
  updateProperty: (id, payload) => request(`/properties/${id}`, { method: 'PUT', body: payload }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: 'DELETE' }),

  // Templates
  getTemplates: () => request('/templates'),
  createTemplate: (payload) => request('/templates', { method: 'POST', body: payload }),
  updateTemplate: (id, payload) => request(`/templates/${id}`, { method: 'PUT', body: payload }),
  deleteTemplate: (id) => request(`/templates/${id}`, { method: 'DELETE' }),

  // Shift notes
  getShiftNotes: (params) => request(`/shift-notes${params ? `?${new URLSearchParams(params)}` : ''}`),
  createShiftNote: (payload) => request('/shift-notes', { method: 'POST', body: payload }),

  // Copilot
  draftReply: (payload) => request('/copilot/draft', { method: 'POST', body: payload }),

  // Audit logs
  getAuditLogs: (params) => request(`/audit-logs${params ? `?${new URLSearchParams(params)}` : ''}`)
};

export const authAPI = {
  login: async (email, password) => ({ data: await api.login(email, password) }),
  me: async () => ({ data: await api.me() }),
  logout: async () => ({ data: await api.logout() })
};

export const templatesAPI = {
  getAll: async () => ({ data: await api.getTemplates() }),
  create: (payload) => api.createTemplate(payload),
  update: (id, payload) => api.updateTemplate(id, payload),
  delete: (id) => api.deleteTemplate(id)
};

export const propertiesAPI = {
  getAll: async () => ({ data: await api.getProperties() }),
  getWifi: async (id) => ({ data: await request(`/properties/${id}/wifi`) }),
  create: (payload) => api.createProperty(payload),
  update: (id, payload) => api.updateProperty(id, payload),
  delete: (id) => api.deleteProperty(id)
};

export const shiftNotesAPI = {
  getToday: async () => ({ data: await api.getShiftNotes() }),
  create: (payload) => api.createShiftNote(payload),
  delete: (id) => request(`/shift-notes/${id}`, { method: 'DELETE' })
};

export const auditAPI = {
  getLogs: async (limit, offset) => ({ data: await api.getAuditLogs({ limit, offset }) })
};

export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export { ApiError };
