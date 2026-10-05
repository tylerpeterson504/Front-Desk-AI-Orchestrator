import { In } from 'typeorm';
import { getRepository } from '../config/database';
import { ResponseEvent } from '../entities/ResponseEvent';
import { Property } from '../entities/Property';
import { Template } from '../entities/Template';
import { ShiftNote } from '../entities/ShiftNote';
import { Escalation } from '../entities/Escalation';
import { AuthorizationError, ValidationError } from '../lib/errors';
import logger from '../lib/logger';

export interface RecordEventDto {
  property_id: number;
  conversation_hash: string;
  first_seen_at: string;
  replied_at?: string;
}

export interface ResponseTimesSummary {
  property_id: number;
  days: number;
  count: number;
  median_seconds: number | null;
  avg_seconds: number | null;
  p95_seconds: number | null;
}

export interface CopilotUsageSummary {
  property_id: number;
  days: number;
  total_requests: number;
  unique_users: number;
  templates_used: number;
  most_used_templates: Array<{ template_id: number; count: number }>;
}

export interface TemplateEffectivenessSummary {
  template_id: number;
  usage_count: number;
  avg_response_length: number;
  property_id: number;
}

export interface ShiftNoteCompletionSummary {
  property_id: number;
  days: number;
  total_notes: number;
  completed_notes: number;
  completion_rate: number;
}

export interface EscalationResolutionSummary {
  property_id: number;
  days: number;
  total_escalations: number;
  resolved_escalations: number;
  avg_resolution_time_seconds: number | null;
  resolution_rate: number;
}

const MAX_BATCH = 100;
const FUTURE_SLOP_MS = 5 * 60 * 1000;
const MAX_WINDOW_DAYS = 90;

function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))];
}

export class AnalyticsService {
  private eventRepository = getRepository<ResponseEvent>(ResponseEvent);
  private propertyRepository = getRepository<Property>(Property);
  private templateRepository = getRepository<Template>(Template);
  private shiftNoteRepository = getRepository<ShiftNote>(ShiftNote);
  private escalationRepository = getRepository<Escalation>(Escalation);

  async record(events: RecordEventDto[], userId: string): Promise<number> {
    if (!Array.isArray(events) || !events.length) {
      throw new ValidationError('events array is required');
    }
    if (events.length > MAX_BATCH) {
      throw new ValidationError('Batch too large');
    }

    // Every event must reference a property owned by the caller.
    if (!events.every((e) => Number.isInteger(e.property_id))) {
      throw new ValidationError('property_id must be an integer');
    }
    const propertyIds = [...new Set(events.map((e) => e.property_id))];
    const owned = await this.propertyRepository.find({
      where: propertyIds.map((id) => ({ user_id: userId, id })) as never,
    });
    const ownedIds = new Set(owned.map((p) => p.id));
    if (!propertyIds.every((id) => ownedIds.has(id))) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const rows: ResponseEvent[] = [];
    for (const e of events) {
      if (typeof e.first_seen_at !== 'string') {
        throw new ValidationError('first_seen_at must be an ISO date string');
      }
      const firstSeen = new Date(e.first_seen_at);
      if (Number.isNaN(firstSeen.getTime())) {
        throw new ValidationError('first_seen_at must be an ISO date');
      }
      if (firstSeen.getTime() > Date.now() + FUTURE_SLOP_MS) {
        throw new ValidationError('first_seen_at cannot be in the future');
      }
      let replied: Date | null = null;
      if (e.replied_at !== undefined && e.replied_at !== null) {
        if (typeof e.replied_at !== 'string') {
          throw new ValidationError('replied_at must be an ISO date string');
        }
        replied = new Date(e.replied_at);
        if (Number.isNaN(replied.getTime())) {
          throw new ValidationError('replied_at must be an ISO date');
        }
        if (replied.getTime() < firstSeen.getTime()) {
          throw new ValidationError('replied_at cannot precede first_seen_at');
        }
        if (replied.getTime() > Date.now() + FUTURE_SLOP_MS) {
          throw new ValidationError('replied_at cannot be in the future');
        }
      }
      const hash = String(e.conversation_hash || '').slice(0, 64);
      if (!hash) {
        throw new ValidationError('conversation_hash is required');
      }
      rows.push(
        this.eventRepository.create({
          property_id: e.property_id,
          user_id: userId,
          conversation_hash: hash,
          first_seen_at: firstSeen,
          replied_at: replied,
        })
      );
    }

    await this.eventRepository.save(rows);
    return rows.length;
  }

  async responseTimes(
    property_id: number,
    userId: string,
    days = 30
  ): Promise<ResponseTimesSummary> {
    if (!Number.isInteger(property_id)) {
      throw new ValidationError('property_id is required');
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_WINDOW_DAYS) {
      throw new ValidationError('days must be between 1 and ' + MAX_WINDOW_DAYS);
    }

    const property = await this.propertyRepository.findOne({
      where: { id: property_id, user_id: userId },
    });
    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const events = await this.eventRepository
      .createQueryBuilder('e')
      .where('e.property_id = :property_id', { property_id })
      .andWhere('e.created_at >= :since', { since })
      .andWhere('e.replied_at IS NOT NULL')
      .getMany();

    const seconds = events
      .map((e) => (e.replied_at!.getTime() - e.first_seen_at.getTime()) / 1000)
      .filter((s) => s >= 0)
      .sort((a, b) => a - b);

    if (!seconds.length) {
      return {
        property_id,
        days,
        count: 0,
        median_seconds: null,
        avg_seconds: null,
        p95_seconds: null,
      };
    }

    const mid = Math.floor(seconds.length / 2);
    const median = seconds.length % 2 ? seconds[mid] : (seconds[mid - 1] + seconds[mid]) / 2;
    const avg = seconds.reduce((a, b) => a + b, 0) / seconds.length;

    return {
      property_id,
      days,
      count: seconds.length,
      median_seconds: Math.round(median),
      avg_seconds: Math.round(avg),
      p95_seconds: Math.round(percentile(seconds, 95)),
    };
  }

  /**
   * Get copilot usage analytics by property
   */
  async copilotUsage(property_id: number, userId: string, days = 30): Promise<CopilotUsageSummary> {
    if (!Number.isInteger(property_id)) {
      throw new ValidationError('property_id is required');
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_WINDOW_DAYS) {
      throw new ValidationError('days must be between 1 and ' + MAX_WINDOW_DAYS);
    }

    // Verify property ownership
    const property = await this.propertyRepository.findOne({
      where: { id: property_id, user_id: userId },
    });
    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get response events for this property in the time period
    const events = await this.eventRepository
      .createQueryBuilder('e')
      .where('e.property_id = :property_id', { property_id })
      .andWhere('e.created_at >= :since', { since })
      .getMany();

    // Count unique users
    const userIds = [...new Set(events.map((e) => e.user_id))];

    // Get template usage from the response events
    // Note: This assumes we track template usage in metadata - only works for new events
    const templateUsage: Map<number, number> = new Map();
    for (const event of events) {
      if (event.metadata && Array.isArray(event.metadata.template_ids)) {
        for (const templateId of event.metadata.template_ids) {
          if (typeof templateId === 'number') {
            templateUsage.set(templateId, (templateUsage.get(templateId) || 0) + 1);
          }
        }
      }
    }

    // Convert to sorted array
    const mostUsedTemplates = Array.from(templateUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([template_id, count]) => ({ template_id, count }));

    return {
      property_id,
      days,
      total_requests: events.length,
      unique_users: userIds.length,
      templates_used: templateUsage.size,
      most_used_templates: mostUsedTemplates,
    };
  }

  /**
   * Get template effectiveness metrics
   */
  async templateEffectiveness(
    property_id: number,
    userId: string,
    template_id: number
  ): Promise<TemplateEffectivenessSummary> {
    if (!Number.isInteger(property_id)) {
      throw new ValidationError('property_id is required');
    }
    if (!Number.isInteger(template_id)) {
      throw new ValidationError('template_id is required');
    }

    // Verify property and template ownership
    const property = await this.propertyRepository.findOne({
      where: { id: property_id, user_id: userId },
    });
    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const template = await this.templateRepository.findOne({
      where: { id: template_id, user_id: userId },
    });
    if (!template) {
      throw new AuthorizationError('Template not found or access denied');
    }

    // Get response events that used this template
    // For PostgreSQL, we use jsonb_array_elements_text to check if template_id is in the array
    const events = await this.eventRepository
      .createQueryBuilder('e')
      .where('e.property_id = :property_id', { property_id })
      .andWhere('e.metadata IS NOT NULL')
      .andWhere(
        "exists(select 1 from jsonb_array_elements_text(e.metadata->'template_ids') as t where t = :template_id::text)"
      )
      .setParameter('template_id', template_id.toString())
      .getMany();

    // Calculate average response length
    const responseLengths = events
      .map((e) =>
        e.response_text && typeof e.response_text === 'string' ? e.response_text.length : 0
      )
      .filter((len) => len > 0);

    const avgLength =
      responseLengths.length > 0
        ? responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length
        : 0;

    return {
      template_id,
      usage_count: events.length,
      avg_response_length: Math.round(avgLength),
      property_id,
    };
  }

  /**
   * Get shift note completion rates
   */
  async shiftNoteCompletion(
    property_id: number,
    userId: string,
    days = 30
  ): Promise<ShiftNoteCompletionSummary> {
    if (!Number.isInteger(property_id)) {
      throw new ValidationError('property_id is required');
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_WINDOW_DAYS) {
      throw new ValidationError('days must be between 1 and ' + MAX_WINDOW_DAYS);
    }

    // Verify property ownership
    const property = await this.propertyRepository.findOne({
      where: { id: property_id, user_id: userId },
    });
    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all shift notes for this property
    const notes = await this.shiftNoteRepository
      .createQueryBuilder('note')
      .where('note.property_id = :property_id', { property_id })
      .andWhere('note.created_at >= :since', { since })
      .getMany();

    // For now, assume all shift notes are "completed" if they have content
    // In a more sophisticated system, we might have a status field
    const completed_notes = notes.filter(
      (note) => note.content && note.content.trim().length > 0
    ).length;

    const completion_rate = notes.length > 0 ? (completed_notes / notes.length) * 100 : 0;

    return {
      property_id,
      days,
      total_notes: notes.length,
      completed_notes,
      completion_rate: Math.round(completion_rate * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Get escalation resolution time tracking
   */
  async escalationResolutionTimes(
    property_id: number,
    userId: string,
    days = 30
  ): Promise<EscalationResolutionSummary> {
    if (!Number.isInteger(property_id)) {
      throw new ValidationError('property_id is required');
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_WINDOW_DAYS) {
      throw new ValidationError('days must be between 1 and ' + MAX_WINDOW_DAYS);
    }

    // Verify property ownership
    const property = await this.propertyRepository.findOne({
      where: { id: property_id, user_id: userId },
    });
    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get all escalations for this property
    const escalations = await this.escalationRepository
      .createQueryBuilder('e')
      .where('e.property_id = :property_id', { property_id })
      .andWhere('e.created_at >= :since', { since })
      .getMany();

    const resolved_escalations = escalations.filter((e) => e.resolved_at !== null);
    const resolution_times = resolved_escalations
      .map((e) => (e.resolved_at!.getTime() - e.created_at.getTime()) / 1000)
      .filter((t) => t >= 0);

    const avg_resolution_time =
      resolution_times.length > 0
        ? resolution_times.reduce((a, b) => a + b, 0) / resolution_times.length
        : null;

    const resolution_rate =
      escalations.length > 0 ? (resolved_escalations.length / escalations.length) * 100 : 0;

    return {
      property_id,
      days,
      total_escalations: escalations.length,
      resolved_escalations: resolved_escalations.length,
      avg_resolution_time_seconds: avg_resolution_time ? Math.round(avg_resolution_time) : null,
      resolution_rate: Math.round(resolution_rate * 100) / 100, // Round to 2 decimal places
    };
  }
}

export const analyticsService = new AnalyticsService();
