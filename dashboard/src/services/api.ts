import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { ApiError, AuthResponse, User } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

class ApiService {
  private instance: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        const { token } = useAuthStore.getState();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        // Handle 401 errors
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const { refreshToken, setCredentials, clearCredentials } = useAuthStore.getState();

            if (!refreshToken) {
              clearCredentials();
              return Promise.reject(error);
            }

            // Avoid multiple refresh requests
            if (!this.refreshPromise) {
              this.refreshPromise = axios.post(`${API_BASE}/auth/refresh`, {
                refresh_token: refreshToken
              }).then((response) => {
                const { token, refresh_token } = response.data;
                setCredentials(useAuthStore.getState().user!, token, refresh_token);
                return token;
              }).catch(() => {
                clearCredentials();
                return Promise.reject(error);
              }).finally(() => {
                this.refreshPromise = null;
              });
            }

            await this.refreshPromise;
            originalRequest.headers!.Authorization = `Bearer ${useAuthStore.getState().token}`;
            return this.instance(originalRequest);
          } catch (refreshError) {
            clearCredentials();
            return Promise.reject(refreshError);
          }
        }

        // Transform error
        const apiError: ApiError = {
          message: error.response?.data?.message || error.message || 'Unknown error',
          code: error.response?.data?.code,
          status: error.response?.status,
          requestId: error.response?.data?.requestId
        };

        return Promise.reject(apiError);
      }
    );
  }

  async get<T>(url: string, config?: InternalAxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig): Promise<T> {
    const response = await this.instance.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: InternalAxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<T>(url, config);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig): Promise<T> {
    const response = await this.instance.patch<T>(url, data, config);
    return response.data;
  }
}

// Singleton instance
export const api = new ApiService();

// Domain-specific services
export const authAPI = {
  login: (email: string, password: string) => api.post<AuthResponse>('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) => api.post<AuthResponse>('/auth/register', { email, password, name }),
  me: () => api.get<User>('/auth/me'),
  logout: () => api.post<void>('/auth/logout'),
  logoutEverywhere: () => api.post<void>('/auth/logout-all'),
  refresh: (refreshToken: string) => api.post<{ token: string; refresh_token: string }>('/auth/refresh', { refresh_token: refreshToken })
};

export const propertyAPI = {
  getAll: () => api.get<import('../types').Property[]>('/properties'),
  getOne: (id: number) => api.get<import('../types').Property>(`/properties/${id}`),
  create: (data: Partial<import('../types').Property>) => api.post<import('../types').Property>('/properties', data),
  update: (id: number, data: Partial<import('../types').Property>) => api.put<import('../types').Property>(`/properties/${id}`, data),
  delete: (id: number) => api.delete<void>(`/properties/${id}`)
};

export const templateAPI = {
  getAll: (propertyId?: number) => api.get<import('../types').Template[]>('/templates', propertyId ? { params: { property_id: propertyId } } : undefined),
  getOne: (id: number) => api.get<import('../types').Template>(`/templates/${id}`),
  create: (data: Partial<import('../types').Template>) => api.post<import('../types').Template>('/templates', data),
  update: (id: number, data: Partial<import('../types').Template>) => api.put<import('../types').Template>(`/templates/${id}`, data),
  delete: (id: number) => api.delete<void>(`/templates/${id}`)
};

export const shiftNoteAPI = {
  getAll: (propertyId?: number) => api.get<import('../types').ShiftNote[]>('/shift-notes', propertyId ? { params: { property_id: propertyId } } : undefined),
  getOne: (id: number) => api.get<import('../types').ShiftNote>(`/shift-notes/${id}`),
  create: (data: Partial<import('../types').ShiftNote>) => api.post<import('../types').ShiftNote>('/shift-notes', data),
  update: (id: number, data: Partial<import('../types').ShiftNote>) => api.put<import('../types').ShiftNote>(`/shift-notes/${id}`, data),
  delete: (id: number) => api.delete<void>(`/shift-notes/${id}`)
};

export const auditAPI = {
  getAll: (params?: { page?: number; limit?: number; user_id?: string; action?: string }) => api.get<import('../types').AuditLog[]>('/audit-logs', { params }),
  getOne: (id: number) => api.get<import('../types').AuditLog>(`/audit-logs/${id}`)
};

// Callback for 401 errors
export const onUnauthorized = (callback: () => void) => {
  const originalPost = api.post;
  const originalGet = api.get;
  const originalPut = api.put;
  const originalDelete = api.delete;
  const originalPatch = api.patch;

  api.post = async <T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig): Promise<T> => {
    try {
      return await originalPost<T>(url, data, config);
    } catch (error) {
      if ((error as ApiError).status === 401) {
        callback();
      }
      throw error;
    }
  };

  api.get = async <T>(url: string, config?: InternalAxiosRequestConfig): Promise<T> => {
    try {
      return await originalGet<T>(url, config);
    } catch (error) {
      if ((error as ApiError).status === 401) {
        callback();
      }
      throw error;
    }
  };

  api.put = async <T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig): Promise<T> => {
    try {
      return await originalPut<T>(url, data, config);
    } catch (error) {
      if ((error as ApiError).status === 401) {
        callback();
      }
      throw error;
    }
  };

  api.delete = async <T>(url: string, config?: InternalAxiosRequestConfig): Promise<T> => {
    try {
      return await originalDelete<T>(url, config);
    } catch (error) {
      if ((error as ApiError).status === 401) {
        callback();
      }
      throw error;
    }
  };

  api.patch = async <T>(url: string, data?: unknown, config?: InternalAxiosRequestConfig): Promise<T> => {
    try {
      return await originalPatch<T>(url, data, config);
    } catch (error) {
      if ((error as ApiError).status === 401) {
        callback();
      }
      throw error;
    }
  };

  return () => {
    api.post = originalPost;
    api.get = originalGet;
    api.put = originalPut;
    api.delete = originalDelete;
    api.patch = originalPatch;
  };
};

export default api;
