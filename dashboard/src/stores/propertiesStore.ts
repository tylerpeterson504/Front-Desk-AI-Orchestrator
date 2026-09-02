import { create } from 'zustand';
import { Property } from '../types';
import { propertyAPI } from '../services/api';

interface PropertiesState {
  properties: Property[];
  currentProperty: Property | null;
  isLoading: boolean;
  error: string | null;
  fetchProperties: () => Promise<void>;
  fetchProperty: (id: number) => Promise<void>;
  createProperty: (data: Partial<Property>) => Promise<Property>;
  updateProperty: (id: number, data: Partial<Property>) => Promise<Property>;
  deleteProperty: (id: number) => Promise<void>;
  setCurrentProperty: (property: Property | null) => void;
  clearError: () => void;
}

export const usePropertiesStore = create<PropertiesState>((set, get) => ({
  properties: [],
  currentProperty: null,
  isLoading: false,
  error: null,

  fetchProperties: async () => {
    set({ isLoading: true, error: null });
    try {
      const properties = await propertyAPI.getAll();
      set({ properties, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch properties',
        isLoading: false
      });
      throw err;
    }
  },

  fetchProperty: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      const property = await propertyAPI.getOne(id);
      set({ currentProperty: property, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch property',
        isLoading: false
      });
      throw err;
    }
  },

  createProperty: async (data: Partial<Property>) => {
    set({ isLoading: true, error: null });
    try {
      const property = await propertyAPI.create(data);
      set((state) => ({
        properties: [...state.properties, property],
        isLoading: false
      }));
      return property;
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to create property',
        isLoading: false
      });
      throw err;
    }
  },

  updateProperty: async (id: number, data: Partial<Property>) => {
    set({ isLoading: true, error: null });
    try {
      const property = await propertyAPI.update(id, data);
      set((state) => ({
        properties: state.properties.map((p) => (p.id === id ? property : p)),
        currentProperty: state.currentProperty?.id === id ? property : state.currentProperty,
        isLoading: false
      }));
      return property;
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to update property',
        isLoading: false
      });
      throw err;
    }
  },

  deleteProperty: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      await propertyAPI.delete(id);
      set((state) => ({
        properties: state.properties.filter((p) => p.id !== id),
        currentProperty: state.currentProperty?.id === id ? null : state.currentProperty,
        isLoading: false
      }));
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to delete property',
        isLoading: false
      });
      throw err;
    }
  },

  setCurrentProperty: (property: Property | null) => {
    set({ currentProperty: property });
  },

  clearError: () => {
    set({ error: null });
  }
}));
