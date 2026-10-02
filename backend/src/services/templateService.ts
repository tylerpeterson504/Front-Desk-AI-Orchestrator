import { getRepository } from '../config/database';
import { Template } from '../entities/Template';
import { User } from '../entities/User';
import { AppError, NotFoundError, ValidationError } from '../lib/errors';
import { createRequestLogger } from '../lib/logger';
import { findTemplatePromises } from '../lib/templatePromises';

export interface CreateTemplateDto {
  name: string;
  content: string;
  category?: string | null;
  tags?: string[];
  property_id?: number;
  is_global?: boolean;
  description?: string | null;
  status?: string | null;
}

export interface UpdateTemplateDto extends CreateTemplateDto {
  is_active?: boolean;
}

export interface TemplateSearchOptions {
  category?: string;
  search?: string;
  tags?: string[];
  property_id?: number;
  is_active?: boolean;
  status?: string;
  include_shared?: boolean;
  sort_by?: 'name' | 'usage_count' | 'created_at' | 'updated_at';
  sort_order?: 'ASC' | 'DESC';
}

export interface TemplateVersion {
  version: number;
  content: string;
  updated_at: Date;
  updated_by: string;
}

export interface TemplateApprovalDto {
  template_id: number;
  action: 'approve' | 'reject' | 'archive';
  comments?: string;
}

const MAX_CONTENT_LENGTH = 5000;
const MAX_TAGS = 25;
const MAX_TAG_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_NAME_LENGTH = 255;

export class TemplateService {
  private templateRepository = getRepository<Template>(Template);

  private readTemplateBody(body: CreateTemplateDto | UpdateTemplateDto): CreateTemplateDto {
    const typedBody = (body || {}) as unknown as Record<string, unknown>;
    const { name, category, content, tags, property_id, is_global, description, status } = typedBody;

    if (typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('name is required');
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`name must be at most ${MAX_NAME_LENGTH} characters`);
    }

    if (typeof content !== 'string' || !content.trim()) {
      throw new ValidationError('content is required');
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new ValidationError(`content must be at most ${MAX_CONTENT_LENGTH} characters`);
    }

    // No-promise rule (ADR-002): templates must not promise a follow-up or
    // guarantee request fulfillment. Agents may still send such wording by
    // typing it at send time; it just cannot be baked into a saved template.
    if (findTemplatePromises(content).hasPromise) {
      throw new ValidationError(
        'content must not promise a follow-up or guarantee request fulfillment; state the action taken instead (e.g. "I have shared this with our maintenance team")'
      );
    }

    if (category != null && (typeof category !== 'string' || category.length > MAX_CATEGORY_LENGTH)) {
      throw new ValidationError(`category must be a string of at most ${MAX_CATEGORY_LENGTH} characters`);
    }

    if (tags != null && !Array.isArray(tags)) {
      throw new ValidationError('tags must be an array');
    }

    if (Array.isArray(tags)) {
      if (tags.length > MAX_TAGS) {
        throw new ValidationError(`tags must contain at most ${MAX_TAGS} entries`);
      }
      if (tags.some((tag) => typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH)) {
        throw new ValidationError(`each tag must be a string of at most ${MAX_TAG_LENGTH} characters`);
      }
    }

    const baseData = {
      name: name.trim(),
      category: category ?? null,
      content,
      tags: tags || [],
      description: description ?? null,
      property_id: property_id ? Number(property_id) : undefined,
      is_global: is_global === true,
      status: status ?? null
    };
    
    // Include is_active if it's an UpdateTemplateDto
    return {
      ...baseData,
      is_active: 'is_active' in data ? Boolean(data.is_active) : undefined
    };
  }

  async getAll(userId: string, options?: { category?: string; search?: string }): Promise<Template[]> {
    const queryBuilder = this.templateRepository
      .createQueryBuilder('template')
      .where('template.user_id = :userId', { userId });

    if (options?.category) {
      queryBuilder.andWhere('template.category = :category', { category: options.category });
    }

    if (options?.search) {
      const search = `%${options.search}%`;
      queryBuilder.andWhere('(template.name ILIKE :search OR :search = ANY(template.tags))', { search });
    }

    queryBuilder.orderBy('template.name', 'ASC');

    return queryBuilder.getMany();
  }

  async getById(id: number, userId: string): Promise<Template> {
    const template = await this.templateRepository.findOne({
      where: { id, user_id: userId }
    });

    if (!template) {
      throw new NotFoundError('Template', id);
    }

    return template;
  }

  async create(data: CreateTemplateDto, userId: string): Promise<Template> {
    const templateData = this.readTemplateBody(data);

    const template = this.templateRepository.create({
      name: templateData.name,
      content: templateData.content,
      category: templateData.category,
      tags: templateData.tags,
      description: templateData.description,
      user_id: userId,
      property_id: templateData.property_id,
      is_global: templateData.is_global,
      status: templateData.status || 'approved',
      is_active: true,
      version: 1,
      created_by: userId
    });

    await this.templateRepository.save(template);

    return template;
  }

  async update(id: number, data: UpdateTemplateDto, userId: string): Promise<Template> {
    const template = await this.getById(id, userId);

    const templateData = this.readTemplateBody(data);

    template.name = templateData.name;
    template.content = templateData.content;
    template.category = templateData.category ?? null;
    template.tags = templateData.tags ?? null;
    template.description = templateData.description ?? template.description;

    if (templateData.property_id !== undefined) {
      template.property_id = templateData.property_id;
    }
    if (templateData.is_global !== undefined) {
      template.is_global = templateData.is_global;
    }
    if (templateData.status !== undefined) {
      template.status = templateData.status;
    }
    
    // Increment version if content changed
    if (template.content !== templateData.content) {
      template.version = (template.version || 1) + 1;
    }
    
    // Update active status if provided
    if ('is_active' in data && templateData.is_active !== undefined) {
      template.is_active = templateData.is_active;
    }

    await this.templateRepository.save(template);

    return template;
  }

  async delete(id: number, userId: string): Promise<void> {
    const template = await this.getById(id, userId);
    await this.templateRepository.remove(template);
  }

  /**
   * Enhanced search with advanced filtering options
   */
  async search(userId: string, options: TemplateSearchOptions = {}): Promise<Template[]> {
    const {
      category,
      search,
      tags,
      property_id,
      is_active = true,
      status,
      include_shared = false,
      sort_by = 'name',
      sort_order = 'ASC'
    } = options;

    const queryBuilder = this.templateRepository
      .createQueryBuilder('template')
      .where('template.user_id = :userId', { userId });

    // Filter by active status
    if (is_active !== undefined) {
      queryBuilder.andWhere('template.is_active = :is_active', { is_active });
    }

    // Filter by category
    if (category) {
      queryBuilder.andWhere('template.category = :category', { category });
    }

    // Filter by status
    if (status) {
      queryBuilder.andWhere('template.status = :status', { status });
    }

    // Filter by property
    if (property_id) {
      queryBuilder.andWhere('(template.property_id = :property_id OR template.is_global = true)', { property_id });
    } else if (include_shared) {
      // Include templates from other properties if user has access
      queryBuilder.orWhere('template.is_global = true');
    }

    // Search in name and content
    if (search) {
      const searchPattern = `%${search}%`;
      queryBuilder.andWhere('(template.name ILIKE :search OR template.content ILIKE :search OR template.description ILIKE :search)', { search: searchPattern });
    }

    // Filter by tags (all specified tags must match)
    if (tags && tags.length > 0) {
      for (const tag of tags) {
        queryBuilder.andWhere(':tag = ANY(template.tags)', { tag });
      }
    }

    // Sort
    if (sort_by && sort_order) {
      queryBuilder.orderBy(`template.${sort_by}`, sort_order);
    } else {
      queryBuilder.orderBy('template.name', 'ASC');
    }

    return queryBuilder.getMany();
  }

  /**
   * Get template statistics for analytics
   */
  async getStats(userId: string): Promise<{
    total: number;
    by_category: Record<string, number>;
    by_status: Record<string, number>;
    most_used: Array<{ template_id: number; name: string; usage_count: number }>;
  }> {
    const templates = await this.templateRepository.find({ where: { user_id: userId } });
    
    const by_category: Record<string, number> = {};
    const by_status: Record<string, number> = {};
    
    for (const template of templates) {
      // Count by category
      const category = template.category || 'uncategorized';
      by_category[category] = (by_category[category] || 0) + 1;
      
      // Count by status
      const status = template.status || 'draft';
      by_status[status] = (by_status[status] || 0) + 1;
    }

    // Get most used templates (sorted by usage_count descending)
    const most_used = templates
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .slice(0, 10)
      .map(t => ({
        template_id: t.id,
        name: t.name,
        usage_count: t.usage_count || 0
      }));

    return {
      total: templates.length,
      by_category,
      by_status,
      most_used
    };
  }

  /**
   * Get template version history (simulated since we don't have version table yet)
   */
  async getVersionHistory(templateId: number, userId: string): Promise<TemplateVersion[]> {
    const template = await this.getById(templateId, userId);
    
    // For now, return a simulated version history
    // In a production system, this would query a template_versions table
    return [
      {
        version: template.version || 1,
        content: template.content,
        updated_at: template.updated_at || template.created_at,
        updated_by: userId
      }
    ];
  }

  /**
   * Share template with another property
   */
  async shareWithProperty(templateId: number, targetPropertyId: number, userId: string): Promise<Template> {
    const template = await this.getById(templateId, userId);
    
    // Create a copy of the template for the target property
    const sharedTemplate = this.templateRepository.create({
      name: `${template.name} (Shared)`,
      content: template.content,
      category: template.category,
      tags: template.tags,
      description: template.description,
      user_id: userId,
      property_id: targetPropertyId,
      is_global: false,
      is_active: template.is_active,
      version: template.version,
      status: template.status
    });

    await this.templateRepository.save(sharedTemplate);
    return sharedTemplate;
  }

  /**
   * Submit template for approval
   */
  async submitForApproval(templateId: number, userId: string): Promise<Template> {
    const template = await this.getById(templateId, userId);
    
    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    template.status = 'pending_approval';
    await this.templateRepository.save(template);
    
    return template;
  }

  /**
   * Approve or reject a template
   */
  async approveTemplate(templateId: number, action: 'approve' | 'reject' | 'archive', approverId: string, comments?: string): Promise<Template> {
    const template = await this.templateRepository.findOne({ where: { id: templateId } });
    
    if (!template) {
      throw new NotFoundError('Template', templateId);
    }

    switch (action) {
      case 'approve':
        template.status = 'approved';
        template.approved_by = approverId;
        template.approved_at = new Date();
        template.is_active = true;
        break;
      case 'reject':
        template.status = 'rejected';
        template.is_active = false;
        break;
      case 'archive':
        template.status = 'archived';
        template.is_active = false;
        break;
    }

    // Store comments if provided
    if (comments) {
      template.description = template.description ? `${template.description}\n\n[${new Date().toISOString()}] ${approverId}: ${comments}` : comments;
    }

    await this.templateRepository.save(template);
    return template;
  }

  /**
   * Increment template usage count
   */
  async incrementUsageCount(templateId: number): Promise<void> {
    await this.templateRepository
      .createQueryBuilder()
      .update(Template)
      .set({ usage_count: () => 'usage_count + 1' })
      .where('id = :templateId', { templateId })
      .execute();
  }
}

export const templateService = new TemplateService();
