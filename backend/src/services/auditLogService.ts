import { getRepository } from '../config/database';
import { AuditLog } from '../entities/AuditLog';
import { Property } from '../entities/Property';
import { AppError, ValidationError } from '../lib/errors';
import { createRequestLogger } from '../lib/logger';

export interface CreateAuditLogDto {
  action: string;
  resource: string;
  resource_id?: string | number;
  metadata?: Record<string, unknown>;
  property_id?: number;
}

export interface AuditLogWithProperty extends AuditLog {
  property_name?: string;
}

export class AuditLogService {
  private auditLogRepository = getRepository<AuditLog>(AuditLog);
  private propertyRepository = getRepository<Property>(Property);

  async getAll(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AuditLogWithProperty[]> {
    const limit = Math.min(options?.limit || 100, 500);
    const offset = options?.offset || 0;

    const logs = await this.auditLogRepository
      .createQueryBuilder('al')
      .leftJoinAndSelect('al.property', 'property')
      .where('al.user_id = :userId', { userId })
      .orderBy('al.created_at', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    return logs.map((log) => ({
      ...log,
      property_name: log.property?.name,
    }));
  }

  async create(data: CreateAuditLogDto, userId?: string): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      user_id: userId || null,
      action: data.action,
      resource: data.resource,
      resource_id: data.resource_id ? String(data.resource_id) : null,
      metadata: data.metadata || null,
      property_id: data.property_id || null,
      ip_address: null,
      user_agent: null,
    });

    await this.auditLogRepository.save(auditLog);

    return auditLog;
  }

  async logAction(
    action: string,
    resource: string,
    userId: string,
    options?: {
      resourceId?: string | number;
      metadata?: Record<string, unknown>;
      propertyId?: number;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<AuditLog> {
    return this.create(
      {
        action,
        resource,
        resource_id: options?.resourceId,
        metadata: options?.metadata,
        property_id: options?.propertyId,
      },
      userId
    );
  }
}

export const auditLogService = new AuditLogService();
