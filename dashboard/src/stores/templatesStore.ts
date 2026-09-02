import { create } from 'zustand';
import { Template } from '../types';
import { templateAPI } from '../services/api';

interface TemplatesState {
  templates: Template[];
  currentTemplate: Template | null;
  isLoading: boolean;
  error: string | null;
  filter: {
    propertyId?: number;
    search?: string;
  };
  fetchTemplates: (propertyId?: number) => Promise<void>;
  fetchTemplate: (id: number) => Promise<void>;
  createTemplate: (data: Partial<Template>) => Promise<Template>;
  updateTemplate: (id: number, data: Partial<Template>) => Promise<Template>;
  deleteTemplate: (id: number) => Promise<void>;
  setCurrentTemplate: (template: Template | null) => void;
  setFilter: (filter: { propertyId?: number; search?: string }) => void;
  clearError: () => void;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  currentTemplate: null,
  isLoading: false,
  error: null,
  filter: {},

  fetchTemplates: async (propertyId?: number) => {
    set({ isLoading: true, error: null, filter: { propertyId } });
    try {
      const templates = await templateAPI.getAll(propertyId);
      set({ templates, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch templates',
        isLoading: false
      });
      throw err;
    }
  },

  fetchTemplate: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      const template = await templateAPI.getOne(id);
      set({ currentTemplate: template, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch template',
        isLoading: false
      });
      throw err;
    }
  },

  createTemplate: async (data: Partial<Template>) => {
    set({ isLoading: true, error: null });
    try {
      const template = await templateAPI.create(data);
      set((state) => ({
        templates: [...state.templates, template],
        isLoading: false
      }));
      return template;
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to create template',
        isLoading: false
      });
      throw err;
    }
  },

  updateTemplate: async (id: number, data: Partial<Template>) => {
    set({ isLoading: true, error: null });
    try {
      const template = await templateAPI.update(id, data);
      set((state) => ({
        templates: state.templates.map((t) => (t.id === id ? template : t)),
        currentTemplate: state.currentTemplate?.id === id ? template : state.currentTemplate,
        isLoading: false
      }));
      return template;
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to update template',
        isLoading: false
      });
      throw err;
    }
  },

  deleteTemplate: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      await templateAPI.delete(id);
      set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
        currentTemplate: state.currentTemplate?.id === id ? null : state.currentTemplate,
        isLoading: false
      }));
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to delete template',
        isLoading: false
      });
      throw err;
    }
  },

  setCurrentTemplate: (template: Template | null) => {
    set({ currentTemplate: template });
  },

  setFilter: (filter: { propertyId?: number; search?: string }) => {
    set({ filter });
  },

  clearError: () => {
    set({ error: null });
  }
}));
