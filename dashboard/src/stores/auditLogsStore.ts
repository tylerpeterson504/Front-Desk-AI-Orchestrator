import { create } from 'zustand';
import { AuditLog } from '../types';
import { auditAPI } from '../services/api';

interface AuditLogsState {
  auditLogs: AuditLog[];
  currentAuditLog: AuditLog | null;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filter: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: string;
    endDate?: string;
  };
  fetchAuditLogs: (params?: { page?: number; limit?: number; user_id?: string; action?: string }) => Promise<void>;
  fetchAuditLog: (id: number) => Promise<void>;
  setCurrentAuditLog: (auditLog: AuditLog | null) => void;
  setFilter: (filter: { userId?: string; action?: string; resource?: string; startDate?: string; endDate?: string }) => void;
  clearError: () => void;
}

export const useAuditLogsStore = create<AuditLogsState>((set, get) => ({
  auditLogs: [],
  currentAuditLog: null,
  isLoading: false,
  error: null,
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
  filter: {},

  fetchAuditLogs: async (params = {}) => {
    set({ isLoading: true, error: null, filter: { ...params } });
    try {
      const page = params.page || 1;
      const limit = params.limit || 20;
      
      const response = await auditAPI.getAll({
        page,
        limit,
        user_id: params.user_id,
        action: params.action
      });
      
      // Assuming response includes data and pagination info
      const data = Array.isArray(response) ? response : response.data || [];
      const total = response.total || 0;
      const totalPages = Math.ceil(total / limit);
      
      set({
        auditLogs: data,
        pagination: { page, limit, total, totalPages },
        isLoading: false
      });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch audit logs',
        isLoading: false
      });
      throw err;
    }
  },

  fetchAuditLog: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      const auditLog = await auditAPI.getOne(id);
      set({ currentAuditLog: auditLog, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch audit log',
        isLoading: false
      });
      throw err;
    }
  },

  setCurrentAuditLog: (auditLog: AuditLog | null) => {
    set({ currentAuditLog: auditLog });
  },

  setFilter: (filter: { userId?: string; action?: string; resource?: string; startDate?: string; endDate?: string }) => {
    set({ filter });
  },

  clearError: () => {
    set({ error: null });
  }
}));
