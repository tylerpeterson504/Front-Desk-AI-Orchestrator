const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

function getHeaders() {
  const token = localStorage.getItem('token');
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
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status });
  }

  if (res.status === 204) return { data: null };
  const data = await res.json();
  return { data };
}

export const authAPI = {
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (email, password, name) => request('POST', '/auth/register', { email, password, name })
};

export const propertiesAPI = {
  getAll: () => request('GET', '/properties'),
  getOne: (id) => request('GET', `/properties/${id}`),
  create: (data) => request('POST', '/properties', data),
  update: (id, data) => request('PUT', `/properties/${id}`, data),
  delete: (id) => request('DELETE', `/properties/${id}`)
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
