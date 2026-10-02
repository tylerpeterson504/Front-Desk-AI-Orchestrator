import { getRepository } from '../config/database';
import { Property } from '../entities/Property';
import { PropertyGroup } from '../entities/PropertyGroup';
import { AppError, NotFoundError, ValidationError } from '../lib/errors';
import { encryptSecret, decryptSecret } from '../lib/secretBox';
import { createRequestLogger } from '../lib/logger';

export interface CreatePropertyDto {
  name: string;
  display_name?: string;
  code?: string;
  group_id?: number;
  address?: string;
  city?: string;
  region?: string;
  timezone?: string;
  currency?: string;
  checkout_time?: string;
  checkin_time?: string;
  wifi_ssid?: string;
  wifi_password?: string;
  tone_guidelines?: string;
  description?: string;
  website_url?: string;
  phone_number?: string;
  email?: string;
  star_rating?: number;
  branding?: {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
    font_family?: string;
    custom_css?: string;
  };
  settings?: {
    default_tone?: string;
    auto_assign_escalations?: boolean;
    default_shift_duration?: number;
    enable_handover_checklist?: boolean;
    notification_settings?: {
      email?: boolean;
      sms?: boolean;
      push?: boolean;
    };
  };
  dashboard_widgets?: Array<{
    id: string;
    type: string;
    title: string;
    position: { row: number; col: number; sizeX: number; sizeY: number };
    config: Record<string, unknown>;
    is_visible: boolean;
  }>;
  social_media?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };
}

export interface UpdatePropertyDto extends CreatePropertyDto {}

export interface CreatePropertyGroupDto {
  name: string;
  description?: string;
  region?: string;
  settings?: {
    default_branding?: {
      logo_url?: string;
      primary_color?: string;
      secondary_color?: string;
    };
    default_settings?: {
      tone_guidelines?: string;
      checkout_time?: string;
      checkin_time?: string;
    };
  };
}

export interface UpdatePropertyGroupDto extends CreatePropertyGroupDto {}

export interface PropertyPerformanceMetrics {
  property_id: number;
  name: string;
  shift_count: number;
  escalation_count: number;
  avg_response_time_minutes: number | null;
  guest_satisfaction_score: number | null;
  task_completion_rate: number;
  handover_completion_rate: number;
}

export interface PropertyDashboardConfig {
  property_id: number;
  widgets: Array<{
    id: string;
    type: string;
    title: string;
    position: { row: number; col: number; sizeX: number; sizeY: number };
    config: Record<string, unknown>;
    is_visible: boolean;
  }>;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MAX_LENGTH = 255;

export class PropertyService {
  private propertyRepository = getRepository<Property>(Property);
  private propertyGroupRepository = getRepository<PropertyGroup>(PropertyGroup);

  // Property Group Methods

  async createPropertyGroup(data: CreatePropertyGroupDto, userId: string): Promise<PropertyGroup> {
    const name = this.requireString(data.name, 'name');
    const description = this.optionalString(data.description, 'description', 500);
    const region = this.optionalString(data.region, 'region', 20);

    const group = this.propertyGroupRepository.create({
      user_id: userId,
      name,
      description,
      region,
      settings: data.settings || null,
      is_active: true
    });

    await this.propertyGroupRepository.save(group);
    return group;
  }

  async getPropertyGroups(userId: string): Promise<PropertyGroup[]> {
    return this.propertyGroupRepository.find({
      where: { user_id: userId, is_active: true },
      order: { name: 'ASC' }
    });
  }

  async getPropertyGroupById(id: number, userId: string): Promise<PropertyGroup> {
    const group = await this.propertyGroupRepository.findOne({
      where: { id, user_id: userId }
    });

    if (!group) {
      throw new NotFoundError('PropertyGroup', id);
    }

    return group;
  }

  async updatePropertyGroup(id: number, data: UpdatePropertyGroupDto, userId: string): Promise<PropertyGroup> {
    const group = await this.getPropertyGroupById(id, userId);

    const name = data.name ? this.requireString(data.name, 'name') : group.name;
    const description = data.description ? this.optionalString(data.description, 'description', 500) : group.description;
    const region = data.region ? this.optionalString(data.region, 'region', 20) : group.region;

    group.name = name;
    group.description = description ?? group.description;
    group.region = region ?? group.region;
    group.settings = data.settings ?? group.settings;

    await this.propertyGroupRepository.save(group);
    return group;
  }

  async deletePropertyGroup(id: number, userId: string): Promise<void> {
    const group = await this.getPropertyGroupById(id, userId);
    
    // Check if there are properties in this group
    const properties = await this.propertyRepository.find({
      where: { group_id: id }
    });

    if (properties.length > 0) {
      throw new ValidationError('Cannot delete property group with existing properties. Move properties to another group first.');
    }

    await this.propertyGroupRepository.remove(group);
  }

  // Property Settings Inheritance
  async getEffectiveSettings(propertyId: number): Promise<{
    property: Property;
    inherited: {
      tone_guidelines?: string;
      checkout_time?: string;
      checkin_time?: string;
      branding?: Property['branding'];
    };
  }> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId },
      relations: ['group']
    });

    if (!property) {
      throw new NotFoundError('Property', propertyId);
    }

    const inherited: {
      tone_guidelines?: string;
      checkout_time?: string;
      checkin_time?: string;
      branding?: Property['branding'];
    } = {};

    // If property has a group, inherit settings from the group
    if (property.group && property.group.settings) {
      const groupSettings = property.group.settings;
      
      // Inherit branding if not set on property
      if (!property.branding && groupSettings.default_branding) {
        inherited.branding = groupSettings.default_branding as Property['branding'];
      }

      // Inherit default settings if not set on property
      if (!property.tone_guidelines && groupSettings.default_settings?.tone_guidelines) {
        inherited.tone_guidelines = groupSettings.default_settings.tone_guidelines;
      }
      if (!property.checkout_time && groupSettings.default_settings?.checkout_time) {
        inherited.checkout_time = groupSettings.default_settings.checkout_time;
      }
      if (!property.checkin_time && groupSettings.default_settings?.checkin_time) {
        inherited.checkin_time = groupSettings.default_settings.checkin_time;
      }
    }

    return {
      property,
      inherited
    };
  }

  // Property Performance Methods
  async getPerformanceMetrics(propertyId: number, userId: string): Promise<PropertyPerformanceMetrics> {
    // Verify property ownership
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, user_id: userId }
    });

    if (!property) {
      throw new NotFoundError('Property', propertyId);
    }

    // This would normally query the actual performance data from various services
    // For now, return a placeholder implementation
    return {
      property_id: property.id,
      name: property.name,
      shift_count: 0,
      escalation_count: 0,
      avg_response_time_minutes: null,
      guest_satisfaction_score: null,
      task_completion_rate: 0,
      handover_completion_rate: 0
    };
  }

  // Dashboard Widget Management
  async getDashboardConfig(propertyId: number, userId: string): Promise<PropertyDashboardConfig> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, user_id: userId }
    });

    if (!property) {
      throw new NotFoundError('Property', propertyId);
    }

    return {
      property_id: property.id,
      widgets: property.dashboard_widgets || []
    };
  }

  async updateDashboardWidgets(propertyId: number, widgets: PropertyDashboardConfig['widgets'], userId: string): Promise<PropertyDashboardConfig> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, user_id: userId }
    });

    if (!property) {
      throw new NotFoundError('Property', propertyId);
    }

    property.dashboard_widgets = widgets;
    await this.propertyRepository.save(property);

    return {
      property_id: property.id,
      widgets
    };
  }

  // Property Brading Customization
  async updateBranding(propertyId: number, branding: Property['branding'], userId: string): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, user_id: userId }
    });

    if (!property) {
      throw new NotFoundError('Property', propertyId);
    }

    property.branding = branding;
    await this.propertyRepository.save(property);

    return property;
  }

  // Active/Inactive Management
  async setActiveStatus(propertyId: number, isActive: boolean, userId: string): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id: propertyId, user_id: userId }
    });

    if (!property) {
      throw new NotFoundError('Property', propertyId);
    }

    property.is_active = isActive;
    await this.propertyRepository.save(property);

    return property;
  }

  private requireString(value: unknown, field: string, maxLength: number = MAX_LENGTH): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ValidationError(`${field} is required`);
    }
    if (value.length > maxLength) {
      throw new ValidationError(`${field} must be at most ${maxLength} characters`);
    }
    return value.trim();
  }

  private optionalString(value: unknown, field: string, maxLength: number = MAX_LENGTH): string | undefined {
    if (value == null || value === '') return undefined;
    if (typeof value !== 'string') {
      throw new ValidationError(`${field} must be a string`);
    }
    if (value.length > maxLength) {
      throw new ValidationError(`${field} must be at most ${maxLength} characters`);
    }
    return value;
  }

  private normalizeCheckoutTime(value: unknown, fallback: string = '11:00:00'): string {
    if (value == null || value === '') return fallback;
    if (typeof value !== 'string' || !TIME_PATTERN.test(value.trim())) {
      throw new ValidationError('checkout_time must be HH:MM or HH:MM:SS (24-hour)');
    }
    const trimmed = value.trim();
    return trimmed.length === 5 ? `${trimmed}:00` : trimmed;
  }

  private readPropertyBody(body: CreatePropertyDto | UpdatePropertyDto, checkoutFallback: string = '11:00:00'): CreatePropertyDto {
    const typedBody = body as unknown as Record<string, unknown>;
    
    const name = this.requireString(typedBody.name, 'name');
    const display_name = this.optionalString(typedBody.display_name, 'display_name', 100);
    const code = this.optionalString(typedBody.code, 'code', 10);
    const address = this.optionalString(typedBody.address, 'address');
    const city = this.optionalString(typedBody.city, 'city');
    const region = this.optionalString(typedBody.region, 'region', 20);
    const timezone = this.optionalString(typedBody.timezone, 'timezone', 10);
    const currency = this.optionalString(typedBody.currency, 'currency', 10);
    const checkout_time = this.normalizeCheckoutTime(typedBody.checkout_time, checkoutFallback);
    const checkin_time = this.normalizeCheckoutTime(typedBody.checkin_time, '14:00:00');
    const wifi_ssid = this.optionalString(typedBody.wifi_ssid, 'wifi_ssid');
    const tone_guidelines = this.optionalString(typedBody.tone_guidelines, 'tone_guidelines', 10000);
    const description = this.optionalString(typedBody.description, 'description', 500);
    const website_url = this.optionalString(typedBody.website_url, 'website_url', 100);
    const phone_number = this.optionalString(typedBody.phone_number, 'phone_number', 50);
    const email = this.optionalString(typedBody.email, 'email', 100);

    // Wi-Fi password is handled separately for encryption
    let wifi_password: string | undefined;
    if (typedBody.wifi_password != null && typedBody.wifi_password !== '') {
      if (typeof typedBody.wifi_password !== 'string') {
        throw new ValidationError('wifi_password must be a string');
      }
      wifi_password = typedBody.wifi_password as string;
    }

    // Validate star rating if provided
    let star_rating: number | undefined;
    if (typedBody.star_rating !== undefined) {
      if (typeof typedBody.star_rating !== 'number' || typedBody.star_rating < 1 || typedBody.star_rating > 5) {
        throw new ValidationError('star_rating must be a number between 1 and 5');
      }
      star_rating = typedBody.star_rating as number;
    }

    return {
      name,
      display_name,
      code,
      group_id: typedBody.group_id as number | undefined,
      address,
      city,
      region,
      timezone,
      currency,
      checkout_time,
      checkin_time,
      wifi_ssid,
      wifi_password,
      tone_guidelines,
      description,
      website_url,
      phone_number,
      email,
      star_rating,
      branding: typedBody.branding as CreatePropertyDto['branding'],
      settings: typedBody.settings as CreatePropertyDto['settings'],
      dashboard_widgets: typedBody.dashboard_widgets as CreatePropertyDto['dashboard_widgets'],
      social_media: typedBody.social_media as CreatePropertyDto['social_media']
    };
  }

  async create(data: CreatePropertyDto, userId: string, requestId?: string): Promise<Property> {
    const log = createRequestLogger(requestId || '');

    const propertyData = this.readPropertyBody(data);

    // Validate property group if provided
    if (propertyData.group_id) {
      const group = await this.propertyGroupRepository.findOne({
        where: { id: propertyData.group_id, user_id: userId }
      });
      if (!group) {
        throw new ValidationError('Property group not found or access denied');
      }
    }

    // Encrypt Wi-Fi password if provided
    let encryptedWifiPassword: string | undefined;
    if (propertyData.wifi_password) {
      encryptedWifiPassword = encryptSecret(propertyData.wifi_password);
    }

    const property = this.propertyRepository.create({
      user_id: userId,
      name: propertyData.name,
      display_name: propertyData.display_name || null,
      code: propertyData.code || null,
      group_id: propertyData.group_id || null,
      address: propertyData.address || null,
      city: propertyData.city || null,
      region: propertyData.region || null,
      timezone: propertyData.timezone || null,
      currency: propertyData.currency || null,
      checkout_time: propertyData.checkout_time,
      checkin_time: propertyData.checkin_time,
      wifi_ssid: propertyData.wifi_ssid || null,
      wifi_password: encryptedWifiPassword || null,
      tone_guidelines: propertyData.tone_guidelines || null,
      description: propertyData.description || null,
      website_url: propertyData.website_url || null,
      phone_number: propertyData.phone_number || null,
      email: propertyData.email || null,
      star_rating: propertyData.star_rating || null,
      branding: propertyData.branding || null,
      settings: propertyData.settings || null,
      dashboard_widgets: propertyData.dashboard_widgets || null,
      social_media: propertyData.social_media || null,
      is_active: true
    });

    await this.propertyRepository.save(property);

    log.info('Property created', { property_id: property.id, user_id: userId });

    return property;
  }

  async getAll(userId: string): Promise<Property[]> {
    return this.propertyRepository.find({
      where: { user_id: userId },
      select: ['id', 'name', 'display_name', 'code', 'address', 'city', 'region', 'checkout_time', 'checkin_time', 'wifi_ssid', 'tone_guidelines', 'created_at', 'updated_at', 'is_active', 'star_rating'],
      order: { name: 'ASC' }
    });
  }

  async getById(id: number, userId: string): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id, user_id: userId },
      select: ['id', 'user_id', 'name', 'display_name', 'code', 'group_id', 'address', 'city', 'region', 'timezone', 'currency', 'checkout_time', 'checkin_time', 'wifi_ssid', 'tone_guidelines', 'description', 'website_url', 'phone_number', 'email', 'star_rating', 'branding', 'settings', 'dashboard_widgets', 'social_media', 'created_at', 'updated_at', 'is_active']
    });

    if (!property) {
      throw new NotFoundError('Property', id);
    }

    return property;
  }

  async update(id: number, data: UpdatePropertyDto, userId: string): Promise<Property> {
    const property = await this.getById(id);

    // Verify ownership
    if (property.user_id !== userId) {
      throw new AuthorizationError('Property not found or access denied');
    }

    const propertyData = this.readPropertyBody(data, property.checkout_time ?? '11:00:00');

    // Validate property group if provided
    if (propertyData.group_id !== undefined) {
      if (propertyData.group_id) {
        const group = await this.propertyGroupRepository.findOne({
          where: { id: propertyData.group_id, user_id: userId }
        });
        if (!group) {
          throw new ValidationError('Property group not found or access denied');
        }
      }
      property.group_id = propertyData.group_id || null;
    }

    // Encrypt Wi-Fi password if provided
    let encryptedWifiPassword: string | undefined;
    if (propertyData.wifi_password) {
      encryptedWifiPassword = encryptSecret(propertyData.wifi_password);
    } else if (data.wifi_password === '') {
      encryptedWifiPassword = undefined;
    }

    property.name = propertyData.name;
    property.display_name = propertyData.display_name ?? property.display_name;
    property.code = propertyData.code ?? property.code;
    property.address = propertyData.address ?? property.address;
    property.city = propertyData.city ?? property.city;
    property.region = propertyData.region ?? property.region;
    property.timezone = propertyData.timezone ?? property.timezone;
    property.currency = propertyData.currency ?? property.currency;
    property.checkout_time = propertyData.checkout_time;
    property.checkin_time = propertyData.checkin_time ?? property.checkin_time;
    property.wifi_ssid = propertyData.wifi_ssid ?? property.wifi_ssid;
    property.tone_guidelines = propertyData.tone_guidelines ?? property.tone_guidelines;
    property.description = propertyData.description ?? property.description;
    property.website_url = propertyData.website_url ?? property.website_url;
    property.phone_number = propertyData.phone_number ?? property.phone_number;
    property.email = propertyData.email ?? property.email;
    property.star_rating = propertyData.star_rating ?? property.star_rating;
    property.branding = propertyData.branding ?? property.branding;
    property.settings = propertyData.settings ?? property.settings;
    property.dashboard_widgets = propertyData.dashboard_widgets ?? property.dashboard_widgets;
    property.social_media = propertyData.social_media ?? property.social_media;

    if (encryptedWifiPassword !== undefined) {
      property.wifi_password = encryptedWifiPassword;
    }

    await this.propertyRepository.save(property);

    return property;
  }

  async delete(id: number, userId: string): Promise<void> {
    const property = await this.getById(id, userId);
    
    // Verify ownership
    if (property.user_id !== userId) {
      throw new AuthorizationError('Property not found or access denied');
    }
    
    await this.propertyRepository.remove(property);
  }

  async getWifiPassword(id: number, requestId?: string): Promise<{ ssid: string | null; password: string | null }> {
    const log = createRequestLogger(requestId || '');

    const property = await this.propertyRepository.findOne({
      where: { id },
      select: ['wifi_ssid', 'wifi_password']
    });

    if (!property) {
      throw new NotFoundError('Property', id);
    }

    let password: string | null = null;
    if (property.wifi_password) {
      password = decryptSecret(property.wifi_password);
    }

    log.info('WiFi password retrieved', { property_id: id });

    return {

      ssid: property.wifi_ssid,
      password
    };
  }
}

export const propertyService = new PropertyService();
