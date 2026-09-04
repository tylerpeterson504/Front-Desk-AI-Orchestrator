import { getRepository } from '../config/database';
import { Property } from '../entities/Property';
import { AppError, NotFoundError, ValidationError } from '../lib/errors';
import { encryptSecret, decryptSecret } from '../lib/secretBox';
import { createRequestLogger } from '../lib/logger';

export interface CreatePropertyDto {
  name: string;
  address?: string;
  checkout_time?: string;
  wifi_ssid?: string;
  wifi_password?: string;
  tone_guidelines?: string;
}

export interface UpdatePropertyDto extends CreatePropertyDto {}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const MAX_LENGTH = 255;

export class PropertyService {
  private propertyRepository = getRepository<Property>(Property);

  private requireString(value: unknown, field: string, maxLength: number = MAX_LENGTH): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ValidationError(`${field} is required`);
    }
    if (value.length > maxLength) {
      throw new ValidationError(`${field} must be at most ${maxLength} characters`);
    }
    return value.trim();
  }

  private optionalString(
    value: unknown,
    field: string,
    maxLength: number = MAX_LENGTH
  ): string | null {
    if (value == null || value === '') return null;
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

  private readPropertyBody(
    body: Record<string, unknown>,
    checkoutFallback: string = '11:00:00'
  ): CreatePropertyDto {
    const name = this.requireString(body.name, 'name');
    const address = this.optionalString(body.address, 'address');
    const checkout_time = this.normalizeCheckoutTime(body.checkout_time, checkoutFallback);
    const wifi_ssid = this.optionalString(body.wifi_ssid, 'wifi_ssid');
    const tone_guidelines = this.optionalString(body.tone_guidelines, 'tone_guidelines', 10000);

    // Wi-Fi password is handled separately for encryption
    let wifi_password: string | undefined;
    if (body.wifi_password != null && body.wifi_password !== '') {
      if (typeof body.wifi_password !== 'string') {
        throw new ValidationError('wifi_password must be a string');
      }
      wifi_password = body.wifi_password;
    }

    return {
      name,
      address,
      checkout_time,
      wifi_ssid,
      wifi_password,
      tone_guidelines,
    };
  }

  async create(data: CreatePropertyDto, requestId?: string): Promise<Property> {
    const log = createRequestLogger(requestId || '');

    const propertyData = this.readPropertyBody(data);

    // Encrypt Wi-Fi password if provided
    let encryptedWifiPassword: string | undefined;
    if (propertyData.wifi_password) {
      encryptedWifiPassword = encryptSecret(propertyData.wifi_password);
    }

    const property = this.propertyRepository.create({
      name: propertyData.name,
      address: propertyData.address,
      checkout_time: propertyData.checkout_time,
      wifi_ssid: propertyData.wifi_ssid,
      wifi_password: encryptedWifiPassword,
      tone_guidelines: propertyData.tone_guidelines,
    });

    await this.propertyRepository.save(property);

    log.info('Property created', { property_id: property.id });

    return property;
  }

  async getAll(): Promise<Property[]> {
    return this.propertyRepository.find({
      select: [
        'id',
        'name',
        'address',
        'checkout_time',
        'wifi_ssid',
        'tone_guidelines',
        'created_at',
        'updated_at',
      ],
    });
  }

  async getById(id: number): Promise<Property> {
    const property = await this.propertyRepository.findOne({
      where: { id },
      select: [
        'id',
        'name',
        'address',
        'checkout_time',
        'wifi_ssid',
        'tone_guidelines',
        'created_at',
        'updated_at',
      ],
    });

    if (!property) {
      throw new NotFoundError('Property', id);
    }

    return property;
  }

  async update(id: number, data: UpdatePropertyDto): Promise<Property> {
    const property = await this.getById(id);

    const propertyData = this.readPropertyBody(data, property.checkout_time);

    // Encrypt Wi-Fi password if provided
    let encryptedWifiPassword: string | undefined;
    if (propertyData.wifi_password) {
      encryptedWifiPassword = encryptSecret(propertyData.wifi_password);
    } else if (data.wifi_password === '') {
      encryptedWifiPassword = undefined;
    }

    property.name = propertyData.name;
    property.address = propertyData.address;
    property.checkout_time = propertyData.checkout_time;
    property.wifi_ssid = propertyData.wifi_ssid;
    property.tone_guidelines = propertyData.tone_guidelines;

    if (encryptedWifiPassword !== undefined) {
      property.wifi_password = encryptedWifiPassword;
    }

    await this.propertyRepository.save(property);

    return property;
  }

  async delete(id: number): Promise<void> {
    const property = await this.getById(id);
    await this.propertyRepository.remove(property);
  }

  async getWifiPassword(
    id: number,
    requestId?: string
  ): Promise<{ ssid: string | null; password: string | null }> {
    const log = createRequestLogger(requestId || '');

    const property = await this.propertyRepository.findOne({
      where: { id },
      select: ['wifi_ssid', 'wifi_password'],
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
      password,
    };
  }
}

export const propertyService = new PropertyService();
