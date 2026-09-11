import { getRepository } from '../config/database';
import { Template } from '../entities/Template';
import { User } from '../entities/User';
import { AppError, NotFoundError, ValidationError } from '../lib/errors';
import { createRequestLogger } from '../lib/logger';

export interface CreateTemplateDto {
  name: string;
  content: string;
  category?: string | null;
  tags?: string[];
  property_id?: number;
  is_global?: boolean;
}

export interface UpdateTemplateDto extends CreateTemplateDto {}

const MAX_CONTENT_LENGTH = 5000;
const MAX_TAGS = 25;
const MAX_TAG_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_NAME_LENGTH = 255;

export class TemplateService {
  private templateRepository = getRepository<Template>(Template);

  private readTemplateBody(body: Record<string, unknown>): CreateTemplateDto {
    const { name, category, content, tags, property_id, is_global } = body || {};

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

    return {
      name: name.trim(),
      category: category ?? null,
      content,
      tags: tags || [],
      property_id: property_id ? Number(property_id) : undefined,
      is_global: is_global ?? false
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
      user_id: userId,
      property_id: templateData.property_id,
      is_global: templateData.is_global
    });

    await this.templateRepository.save(template);

    return template;
  }

  async update(id: number, data: UpdateTemplateDto, userId: string): Promise<Template> {
    const template = await this.getById(id, userId);

    const templateData = this.readTemplateBody(data);

    template.name = templateData.name;
    template.content = templateData.content;
    template.category = templateData.category;
    template.tags = templateData.tags;

    if (templateData.property_id !== undefined) {
      template.property_id = templateData.property_id;
    }
    if (templateData.is_global !== undefined) {
      template.is_global = templateData.is_global;
    }

    await this.templateRepository.save(template);

    return template;
  }

  async delete(id: number, userId: string): Promise<void> {
    const template = await this.getById(id, userId);
    await this.templateRepository.remove(template);
  }
}

export const templateService = new TemplateService();
