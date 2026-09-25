import { getRepository } from '../config/database';
import { ResponseEvent } from '../entities/ResponseEvent';
import { Property } from '../entities/Property';
import { AuthorizationError, ValidationError } from '../lib/errors';

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

const MAX_BATCH = 100;
const MAX_WINDOW_DAYS = 90;

function percentile(sorted: number[], p: number): number {
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))];
}

export class AnalyticsService {
  private eventRepository = getRepository<ResponseEvent>(ResponseEvent);
  private propertyRepository = getRepository<Property>(Property);

  async record(events: RecordEventDto[], userId: string): Promise<number> {
    if (!Array.isArray(events) || !events.length) {
      throw new ValidationError('events array is required');
    }
    if (events.length > MAX_BATCH) {
      throw new ValidationError('Batch too large');
    }

    // Every event must reference a property owned by the caller.
    const propertyIds = [...new Set(events.map((e) => e.property_id))];
    const owned = await this.propertyRepository.find({
      where: propertyIds.map((id) => ({ user_id: userId, id })) as never
    });
    const ownedIds = new Set(owned.map((p) => p.id));
    if (!propertyIds.every((id) => ownedIds.has(id))) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const rows: ResponseEvent[] = [];
    for (const e of events) {
      const firstSeen = new Date(e.first_seen_at);
      if (Number.isNaN(firstSeen.getTime())) {
        throw new ValidationError('first_seen_at must be an ISO date');
      }
      let replied: Date | null = null;
      if (e.replied_at !== undefined && e.replied_at !== null) {
        replied = new Date(e.replied_at);
        if (Number.isNaN(replied.getTime())) {
          throw new ValidationError('replied_at must be an ISO date');
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
          replied_at: replied
        })
      );
    }

    await this.eventRepository.save(rows);
    return rows.length;
  }

  async responseTimes(property_id: number, userId: string, days = 30): Promise<ResponseTimesSummary> {
    if (!Number.isInteger(property_id)) {
      throw new ValidationError('property_id is required');
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_WINDOW_DAYS) {
      throw new ValidationError('days must be between 1 and ' + MAX_WINDOW_DAYS);
    }

    const property = await this.propertyRepository.findOne({
      where: { id: property_id, user_id: userId }
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
      return { property_id, days, count: 0, median_seconds: null, avg_seconds: null, p95_seconds: null };
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
      p95_seconds: Math.round(percentile(seconds, 95))
    };
  }
}

export const analyticsService = new AnalyticsService();
