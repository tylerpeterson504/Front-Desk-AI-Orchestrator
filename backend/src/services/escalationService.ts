import { getRepository } from '../config/database';
import { Escalation, ESCALATION_PRIORITIES, ESCALATION_STATUSES } from '../entities/Escalation';
import { Property } from '../entities/Property';
import { AuthorizationError, NotFoundError, ValidationError } from '../lib/errors';

export interface CreateEscalationDto {
  property_id: number;
  reason: string;
  priority?: string;
  guest_name?: string;
  room_number?: string;
}

export interface UpdateEscalationDto {
  status?: string;
  priority?: string;
  assigned_to?: string | null;
}

const MAX_REASON_LENGTH = 2000;
const MAX_NAME_LENGTH = 255;
const MAX_ROOM_LENGTH = 50;

function clean(value: unknown, maxLength: number): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export class EscalationService {
  private escalationRepository = getRepository<Escalation>(Escalation);
  private propertyRepository = getRepository<Property>(Property);

  // An agent sees escalations they created and escalations assigned to them.
  async getAll(userId: string, options?: { status?: string }): Promise<Escalation[]> {
    const qb = this.escalationRepository
      .createQueryBuilder('e')
      .where('(e.created_by = :userId OR e.assigned_to = :userId)', { userId })
      .orderBy('e.created_at', 'DESC');

    const status = options?.status;
    if (status) {
      if (!(ESCALATION_STATUSES as readonly string[]).includes(status)) {
        throw new ValidationError('Invalid status filter');
      }
      qb.andWhere('e.status = :status', { status });
    }
    return qb.getMany();
  }

  async create(dto: CreateEscalationDto, userId: string): Promise<Escalation> {
    if (!dto || !Number.isInteger(dto.property_id)) {
      throw new ValidationError('property_id is required');
    }
    const reason = clean(dto.reason, MAX_REASON_LENGTH);
    if (!reason) {
      throw new ValidationError('reason is required');
    }
    const priority = dto.priority ? String(dto.priority) : 'normal';
    if (!(ESCALATION_PRIORITIES as readonly string[]).includes(priority)) {
      throw new ValidationError('Invalid priority');
    }

    // The escalation must reference a property owned by the caller, so an
    // authenticated user can never create records against another property.
    const property = await this.propertyRepository.findOne({
      where: { id: dto.property_id, user_id: userId }
    });
    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const escalation = this.escalationRepository.create({
      property_id: dto.property_id,
      created_by: userId,
      guest_name: clean(dto.guest_name, MAX_NAME_LENGTH),
      room_number: clean(dto.room_number, MAX_ROOM_LENGTH),
      reason,
      priority,
      status: 'open',
      assigned_to: null,
      resolved_at: null
    });

    return this.escalationRepository.save(escalation);
  }

  async update(id: number, dto: UpdateEscalationDto, userId: string): Promise<Escalation> {
    const escalation = await this.findAccessible(id, userId);
    const patch: Partial<Escalation> = {};

    if (dto.priority !== undefined) {
      if (!(ESCALATION_PRIORITIES as readonly string[]).includes(dto.priority)) {
        throw new ValidationError('Invalid priority');
      }
      patch.priority = dto.priority;
    }

    if (dto.assigned_to !== undefined) {
      patch.assigned_to = dto.assigned_to ? String(dto.assigned_to) : null;
      if (patch.assigned_to && escalation.status === 'open') patch.status = 'assigned';
      if (!patch.assigned_to && escalation.status === 'assigned') patch.status = 'open';
    }

    if (dto.status !== undefined) {
      if (!(ESCALATION_STATUSES as readonly string[]).includes(dto.status)) {
        throw new ValidationError('Invalid status');
      }
      patch.status = dto.status;
      patch.resolved_at = dto.status === 'resolved' ? new Date() : null;
    }

    const merged = this.escalationRepository.merge(escalation, patch);
    return this.escalationRepository.save(merged);
  }

  // Only the creator can delete an escalation; the assignee can work it but
  // not remove the record.
  async delete(id: number, userId: string): Promise<void> {
    const escalation = await this.escalationRepository.findOne({
      where: { id, created_by: userId }
    });
    if (!escalation) {
      throw new NotFoundError('Escalation not found');
    }
    await this.escalationRepository.delete(id);
  }

  private async findAccessible(id: number, userId: string): Promise<Escalation> {
    const escalation = await this.escalationRepository
      .createQueryBuilder('e')
      .where('e.id = :id AND (e.created_by = :userId OR e.assigned_to = :userId)', { id, userId })
      .getOne();
    if (!escalation) {
      throw new NotFoundError('Escalation not found');
    }
    return escalation;
  }
}

export const escalationService = new EscalationService();
