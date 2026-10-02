import { MoreThanOrEqual } from 'typeorm';
import { getRepository } from '../config/database';
import {
  Escalation,
  ESCALATION_PRIORITIES,
  ESCALATION_STATUSES,
  ESCALATION_CATEGORIES,
  EscalationPriority,
} from '../entities/Escalation';
import { Property } from '../entities/Property';
import { User } from '../entities/User';
import { AuthorizationError, NotFoundError, ValidationError } from '../lib/errors';

export interface CreateEscalationDto {
  property_id: number;
  reason: string;
  priority?: string;
  guest_name?: string;
  room_number?: string;
  category?: string;
  subcategory?: string;
  sla_minutes?: number;
}

export interface UpdateEscalationDto {
  status?: string;
  priority?: string;
  assigned_to?: string | null;
  category?: string;
  subcategory?: string;
  resolution_notes?: string;
  resolved_by?: string | null;
  sla_minutes?: number;
}

export interface EscalationAssignmentRule {
  id: string;
  name: string;
  conditions: {
    category?: string[];
    priority?: string[];
    property_id?: number;
  };
  assign_to: string; // user_id
  sla_minutes: number;
}

export interface EscalationSLAReport {
  property_id: number;
  total_escalations: number;
  avg_resolution_time_minutes: number | null;
  sla_compliance_rate: number;
  by_priority: Record<
    string,
    {
      count: number;
      avg_resolution_time_minutes: number | null;
      sla_compliance_rate: number;
    }
  >;
  by_category: Record<
    string,
    {
      count: number;
      avg_resolution_time_minutes: number | null;
      sla_compliance_rate: number;
    }
  >;
}

export interface ResolutionTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
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

    // Validate category if provided
    let category: string | null = null;
    if (dto.category) {
      category = String(dto.category);
      if (!(ESCALATION_CATEGORIES as readonly string[]).includes(category)) {
        throw new ValidationError('Invalid category');
      }
    }

    // The escalation must reference a property owned by the caller, so an
    // authenticated user can never create records against another property.
    const property = await this.propertyRepository.findOne({
      where: { id: dto.property_id, user_id: userId },
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
      category,
      subcategory: clean(dto.subcategory, MAX_NAME_LENGTH),
      status: 'open',
      assigned_to: null,
      assigned_by: null,
      assigned_at: null,
      started_at: null,
      resolved_at: null,
      sla_minutes: dto.sla_minutes || null,
      resolution_notes: null,
      resolved_by: null,
      resolution_template: null,
      escalated_at: null,
      escalated_by: null,
      escalation_notes: null,
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
      if (patch.assigned_to) {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!UUID_RE.test(patch.assigned_to)) {
          throw new ValidationError('assigned_to must be a valid user id');
        }
        const assignee = await getRepository<User>(User).findOne({
          where: { id: patch.assigned_to } as never,
        });
        if (!assignee) {
          throw new ValidationError('assigned_to user does not exist');
        }
        const property = await getRepository<Property>(Property).findOne({
          where: { id: escalation.property_id, user_id: assignee.id } as never,
        });
        const assigneeCanAccess =
          Boolean(property) || assignee.property_id === escalation.property_id;
        if (!assigneeCanAccess) {
          throw new ValidationError("Assignee cannot access this escalation's property");
        }
      }
    }

    if (dto.status !== undefined) {
      if (!(ESCALATION_STATUSES as readonly string[]).includes(dto.status)) {
        throw new ValidationError('Invalid status');
      }
      patch.status = dto.status;
      patch.resolved_at = dto.status === 'resolved' ? new Date() : null;
    }
    // Keep status consistent with assignment state after all patch fields are in.
    const effectiveAssignee =
      patch.assigned_to !== undefined ? patch.assigned_to : escalation.assigned_to;
    const effectiveStatus = patch.status !== undefined ? patch.status : escalation.status;
    if (effectiveAssignee && effectiveStatus === 'open') patch.status = 'assigned';
    if (!effectiveAssignee && effectiveStatus === 'assigned') patch.status = 'open';

    const merged = this.escalationRepository.merge(escalation, patch);
    return this.escalationRepository.save(merged);
  }

  // Only the creator can delete an escalation; the assignee can work it but
  // not remove the record.
  async delete(id: number, userId: string): Promise<void> {
    const escalation = await this.escalationRepository.findOne({
      where: { id, created_by: userId },
    });
    if (!escalation) {
      throw new NotFoundError('Escalation', id);
    }
    await this.escalationRepository.delete(id);
  }

  /**
   * Start working on an escalation
   */
  async startEscalation(id: number, userId: string): Promise<Escalation> {
    const escalation = await this.findAccessible(id, userId);

    // Only assigned user can start working on the escalation
    if (escalation.assigned_to !== userId) {
      throw new AuthorizationError(
        'You must be assigned to this escalation to start working on it'
      );
    }

    if (escalation.status !== 'assigned') {
      throw new ValidationError('Escalation must be in assigned status to start working');
    }

    escalation.status = 'in_progress';
    escalation.started_at = new Date();

    return this.escalationRepository.save(escalation);
  }

  /**
   * Escalate to higher level
   */
  async escalate(id: number, userId: string, notes?: string): Promise<Escalation> {
    const escalation = await this.findAccessible(id, userId);

    if (escalation.status === 'resolved') {
      throw new ValidationError('Cannot escalate a resolved escalation');
    }

    // Increase priority if not already urgent
    if (escalation.priority !== 'urgent') {
      const priorityIndex = ESCALATION_PRIORITIES.indexOf(
        escalation.priority as EscalationPriority
      );
      if (priorityIndex < ESCALATION_PRIORITIES.length - 1) {
        escalation.priority = ESCALATION_PRIORITIES[priorityIndex + 1];
      }
    }

    escalation.status = 'escalated';
    escalation.escalated_at = new Date();
    escalation.escalated_by = userId;

    if (notes) {
      escalation.escalation_notes = escalation.escalation_notes
        ? `${escalation.escalation_notes}\n${new Date().toISOString()} - ${userId}: ${notes}`
        : `${new Date().toISOString()} - ${userId}: ${notes}`;
    }

    // Clear previous assignment when escalated
    escalation.assigned_to = null;
    escalation.assigned_by = null;
    escalation.assigned_at = null;

    return this.escalationRepository.save(escalation);
  }

  /**
   * Get escalation by ID with full details
   */
  async getByIdWithDetails(id: number, userId: string): Promise<Escalation> {
    const escalation = await this.findAccessible(id, userId);
    return escalation;
  }

  /**
   * Search escalations with advanced filters
   */
  async search(
    userId: string,
    options?: {
      status?: string;
      priority?: string;
      category?: string;
      property_id?: number;
      date_from?: string;
      date_to?: string;
      assigned_to?: string;
    }
  ): Promise<Escalation[]> {
    const { status, priority, category, property_id, date_from, date_to, assigned_to } =
      options || {};

    const queryBuilder = this.escalationRepository
      .createQueryBuilder('e')
      .where('(e.created_by = :userId OR e.assigned_to = :userId)', { userId });

    if (status) {
      if (!(ESCALATION_STATUSES as readonly string[]).includes(status)) {
        throw new ValidationError('Invalid status filter');
      }
      queryBuilder.andWhere('e.status = :status', { status });
    }

    if (priority) {
      if (!(ESCALATION_PRIORITIES as readonly string[]).includes(priority)) {
        throw new ValidationError('Invalid priority filter');
      }
      queryBuilder.andWhere('e.priority = :priority', { priority });
    }

    if (category) {
      queryBuilder.andWhere('e.category = :category', { category });
    }

    if (property_id) {
      queryBuilder.andWhere('e.property_id = :property_id', { property_id });
    }

    if (assigned_to) {
      queryBuilder.andWhere('e.assigned_to = :assigned_to', { assigned_to });
    }

    if (date_from) {
      queryBuilder.andWhere('e.created_at >= :date_from', { date_from: new Date(date_from) });
    }

    if (date_to) {
      queryBuilder.andWhere('e.created_at <= :date_to', { date_to: new Date(date_to) });
    }

    queryBuilder.orderBy('e.priority', 'DESC');
    queryBuilder.addOrderBy('e.created_at', 'ASC');

    return queryBuilder.getMany();
  }

  /**
   * Get escalation statistics and SLA compliance
   */
  async getSLAReport(propertyId: number, userId: string, days = 30): Promise<EscalationSLAReport> {
    // Verify property access
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, user_id: userId },
    });

    if (!property) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const escalations = await this.escalationRepository.find({
      where: {
        property_id: propertyId,
        created_at: MoreThanOrEqual(since),
      },
    });

    const total_escalations = escalations.length;

    // Calculate overall metrics
    const resolvedEscalations = escalations.filter((e) => e.resolved_at);
    const resolutionTimes = resolvedEscalations.map((e) => {
      if (e.resolved_at) {
        return (e.resolved_at.getTime() - e.created_at.getTime()) / (1000 * 60); // minutes
      }
      return 0;
    });

    const avg_resolution_time_minutes =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length
        : null;

    // Calculate SLA compliance
    let slaCompliant = 0;
    for (const escalation of resolvedEscalations) {
      if (escalation.resolved_at && escalation.sla_minutes) {
        const resolutionTime =
          (escalation.resolved_at.getTime() - escalation.created_at.getTime()) / (1000 * 60);
        if (resolutionTime <= escalation.sla_minutes) {
          slaCompliant++;
        }
      }
    }

    const sla_compliance_rate =
      resolvedEscalations.length > 0 ? (slaCompliant / resolvedEscalations.length) * 100 : 0;

    // Group by priority
    const by_priority: Record<
      string,
      { count: number; avg_resolution_time_minutes: number | null; sla_compliance_rate: number }
    > = {};

    for (const priority of ESCALATION_PRIORITIES) {
      const priorityEscalations = escalations.filter((e) => e.priority === priority);
      const priorityResolved = priorityEscalations.filter((e) => e.resolved_at);

      const priorityResolutionTimes = priorityResolved.map((e) => {
        if (e.resolved_at) {
          return (e.resolved_at.getTime() - e.created_at.getTime()) / (1000 * 60);
        }
        return 0;
      });

      const avgTime =
        priorityResolutionTimes.length > 0
          ? priorityResolutionTimes.reduce((sum, time) => sum + time, 0) /
            priorityResolutionTimes.length
          : null;

      let prioritySLACompliant = 0;
      for (const escalation of priorityResolved) {
        if (escalation.resolved_at && escalation.sla_minutes) {
          const resolutionTime =
            (escalation.resolved_at.getTime() - escalation.created_at.getTime()) / (1000 * 60);
          if (resolutionTime <= escalation.sla_minutes) {
            prioritySLACompliant++;
          }
        }
      }

      const prioritySLARate =
        priorityResolved.length > 0 ? (prioritySLACompliant / priorityResolved.length) * 100 : 0;

      by_priority[priority] = {
        count: priorityEscalations.length,
        avg_resolution_time_minutes: avgTime ? Math.round(avgTime * 100) / 100 : null,
        sla_compliance_rate: Math.round(prioritySLARate * 100) / 100,
      };
    }

    // Group by category
    const by_category: Record<
      string,
      { count: number; avg_resolution_time_minutes: number | null; sla_compliance_rate: number }
    > = {};

    for (const category of ESCALATION_CATEGORIES) {
      const categoryEscalations = escalations.filter((e) => e.category === category);
      const categoryResolved = categoryEscalations.filter((e) => e.resolved_at);

      const categoryResolutionTimes = categoryResolved.map((e) => {
        if (e.resolved_at) {
          return (e.resolved_at.getTime() - e.created_at.getTime()) / (1000 * 60);
        }
        return 0;
      });

      const avgTime =
        categoryResolutionTimes.length > 0
          ? categoryResolutionTimes.reduce((sum, time) => sum + time, 0) /
            categoryResolutionTimes.length
          : null;

      let categorySLACompliant = 0;
      for (const escalation of categoryResolved) {
        if (escalation.resolved_at && escalation.sla_minutes) {
          const resolutionTime =
            (escalation.resolved_at.getTime() - escalation.created_at.getTime()) / (1000 * 60);
          if (resolutionTime <= escalation.sla_minutes) {
            categorySLACompliant++;
          }
        }
      }

      const categorySLARate =
        categoryResolved.length > 0 ? (categorySLACompliant / categoryResolved.length) * 100 : 0;

      by_category[category] = {
        count: categoryEscalations.length,
        avg_resolution_time_minutes: avgTime ? Math.round(avgTime * 100) / 100 : null,
        sla_compliance_rate: Math.round(categorySLARate * 100) / 100,
      };
    }

    return {
      property_id: propertyId,
      total_escalations,
      avg_resolution_time_minutes: avg_resolution_time_minutes
        ? Math.round(avg_resolution_time_minutes * 100) / 100
        : null,
      sla_compliance_rate: Math.round(sla_compliance_rate * 100) / 100,
      by_priority,
      by_category,
    };
  }

  /**
   * Assign escalation with automatic rules
   */
  async assignWithRules(
    id: number,
    userId: string,
    rules: EscalationAssignmentRule[]
  ): Promise<Escalation> {
    const escalation = await this.findAccessible(id, userId);

    if (escalation.status !== 'open' && escalation.status !== 'escalated') {
      throw new ValidationError('Escalation must be open or escalated to be assigned');
    }

    // Find matching rule
    const matchingRule = rules.find((rule) => {
      const conditions = rule.conditions;
      return (
        (!conditions.category || conditions.category.includes(escalation.category || '')) &&
        (!conditions.priority || conditions.priority.includes(escalation.priority)) &&
        (!conditions.property_id || conditions.property_id === escalation.property_id)
      );
    });

    if (matchingRule) {
      escalation.assigned_to = matchingRule.assign_to;
      escalation.assigned_by = userId;
      escalation.assigned_at = new Date();
      escalation.status = 'assigned';
      escalation.sla_minutes = matchingRule.sla_minutes;
    } else {
      // Default assignment logic
      escalation.assigned_to = null;
      escalation.assigned_by = userId;
      escalation.assigned_at = new Date();
      escalation.status = 'assigned';
    }

    return this.escalationRepository.save(escalation);
  }

  /**
   * Get resolution templates by category
   */
  async getResolutionTemplates(category?: string): Promise<ResolutionTemplate[]> {
    const templates: ResolutionTemplate[] = [
      {
        id: 'guest_complaint_apology',
        name: 'Guest Complaint Apology',
        category: 'guest_complaint',
        content:
          'Dear {guest_name}, we sincerely apologize for the {issue} you experienced. We have taken immediate action to address this and will follow up with you directly. As a token of our apology, we would like to offer you {compensation}. Thank you for bringing this to our attention.',
        variables: ['guest_name', 'issue', 'compensation'],
      },
      {
        id: 'maintenance_request',
        name: 'Maintenance Request Resolution',
        category: 'maintenance',
        content:
          'Thank you for reporting the maintenance issue in {room_number}. Our maintenance team has been notified and will address the {issue} within {timeframe}. We apologize for any inconvenience this may have caused. If the issue is urgent, please contact the front desk immediately.',
        variables: ['room_number', 'issue', 'timeframe'],
      },
      {
        id: 'billing_dispute',
        name: 'Billing Dispute Resolution',
        category: 'billing',
        content:
          "Dear {guest_name}, we have reviewed your concern regarding the charge of ${amount} for {service} on {date}. We apologize for any confusion. {resolution}. If you have any further questions, please don't hesitate to contact us.",
        variables: ['guest_name', 'amount', 'service', 'date', 'resolution'],
      },
      {
        id: 'security_incident',
        name: 'Security Incident Response',
        category: 'security',
        content:
          'Security Incident Report: {incident_type} occurred at {location} on {date_time}. Immediate actions taken: {actions}. Status: {status}. Follow-up required: {follow_up}.',
        variables: ['incident_type', 'location', 'date_time', 'actions', 'status', 'follow_up'],
      },
    ];

    if (category) {
      return templates.filter((template) => template.category === category);
    }
    return templates;
  }

  /**
   * Resolve escalation with template
   */
  async resolveWithTemplate(
    id: number,
    userId: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<Escalation> {
    const escalation = await this.findAccessible(id, userId);

    if (escalation.status === 'resolved') {
      throw new ValidationError('Escalation is already resolved');
    }

    // Get the template
    const templates = await this.getResolutionTemplates();
    const template = templates.find((t) => t.id === templateId);

    if (!template) {
      throw new NotFoundError('ResolutionTemplate', templateId);
    }

    // Replace variables in template
    let resolvedContent = template.content;
    for (const [key, value] of Object.entries(variables)) {
      resolvedContent = resolvedContent.replace(new RegExp(`\{${key}\}`, 'g'), value);
    }

    // Update escalation
    escalation.status = 'resolved';
    escalation.resolved_at = new Date();
    escalation.resolved_by = userId;
    escalation.resolution_notes = resolvedContent;
    escalation.resolution_template = { template_id: templateId, variables };

    return this.escalationRepository.save(escalation);
  }

  private async findAccessible(id: number, userId: string): Promise<Escalation> {
    const escalation = await this.escalationRepository
      .createQueryBuilder('e')
      .where('e.id = :id AND (e.created_by = :userId OR e.assigned_to = :userId)', { id, userId })
      .getOne();
    if (!escalation) {
      throw new NotFoundError('Escalation', id);
    }
    return escalation;
  }
}

export const escalationService = new EscalationService();
