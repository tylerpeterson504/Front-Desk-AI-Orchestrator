import { create } from 'zustand';
import { ShiftNote } from '../types';
import { shiftNoteAPI } from '../services/api';

interface ShiftNotesState {
  shiftNotes: ShiftNote[];
  currentShiftNote: ShiftNote | null;
  isLoading: boolean;
  error: string | null;
  filter: {
    propertyId?: number;
    date?: string;
    userId?: string;
  };
  fetchShiftNotes: (propertyId?: number) => Promise<void>;
  fetchShiftNote: (id: number) => Promise<void>;
  createShiftNote: (data: Partial<ShiftNote>) => Promise<ShiftNote>;
  updateShiftNote: (id: number, data: Partial<ShiftNote>) => Promise<ShiftNote>;
  deleteShiftNote: (id: number) => Promise<void>;
  setCurrentShiftNote: (shiftNote: ShiftNote | null) => void;
  setFilter: (filter: { propertyId?: number; date?: string; userId?: string }) => void;
  clearError: () => void;
}

export const useShiftNotesStore = create<ShiftNotesState>((set, get) => ({
  shiftNotes: [],
  currentShiftNote: null,
  isLoading: false,
  error: null,
  filter: {},

  fetchShiftNotes: async (propertyId?: number) => {
    set({ isLoading: true, error: null, filter: { propertyId } });
    try {
      const shiftNotes = await shiftNoteAPI.getAll(propertyId);
      set({ shiftNotes, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch shift notes',
        isLoading: false
      });
      throw err;
    }
  },

  fetchShiftNote: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      const shiftNote = await shiftNoteAPI.getOne(id);
      set({ currentShiftNote: shiftNote, isLoading: false });
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to fetch shift note',
        isLoading: false
      });
      throw err;
    }
  },

  createShiftNote: async (data: Partial<ShiftNote>) => {
    set({ isLoading: true, error: null });
    try {
      const shiftNote = await shiftNoteAPI.create(data);
      set((state) => ({
        shiftNotes: [...state.shiftNotes, shiftNote],
        isLoading: false
      }));
      return shiftNote;
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to create shift note',
        isLoading: false
      });
      throw err;
    }
  },

  updateShiftNote: async (id: number, data: Partial<ShiftNote>) => {
    set({ isLoading: true, error: null });
    try {
      const shiftNote = await shiftNoteAPI.update(id, data);
      set((state) => ({
        shiftNotes: state.shiftNotes.map((s) => (s.id === id ? shiftNote : s)),
        currentShiftNote: state.currentShiftNote?.id === id ? shiftNote : state.currentShiftNote,
        isLoading: false
      }));
      return shiftNote;
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to update shift note',
        isLoading: false
      });
      throw err;
    }
  },

  deleteShiftNote: async (id: number) => {
    set({ isLoading: true, error: null });
    try {
      await shiftNoteAPI.delete(id);
      set((state) => ({
        shiftNotes: state.shiftNotes.filter((s) => s.id !== id),
        currentShiftNote: state.currentShiftNote?.id === id ? null : state.currentShiftNote,
        isLoading: false
      }));
    } catch (err) {
      set({
        error: (err as Error).message || 'Failed to delete shift note',
        isLoading: false
      });
      throw err;
    }
  },

  setCurrentShiftNote: (shiftNote: ShiftNote | null) => {
    set({ currentShiftNote: shiftNote });
  },

  setFilter: (filter: { propertyId?: number; date?: string; userId?: string }) => {
    set({ filter });
  },

  clearError: () => {
    set({ error: null });
  }
}));
