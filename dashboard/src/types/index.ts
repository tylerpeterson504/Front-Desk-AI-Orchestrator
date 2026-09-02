// User types
export interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'agent';
  property_id: number | null;
  created_at: string;
  updated_at: string;
}

// Property types
export interface Property {
  id: number;
  name: string;
  address?: string;
  checkout_time?: string;
  wifi_ssid?: string;
  wifi_password?: string;
  tone_guidelines?: string;
  created_at: string;
  updated_at: string;
}

// Template types
export interface Template {
  id: number;
  name: string;
  content: string;
  property_id: number | null;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

// Shift Note types
export interface ShiftNote {
  id: number;
  property_id: number;
  user_id: string;
  content: string;
  shift_date: string;
  created_at: string;
  updated_at: string;
}

// Audit Log types
export interface AuditLog {
  id: number;
  user_id: string | null;
  action: string;
  resource: string;
  resource_id: string | number | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// Auth types
export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  name: string;
}

// API types
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  requestId?: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    requestId: string;
    timestamp: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form types
export interface PropertyFormData {
  name: string;
  address?: string;
  checkout_time?: string;
  wifi_ssid?: string;
  wifi_password?: string;
  tone_guidelines?: string;
}

export interface TemplateFormData {
  name: string;
  content: string;
  property_id?: number;
  is_global: boolean;
}

// UI types
export type PageType = 'templates' | 'audit' | 'properties' | 'shift-notes';

export interface SidebarProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
  onLogout: () => void;
  user: User | null;
}

export interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose: () => void;
  show?: boolean;
}
