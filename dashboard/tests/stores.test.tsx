import { renderHook, act } from '@testing-library/react';
import { propertyAPI, templateAPI, shiftNoteAPI, auditAPI } from '../src/services/api';
import { usePropertiesStore } from '../src/stores/propertiesStore';
import { useTemplatesStore } from '../src/stores/templatesStore';
import { useShiftNotesStore } from '../src/stores/shiftNotesStore';
import { useAuditLogsStore } from '../src/stores/auditLogsStore';
import { useAuthStore } from '../src/stores/authStore';

// Mock API calls
vi.mock('../src/services/api', () => ({
  propertyAPI: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  templateAPI: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  shiftNoteAPI: {
    getAll: vi.fn(),
    getOne: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  auditAPI: {
    getAll: vi.fn()
  }
}));

describe('Zustand Stores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usePropertiesStore', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => usePropertiesStore());

      expect(result.current.properties).toEqual([]);
      expect(result.current.currentProperty).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should fetch properties', async () => {
      const mockProperties = [
        { id: 1, name: 'Property 1' },
        { id: 2, name: 'Property 2' }
      ];
      
      propertyAPI.getAll.mockResolvedValue(mockProperties);

      const { result } = renderHook(() => usePropertiesStore());

      await act(async () => {
        await result.current.fetchProperties();
      });

      expect(result.current.properties).toEqual(mockProperties);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle fetch error', async () => {
      propertyAPI.getAll.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => usePropertiesStore());

      await act(async () => {
        await expect(result.current.fetchProperties()).rejects.toThrow();
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });

    it('should create a property', async () => {
      const mockProperty = { id: 3, name: 'New Property' };
      propertyAPI.create.mockResolvedValue(mockProperty);

      const { result } = renderHook(() => usePropertiesStore());

      await act(async () => {
        const created = await result.current.createProperty({ name: 'New Property' });
        expect(created).toEqual(mockProperty);
      });

      expect(result.current.properties).toContainEqual(mockProperty);
    });

    it('should set current property', async () => {
      const { result } = renderHook(() => usePropertiesStore());

      act(() => {
        result.current.setCurrentProperty({ id: 1, name: 'Property 1' });
      });

      expect(result.current.currentProperty).toEqual({ id: 1, name: 'Property 1' });
    });

    it('should clear error', async () => {
      const { result } = renderHook(() => usePropertiesStore());

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('useTemplatesStore', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useTemplatesStore());

      expect(result.current.templates).toEqual([]);
      expect(result.current.currentTemplate).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.filter).toEqual({});
    });

    it('should fetch templates with property filter', async () => {
      const mockTemplates = [
 
       { id: 1, name: 'Template 1', property_id: 1 },
        { id: 2, name: 'Template 2', property_id: 1 }
      ];
      
      templateAPI.getAll.mockResolvedValue(mockTemplates);

      const { result } = renderHook(() => useTemplatesStore());

      await act(async () => {
        await result.current.fetchTemplates(1);
      });

      expect(result.current.templates).toEqual(mockTemplates);
      expect(result.current.filter.propertyId).toBe(1);
    });

    it('should set filter', async () => {
      const { result } = renderHook(() => useTemplatesStore());

      act(() => {
        result.current.setFilter({ propertyId: 2, search: 'test' });
      });

      expect(result.current.filter).toEqual({ propertyId: 2, search: 'test' });
    });
  });

  describe('useShiftNotesStore', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useShiftNotesStore());

      expect(result.current.shiftNotes).toEqual([]);
      expect(result.current.currentShiftNote).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should fetch shift notes', async () => {
      const mockShiftNotes = [
        { id: 1, property_id: 1, content: 'Note 1' },
        { id: 2, property_id: 1, content: 'Note 2' }
      ];
      
      shiftNoteAPI.getAll.mockResolvedValue(mockShiftNotes);

      const { result } = renderHook(() => useShiftNotesStore());

      await act(async () => {
        await result.current.fetchShiftNotes(1);
      });

      expect(result.current.shiftNotes).toEqual(mockShiftNotes);
    });
  });

  describe('useAuditLogsStore', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useAuditLogsStore());

      expect(result.current.auditLogs).toEqual([]);
      expect(result.current.currentAuditLog).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).
toBeNull();
      expect(result.current.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
    });

    it('should fetch audit logs with pagination', async () => {
      const mockAuditLogs = [
        { id: 1, action: 'CREATE', resource: 'User' },
        { id: 2, action: 'UPDATE', resource: 'Property' }
      ];
      
      auditAPI.getAll.mockResolvedValue({
        data: mockAuditLogs,
        total: 2
      });

      const { result } = renderHook(() => useAuditLogsStore());

      await act(async () => {
        await result.current.fetchAuditLogs({ page: 1, limit: 10 });
      });

      expect(result.current.auditLogs).toEqual(mockAuditLogs);
      expect(result.current.pagination.total).toBe(2);
    });
  });

  describe('useAuthStore', () => {
    it('should initialize with null state', () => {
      const { result } = renderHook(() => useAuthStore());

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.refreshToken).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should set credentials', async () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setCredentials(
          { id: '1', email: 'test@example.com', name: 'Test', role: 'agent' },
          'token',
          'refresh_token'
        );
      });

      expect(result.current.user).toEqual({ id: '1', email: 'test@example.com', name: 'Test', role: 'agent' });
      expect(result.current.token).toBe('token');
      expect(result.current.refreshToken).toBe('refresh_token');
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('should clear credentials', async () => {
      const { result } = renderHook(() => useAuthStore());

      act(() => {
        result.current.setCredentials(
          { id: '1', email: 'test@example.com', name: 'Test', role: 'agent' },
          'token',
          'refresh_token'
        );
      });

      act(() => {
        result.current.clearCredentials();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.token).toBeNull();
      expect(result.current.refreshToken).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});
