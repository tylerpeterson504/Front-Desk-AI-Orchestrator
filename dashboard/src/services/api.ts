import axios, { AxiosError } from 'axios';

export interface User {
  id: number;
  email: string;
  name?: string;
  role?: string;
}

export interface LoginResponse {
  token: string;
  refresh_token: string;
  user: User;
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
          const res = await axios.post(baseURL + '/auth/refresh', {
            refresh_token: refreshToken,
          });
          const data = res.data as { access_token: string; refresh_token: string };
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          original.headers.Authorization = 'Bearer ' + data.access_token;
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

async function getData<T>(url: string, config?: object): Promise<T> {
  const res = await api.get<T>(url, config);
  return res.data;
}

async function postData<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.post<T>(url, body);
  return res.data;
}

async function putData<T>(url: string, body?: unknown): Promise<T> {
  const res = await api.put<T>(url, body);
  return res.data;
}

async function deleteData<T>(url: string): Promise<T> {
  const res = await api.delete<T>(url);
  return res.data;
}

export const authAPI = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    postData<LoginResponse>('/auth/login', { email, password }),
  me: (): Promise<User> => getData<User>('/auth/me'),
  logout: (): Promise<void> => postData<void>('/auth/logout'),
};

export const propertyAPI = {
  getAll: (): Promise<Property[]> => getData<Property[]>('/properties'),
  list: (): Promise<Property[]> => getData<Property[]>('/properties'),
  getOne: (id: number): Promise<Property> => getData<Property>('/properties/' + id),
  get: (id: number): Promise<Property> => getData<Property>('/properties/' + id),
  create: (data: Partial<Property>): Promise<Property> =>
    postData<Property>('/properties', data),
  update: (id: number, data: Partial<Property>): Promise<Property> =>
    putData<Property>('/properties/' + id, data),
  delete: (id: number): Promise<void> => deleteData<void>('/properties/' + id),
  remove: (id: number): Promise<void> => deleteData<void>('/properties/' + id),
  getWifi: (id: number): Promise<{ password: string }> =>
    getData<{ password: string }>('/properties/' + id + '/wifi'),
};

export const templateAPI = {
  getAll: (): Promise<Template[]> => getData<Template[]>('/templates'),
  list: (): Promise<Template[]> => getData<Template[]>('/templates'),
  getOne: (id: number): Promise<Template> => getData<Template>('/templates/' + id),
  get: (id: number): Promise<Template> => getData<Template>('/templates/' + id),
  create: (data: Partial<Template>): Promise<Template> =>
    postData<Template>('/templates', data),
  update: (id: number, data: Partial<Template>): Promise<Template> =>
    putData<Template>('/templates/' + id, data),
  delete: (id: number): Promise<void> => deleteData<void>('/templates/' + id),
  remove: (id: number): Promise<void> => deleteData<void>('/templates/' + id),
};

export const shiftNoteAPI = {
  getAll: (params?: { property_id?: number }): Promise<ShiftNote[]> =>
    getData<ShiftNote[]>('/shift-notes', { params }),
  list: (params?: { property_id?: number }): Promise<ShiftNote[]> =>
    getData<ShiftNote[]>('/shift-notes', { params }),
  create: (data: Partial<ShiftNote>): Promise<ShiftNote> =>
    postData<ShiftNote>('/shift-notes', data),
  delete: (id: number): Promise<void> => deleteData<void>('/shift-notes/' + id),
  remove: (id: number): Promise<void> => deleteData<void>('/shift-notes/' + id),
};

export const auditAPI = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    user_id?: number;
    action?: string;
  }): Promise<AuditLog[]> => getData<AuditLog[]>('/audit-logs', { params }),
  list: (params?: {
    page?: number;
    limit?: number;
    user_id?: number;
    action?: string;
  }): Promise<AuditLog[]> => getData<AuditLog[]>('/audit-logs', { params }),
  getOne: (id: number): Promise<AuditLog> => getData<AuditLog>('/audit-logs/' + id),
};

export default api;
