import axios, { AxiosError } from 'axios';
import type {
  User,
  Property,
  Template,
  ShiftNote,
  AuditLog,
  AuthResponse,
} from '../types';
import { tokenStore } from '../stores/authStore';

export type { User, Property, Template, ShiftNote, AuditLog, AuthResponse };

const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';
const cookieTransport = { headers: { 'X-Refresh-Token-Transport': 'cookie' }, withCredentials: true };

localStorage.removeItem('refresh_token');

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
  const token = tokenStore.get();
  if (token) {
    config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as any;
    if (error.response?.status === 401 && original && !original._retried && original.url !== '/auth/login') {
      original._retried = true;
      try {
        const res = await axios.post<{ token: string }>(baseURL + '/auth/refresh', {}, cookieTransport);
        tokenStore.set(res.data.token);
        original.headers.Authorization = 'Bearer ' + res.data.token;
        return api(original);
      } catch {
        // fall through to logout
      }
      tokenStore.clear();
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
  login: (email: string, password: string): Promise<AuthResponse> =>
    api.post<AuthResponse>('/auth/login', { email, password }, cookieTransport).then((res) => res.data),
  me: (): Promise<User> => getData<User>('/auth/me'),
  logout: (): Promise<void> => api.post<void>('/auth/logout', {}, cookieTransport).then((res) => res.data),
};

export const propertyAPI = {
  getAll: (propertyId?: number): Promise<Property[]> =>
    getData<Property[]>(propertyId ? '/properties?property_id=' + propertyId : '/properties'),
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
  getAll: (propertyId?: number): Promise<Template[]> =>
    getData<Template[]>(propertyId ? '/templates?property_id=' + propertyId : '/templates'),
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
  getAll: (propertyId?: number): Promise<ShiftNote[]> =>
    getData<ShiftNote[]>(propertyId ? '/shift-notes?property_id=' + propertyId : '/shift-notes'),
  list: (params?: { property_id?: number }): Promise<ShiftNote[]> =>
    getData<ShiftNote[]>('/shift-notes', { params }),
  getOne: (id: number): Promise<ShiftNote> => getData<ShiftNote>('/shift-notes/' + id),
  get: (id: number): Promise<ShiftNote> => getData<ShiftNote>('/shift-notes/' + id),
  create: (data: Partial<ShiftNote>): Promise<ShiftNote> =>
    postData<ShiftNote>('/shift-notes', data),
  update: (id: number, data: Partial<ShiftNote>): Promise<ShiftNote> =>
    putData<ShiftNote>('/shift-notes/' + id, data),
  delete: (id: number): Promise<void> => deleteData<void>('/shift-notes/' + id),
  remove: (id: number): Promise<void> => deleteData<void>('/shift-notes/' + id),
};

export const auditAPI = {
  getAll: (params?: {
    page?: number;
    limit?: number;
    user_id?: string | number;
    action?: string;
  }): Promise<AuditLog[]> => getData<AuditLog[]>('/audit-logs', { params }),
  list: (params?: {
    page?: number;
    limit?: number;
    user_id?: string | number;
    action?: string;
  }): Promise<AuditLog[]> => getData<AuditLog[]>('/audit-logs', { params }),
  getOne: (id: number): Promise<AuditLog> => getData<AuditLog>('/audit-logs/' + id),
};

export default api;
