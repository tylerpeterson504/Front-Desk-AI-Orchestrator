import { getRepository } from '../config/database';
import { ShiftNote } from '../entities/ShiftNote';
import { Property } from '../entities/Property';
import { AppError, NotFoundError, ValidationError, AuthorizationError } from '../lib/errors';
import { createRequestLogger } from '../lib/logger';

export interface CreateShiftNoteDto {
  property_id: number;
  content: string;
}

export interface UpdateShiftNoteDto {
  content: string;
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
        created_at: { $gte: today, $lt: tomorrow },
      },
      order: { created_at: 'DESC' },
      relations: ['property'],
    });
  }

  async getById(id: number, userId: string): Promise<ShiftNote> {
    const shiftNote = await this.shiftNoteRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!shiftNote) {
      throw new NotFoundError('ShiftNote', id);
    }

    return shiftNote;
  }

  async create(data: CreateShiftNoteDto, userId: string): Promise<ShiftNote> {
    // Validate property access
    const property = await this.propertyRepository.findOne({
      where: { id: data.property_id },
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
    });

    await this.shiftNoteRepository.save(shiftNote);

    return shiftNote;
  }

  async update(id: number, data: UpdateShiftNoteDto, userId: string): Promise<ShiftNote> {
    const shiftNote = await this.getById(id, userId);

    const content = this.readContent(data.content);

    shiftNote.content = content;

    await this.shiftNoteRepository.save(shiftNote);

    return shiftNote;
  }

  async delete(id: number, userId: string): Promise<void> {
    const shiftNote = await this.getById(id, userId);
    await this.shiftNoteRepository.remove(shiftNote);
  }
}

export const shiftNoteService = new ShiftNoteService();
