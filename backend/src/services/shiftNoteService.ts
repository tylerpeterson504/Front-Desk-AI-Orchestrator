import { And, MoreThanOrEqual, LessThan } from 'typeorm';
import { getRepository } from '../config/database';
import { ShiftNote } from '../entities/ShiftNote';
import { Property } from '../entities/Property';
import { AppError, NotFoundError, ValidationError, AuthorizationError } from '../lib/errors';
import { createRequestLogger } from '../lib/logger';

export interface CreateShiftNoteDto {
  property_id: number;
  content: string;
  shift_date?: string;
  shift_type?: string;
  start_time?: string;
  end_time?: string;
  tasks?: Array<{
    description: string;
    assigned_to?: string;
  }>;
  handover_checklist?: Array<{
    item: string;
    notes?: string;
  }>;
  handover_notes?: string;
  status?: string;
}

export interface UpdateShiftNoteDto {
  content?: string;
  shift_type?: string;
  start_time?: string;
  end_time?: string;
  tasks?: Array<{
    id?: string;
    description: string;
    completed?: boolean;
    completed_at?: string;
    assigned_to?: string;
  }>;
  handover_checklist?: Array<{
    id?: string;
    item: string;
    completed?: boolean;
    completed_at?: string;
    notes?: string;
  }>;
  handover_notes?: string;
  status?: string;
  is_complete?: boolean;
  performance_score?: number;
  performance_notes?: string;
  handed_over_to?: string;
}

export interface ShiftNoteWithTasks {
  id: number;
  property_id: number;
  user_id: string;
  content: string;
  shift_date: Date;
  shift_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_complete: boolean;
  tasks?: Array<{
    id: string;
    description: string;
    completed: boolean;
    completed_at?: string;
    assigned_to?: string;
  }> | null;
  handover_checklist?: Array<{
    id: string;
    item: string;
    completed: boolean;
    completed_at?: string;
    notes?: string;
  }> | null;
  handover_notes?: string | null;
  status?: string | null;
  performance_score?: number | null;
  performance_notes?: string | null;
  handed_over_to?: string | null;
  handed_over_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ShiftPerformanceReport {
  shift_date: string;
  total_shifts: number;
  completed_shifts: number;
  avg_performance_score: number | null;
  handover_completion_rate: number;
  task_completion_rate: number;
}

export interface HandoverChecklistTemplate {
  id: string;
  name: string;
  items: Array<{
    id: string;
    item: string;
    description?: string;
    required: boolean;
  }>;
}

const MAX_CONTENT_LENGTH = 10000;

export class ShiftNoteService {
  private shiftNoteRepository = getRepository<ShiftNote>(ShiftNote);
  private propertyRepository = getRepository<Property>(Property);

  private readContent(raw: unknown): string {
    if (raw == null) {
      throw new ValidationError('content is required');
    }
    if (typeof raw !== 'string') {
      throw new ValidationError('content must be a string');
    }
    const normalized = raw.trim();
    if (!normalized) {
      throw new ValidationError('content must not be empty');
    }
    if (normalized.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`content must be at most ${MAX_CONTENT_LENGTH} characters`);
    }
    return normalized;
  }

  async getAll(userId: string): Promise<ShiftNote[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.shiftNoteRepository.find({
      where: {
        user_id: userId,
        created_at: And(MoreThanOrEqual(today), LessThan(tomorrow))
      },
      order: { created_at: 'DESC' },
      relations: ['property']
    });
  }

  async getById(id: number, userId: string): Promise<ShiftNoteWithTasks> {
    const shiftNote = await this.shiftNoteRepository.findOne({
      where: { id, user_id: userId }
    });

    if (!shiftNote) {
      throw new NotFoundError('ShiftNote', id);
    }

    return shiftNote as ShiftNoteWithTasks;
  }

  async create(data: CreateShiftNoteDto, userId: string): Promise<ShiftNote> {
    // Validate property access
    const property = await this.propertyRepository.findOne({
      where: { id: data.property_id, user_id: userId }
    });

    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const content = this.readContent(data.content);

    const shiftNote = this.shiftNoteRepository.create({
      user_id: userId,
      property_id: data.property_id,
      content,
      shift_date: new Date(),
      shift_type: data.shift_type || null,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      status: data.status || 'draft',
      is_complete: false,
      tasks: this.normalizeTasks(data.tasks),
      handover_checklist: this.normalizeHandoverChecklist(data.handover_checklist),
      handover_notes: data.handover_notes || null
    });

    await this.shiftNoteRepository.save(shiftNote);

    return shiftNote;
  }

  async update(id: number, data: UpdateShiftNoteDto, userId: string): Promise<ShiftNote> {
    const shiftNote = await this.getById(id, userId);

    if (data.content) {
      shiftNote.content = this.readContent(data.content);
    }

    // Update shift details
    if (data.shift_type !== undefined) {
      shiftNote.shift_type = data.shift_type || null;
    }
    if (data.start_time !== undefined) {
      shiftNote.start_time = data.start_time || null;
    }
    if (data.end_time !== undefined) {
      shiftNote.end_time = data.end_time || null;
    }
    if (data.status !== undefined) {
      shiftNote.status = data.status || null;
    }
    if (data.is_complete !== undefined) {
      shiftNote.is_complete = data.is_complete;
    }
    if (data.performance_score !== undefined) {
      shiftNote.performance_score = data.performance_score || null;
    }
    if (data.performance_notes !== undefined) {
      shiftNote.performance_notes = data.performance_notes || null;
    }
    if (data.handed_over_to !== undefined) {
      shiftNote.handed_over_to = data.handed_over_to || null;
    }

    // Update tasks
    if (data.tasks !== undefined) {
      shiftNote.tasks = this.normalizeTasks(data.tasks);
    }

    // Update handover checklist
    if (data.handover_checklist !== undefined) {
      shiftNote.handover_checklist = this.normalizeHandoverChecklist(data.handover_checklist);
    }

    // Update handover notes
    if (data.handover_notes !== undefined) {
      shiftNote.handover_notes = data.handover_notes || null;
    }

    // Update handover timestamp
    if (data.status === 'handed_over' && !shiftNote.handed_over_at) {
      shiftNote.handed_over_at = new Date();
    }

    await this.shiftNoteRepository.save(shiftNote);

    return shiftNote;
  }

  /**
   * Normalize tasks array
   */
  private normalizeTasks(tasks?: Array<{
    id?: string;
    description: string;
    completed?: boolean;
    completed_at?: string;
    assigned_to?: string;
  }>): Array<{
    id: string;
    description: string;
    completed: boolean;
    completed_at?: string;
    assigned_to?: string;
  }> | null {
    if (!tasks || tasks.length === 0) return null;
    
    return tasks.map(task => ({
      id: task.id || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      description: task.description,
      completed: Boolean(task.completed),
      completed_at: task.completed_at || null,
      assigned_to: task.assigned_to || null
    }));
  }

  /**
   * Normalize handover checklist array
   */
  private normalizeHandoverChecklist(checklist?: Array<{
    id?: string;
    item: string;
    completed?: boolean;
    completed_at?: string;
    notes?: string;
  }>): Array<{
    id: string;
    item: string;
    completed: boolean;
    completed_at?: string;
    notes?: string;
  }> | null {
    if (!checklist || checklist.length === 0) return null;
    
    return checklist.map(item => ({
      id: item.id || `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      item: item.item,
      completed: Boolean(item.completed),
      completed_at: item.completed_at || null,
      notes: item.notes || null
    }));
  }

  /**
   * Create a new shift note with enhanced fields
   */
  async createEnhanced(data: CreateShiftNoteDto, userId: string): Promise<ShiftNote> {
    // Validate property access
    const property = await this.propertyRepository.findOne({
      where: { id: data.property_id, user_id: userId }
    });

    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const content = this.readContent(data.content);
    const shift_date = data.shift_date ? new Date(data.shift_date) : new Date();

    const shiftNote = this.shiftNoteRepository.create({
      user_id: userId,
      property_id: data.property_id,
      content,
      shift_date,
      shift_type: data.shift_type || null,
      start_time: data.start_time || null,
      end_time: data.end_time || null,
      status: data.status || 'draft',
      is_complete: false,
      tasks: this.normalizeTasks(data.tasks),
      handover_checklist: this.normalizeHandoverChecklist(data.handover_checklist),
      handover_notes: data.handover_notes || null
    });

    await this.shiftNoteRepository.save(shiftNote);

    return shiftNote;
  }

  /**
   * Get shift notes by date range
   */
  async getByDateRange(userId: string, startDate: string, endDate: string): Promise<ShiftNoteWithTasks[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // Include the end date

    const shiftNotes = await this.shiftNoteRepository.find({
      where: {
        user_id: userId,
        shift_date: And(MoreThanOrEqual(start), LessThan(end))
      },
      order: { shift_date: 'DESC', created_at: 'DESC' }
    });

    return shiftNotes as ShiftNoteWithTasks[];
  }

  /**
   * Mark task as completed
   */
  async completeTask(shiftNoteId: number, taskId: string, userId: string): Promise<ShiftNote> {
    const shiftNote = await this.getById(shiftNoteId, userId);

    if (!shiftNote.tasks || shiftNote.tasks.length === 0) {
      throw new ValidationError('No tasks found in this shift note');
    }

    const updatedTasks = shiftNote.tasks.map(task => {
      if (task.id === taskId) {
        return { ...task, completed: true, completed_at: new Date().toISOString() };
      }
      return task;
    });

    shiftNote.tasks = updatedTasks;
    
    // Check if all tasks are complete
    if (shiftNote.tasks.every(task => task.completed)) {
      shiftNote.is_complete = true;
    }

    await this.shiftNoteRepository.save(shiftNote);
    return shiftNote;
  }

  /**
   * Complete handover checklist item
   */
  async completeHandoverItem(shiftNoteId: number, itemId: string, userId: string, notes?: string): Promise<ShiftNote> {
    const shiftNote = await this.getById(shiftNoteId, userId);

    if (!shiftNote.handover_checklist || shiftNote.handover_checklist.length === 0) {
      throw new ValidationError('No handover checklist found in this shift note');
    }

    const updatedChecklist = shiftNote.handover_checklist.map(item => {
      if (item.id === itemId) {
        return { 
          ...item, 
          completed: true, 
          completed_at: new Date().toISOString(),
          notes: notes || item.notes
        };
      }
      return item;
    });

    shiftNote.handover_checklist = updatedChecklist;
    
    // Update handover notes if provided
    if (notes) {
      shiftNote.handover_notes = shiftNote.handover_notes 
        ? `${shiftNote.handover_notes}\n${notes}`
        : notes;
    }

    await this.shiftNoteRepository.save(shiftNote);
    return shiftNote;
  }

  /**
   * Complete shift handover
   */
  async completeHandover(shiftNoteId: number, handedOverTo: string, userId: string, notes?: string): Promise<ShiftNote> {
    const shiftNote = await this.getById(shiftNoteId, userId);

    shiftNote.status = 'handed_over';
    shiftNote.handed_over_to = handedOverTo;
    shiftNote.handed_over_at = new Date();
    
    if (notes) {
      shiftNote.handover_notes = shiftNote.handover_notes 
        ? `${shiftNote.handover_notes}\n${notes}`
        : notes;
    }

    await this.shiftNoteRepository.save(shiftNote);
    return shiftNote;
  }

  /**
   * Generate shift performance report
   */
  async getPerformanceReport(propertyId: number, startDate: string, endDate: string, userId: string): Promise<ShiftPerformanceReport> {
    // Verify property access
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, user_id: userId }
    });

    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);

    const shiftNotes = await this.shiftNoteRepository.find({
      where: {
        property_id: propertyId,
        shift_date: And(MoreThanOrEqual(start), LessThan(end))
      }
    });

    const total_shifts = shiftNotes.length;
    const completed_shifts = shiftNotes.filter(note => note.is_complete).length;
    
    // Calculate average performance score
    const validScores = shiftNotes
      .map(note => note.performance_score)
      .filter(score => score !== null && !isNaN(score)) as number[];
    
    const avg_performance_score = validScores.length > 0 
      ? validScores.reduce((sum, score) => sum + score, 0) / validScores.length
      : null;

    // Calculate handover completion rate
    const handedOverNotes = shiftNotes.filter(note => note.status === 'handed_over');
    const notesWithChecklists = shiftNotes.filter(note => note.handover_checklist && note.handover_checklist.length > 0);
    const completedHandoverItems = notesWithChecklists
      .flatMap(note => note.handover_checklist || [])
      .filter(item => item.completed).length;
    const totalHandoverItems = notesWithChecklists
      .flatMap(note => note.handover_checklist || []).length;
    
    const handover_completion_rate = totalHandoverItems > 0 
      ? (completedHandoverItems / totalHandoverItems) * 100
      : 0;

    // Calculate task completion rate
    const notesWithTasks = shiftNotes.filter(note => note.tasks && note.tasks.length > 0);
    const completedTasks = notesWithTasks
      .flatMap(note => note.tasks || [])
      .filter(task => task.completed).length;
    const totalTasks = notesWithTasks
      .flatMap(note => note.tasks || []).length;
    
    const task_completion_rate = totalTasks > 0 
      ? (completedTasks / totalTasks) * 100
      : 0;

    return {
      shift_date: `${start.toISOString().split('T')[0]} to ${new Date(end.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
      total_shifts,
      completed_shifts,
      avg_performance_score: avg_performance_score ? Math.round(avg_performance_score * 100) / 100 : null,
      handover_completion_rate: Math.round(handover_completion_rate * 100) / 100,
      task_completion_rate: Math.round(task_completion_rate * 100) / 100
    };
  }

  /**
   * Get predefined handover checklist templates
   */
  async getHandoverChecklistTemplates(): Promise<HandoverChecklistTemplate[]> {
    // Return standard handover checklist templates
    return [
      {
        id: 'standard-front-desk',
        name: 'Standard Front Desk Handover',
        items: [
          { id: 'cash-drawer', item: 'Cash drawer balance', description: 'Verify cash drawer balance matches system', required: true },
          { id: 'reservations', item: 'Reservation check-ins/outs', description: 'Review upcoming arrivals and departures', required: true },
          { id: 'messages', item: 'Pending guest messages', description: 'Check for any pending guest communications', required: true },
          { id: 'maintenance', item: 'Maintenance requests', description: 'Review any open maintenance issues', required: false },
          { id: 'vip-guests', item: 'VIP guest status', description: 'Check on any VIP guests and special requests', required: false },
          { id: 'incidents', item: 'Incident reports', description: 'Review any incidents from the shift', required: false }
        ]
      },
      {
        id: 'night-audit',
        name: 'Night Audit Handover',
        items: [
          { id: 'audit-complete', item: 'Night audit completed', description: 'Verify night audit has been completed', required: true },
          { id: 'postings', item: 'Folio postings verified', description: 'Check all folios have been posted correctly', required: true },
          { id: 'reports', item: 'Management reports', description: 'Prepare and review night audit reports', required: true },
          { id: 'backup', item: 'System backup', description: 'Verify backup procedures have been followed', required: true },
          { id: 'security', item: 'Security check', description: 'Complete security walkthrough', required: true }
        ]
      }
    ];
  }

  async delete(id: number, userId: string): Promise<void> {
    const shiftNote = await this.getById(id, userId);
    await this.shiftNoteRepository.remove(shiftNote);
  }
}

export const shiftNoteService = new ShiftNoteService();
