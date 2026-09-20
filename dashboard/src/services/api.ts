import axios, { AxiosError } from 'axios';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface Property {
  id: number;
  name: string;
  address: string;
  phone: string;
  wifi_ssid: string;
  wifi_password: string;
  check_in_time: string;
  check_out_time: string;
}

export interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  category?: string;
  user_id?: number;
  tags?: string[];
}

export interface ShiftNote {
  id: number;
  property_id: number;
  author: string;
  content: string;
  shift: string;
  created_at: string;
}

export interface AuditLog {
  id: number;
  event_type: string;
  actor: string;
  details: string;
  created_at: string;
}

const baseURL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(fn: () => void) {
  onUnauthorized = fn;
}

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post<AuthTokens>(
            baseURL + '/auth/refresh',
            { refresh_token: refreshToken }
          );
          localStorage.setItem('access_token', res.data.access_token);
          localStorage.setItem('refresh_token', res.data.refresh_token);
          original.headers.Authorization = 'Bearer ' + res.data.access_token;
          return api(original);
        } catch {
          // fall through to logout
        }
      }
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      if (onUnauthorized) onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (credentials: LoginCredentials) =>
    api.post<AuthTokens>('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const propertyAPI = {
  list: () => api.get<Property[]>('/properties'),
  get: (id: number) => api.get<Property>('/properties/' + id),
  create: (data: Partial<Property>) => api.post<Property>('/properties', data),
  update: (id: number, data: Partial<Property>) =>
    api.put<Property>('/properties/' + id, data),
  remove: (id: number) => api.delete('/properties/' + id),
  getWifi: (id: number) => api.get<{ password: string }>('/properties/' + id + '/wifi'),
};

export const templateAPI = {
  list: () => api.get<Template[]>('/templates'),
  get: (id: number) => api.get<Template>('/templates/' + id),
  create: (data: Partial<Template>) => api.post<Template>('/templates', data),
  update: (id: number, data: Partial<Template>) =>
    api.put<Template>('/templates/' + id, data),
  remove: (id: number) => api.delete('/templates/' + id),
};

export const shiftNoteAPI = {
  list: (params?: { property_id?: number }) =>
    api.get<ShiftNote[]>('/shift-notes', { params }),
  create: (data: Partial<ShiftNote>) => api.post<ShiftNote>('/shift-notes', data),
  remove: (id: number) => api.delete('/shift-notes/' + id),
};

export const auditAPI = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get<AuditLog[]>('/audit-logs', { params }),
};

export default api;
