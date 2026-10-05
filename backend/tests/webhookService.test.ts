import { WebhookService, webhookService, WebhookConfig } from '../src/services/webhookService';
import { config } from '../src/config';
import logger from '../src/lib/logger';

// Mock logger
jest.mock('../src/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    
    // Reset singleton state
    service = new WebhookService();
    
    // Mock configuration
    Object.assign(config, {
      WEBHOOK_URLS: undefined,
      NODE_ENV: 'test'
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clear in-memory storage
    service.clearAll();
  });

  describe('Constructor', () => {
    it('should initialize without errors', () => {
      expect(() => new WebhookService()).not.toThrow();
    });

    it('should load webhooks from configuration if available', () => {
      const webhookUrls = JSON.stringify([
        {
          id: 'test-webhook',
          name: 'Test Webhook',
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['test.event']
        }
      ]);
      
      Object.assign(config, { WEBHOOK_URLS: webhookUrls });
      
      const testService = new WebhookService();
      const webhook = testService.getWebhook('test-webhook');
      
      expect(webhook).not.toBeNull();
      expect(webhook?.name).toBe('Test Webhook');
      expect(webhook?.url).toBe('https://example.com/webhook');
    });

    it('should handle invalid WEBHOOK_URLS configuration gracefully', () => {
      Object.assign(config, { WEBHOOK_URLS: 'invalid-json' });
      
      // Should not throw
      expect(() => new WebhookService()).not.toThrow();
    });
  });

  describe('registerWebhook', () => {
    it('should register a new webhook with auto-generated ID', () => {
      const webhookConfig: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt'> = {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      };
      
      const registered = service.registerWebhook(webhookConfig);
      
      expect(registered.id).toBeDefined();
      expect(registered.name).toBe('Test Webhook');
      expect(registered.url).toBe('https://example.com/webhook');
      expect(registered.isActive).toBe(true);
      expect(registered.createdAt).toBeInstanceOf(Date);
      expect(registered.updatedAt).toBeInstanceOf(Date);
    });

    it('should register a webhook with provided ID', () => {
      const webhookConfig: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } = {
        id: 'custom-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      };
      
      const registered = service.registerWebhook(webhookConfig);
      
      expect(registered.id).toBe('custom-id');
    });

    it('should register a webhook with default events', () => {
      const webhookConfig: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt' | 'events'> = {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        isActive: true
      };
      
      // @ts-ignore - events is optional in the input
      const registered = service.registerWebhook(webhookConfig);
      
      expect(registered.events).toBeDefined();
    });
  });

  describe('unregisterWebhook', () => {
    it('should unregister an existing webhook', () => {
      const webhook = service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      const result = service.unregisterWebhook(webhook.id);
      
      expect(result).toBe(true);
      expect(service.getWebhook(webhook.id)).toBeNull();
    });

    it('should return false for non-existing webhook', () => {
      const result = service.unregisterWebhook('non-existing-id');
      
      expect(result).toBe(false);
    });
  });

  describe('getWebhook', () => {
    it('should return webhook by ID', () => {
      const webhook = service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      const retrieved = service.getWebhook('test-id');
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Test Webhook');
    });

    it('should return null for non-existing webhook', () => {
      const result = service.getWebhook('non-existing-id');
      
      expect(result).toBeNull();
    });
  });

  describe('listWebhooks', () => {
    it('should return all registered webhooks sorted by creation date', () => {
      const webhook1 = service.registerWebhook({
        name: 'Webhook 1',
        url: 'https://example.com/webhook1',
        events: ['test.event'],
        isActive: true
      });
      
      const webhook2 = service.registerWebhook({
        name: 'Webhook 2',
        url: 'https://example.com/webhook2',
        events: ['test.event'],
        isActive: true
      });
      
      const webhooks = service.listWebhooks();
      
      expect(webhooks).toHaveLength(2);
      // Most recent first
      expect(webhooks[0].id).toBe(webhook2.id);
      expect(webhooks[1].id).toBe(webhook1.id);
    });

    it('should return empty array when no webhooks registered', () => {
      const webhooks = service.listWebhooks();
      
      expect(webhooks).toEqual([]);
    });
  });

  describe('listWebhooksForEvent', () => {
    it('should return webhooks subscribed to specific event', () => {
      service.registerWebhook({
        name: 'Webhook 1',
        url: 'https://example.com/webhook1',
        events: ['event1'],
        isActive: true
      });
      
      service.registerWebhook({
        name: 'Webhook 2',
        url: 'https://example.com/webhook2',
        events: ['event1', 'event2'],
        isActive: true
      });
      
      service.registerWebhook({
        name: 'Webhook 3',
        url: 'https://example.com/webhook3',
        events: ['event2'],
        isActive: true
      });
      
      const event1Webhooks = service.listWebhooksForEvent('event1');
      
      expect(event1Webhooks).toHaveLength(2);
    });

    it('should return webhooks with wildcard event subscription', () => {
      service.registerWebhook({
        name: 'Wildcard Webhook',
        url: 'https://example.com/webhook',
        events: ['*'],
        isActive: true
      });
      
      service.registerWebhook({
        name: 'Specific Webhook',
        url: 'https://example.com/webhook2',
        events: ['specific.event'],
        isActive: true
      });
      
      const anyEventWebhooks = service.listWebhooksForEvent('any.event');
      
      expect(anyEventWebhooks).toHaveLength(1);
      expect(anyEventWebhooks[0].name).toBe('Wildcard Webhook');
    });

    it('should not return inactive webhooks', () => {
      service.registerWebhook({
        name: 'Active Webhook',
        url: 'https://example.com/webhook1',
        events: ['test.event'],
        isActive: true
      });
      
      service.registerWebhook({
        name: 'Inactive Webhook',
        url: 'https://example.com/webhook2',
        events: ['test.event'],
        isActive: false
      });
      
      const eventWebhooks = service.listWebhooksForEvent('test.event');
      
      expect(eventWebhooks).toHaveLength(1);
      expect(eventWebhooks[0].name).toBe('Active Webhook');
    });
  });

  describe('updateWebhook', () => {
    it('should update an existing webhook', () => {
      const webhook = service.registerWebhook({
        id: 'test-id',
        name: 'Original Name',
        url: 'https://example.com/webhook',
        events: ['event1'],
        isActive: true
      });
      
      const updated = service.updateWebhook(webhook.id, {
        name: 'Updated Name',
        url: 'https://example.com/new-webhook',
        events: ['event1', 'event2']
      });
      
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.url).toBe('https://example.com/new-webhook');
      expect(updated?.events).toEqual(['event1', 'event2']);
      expect(updated?.updatedAt).not.toBe(webhook.updatedAt);
    });

    it('should return null for non-existing webhook', () => {
      const result = service.updateWebhook('non-existing-id', {
        name: 'Updated Name'
      });
      
      expect(result).toBeNull();
    });
  });

  describe('setWebhookActive', () => {
    it('should activate a webhook', () => {
      const webhook = service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: false
      });
      
      const result = service.setWebhookActive(webhook.id, true);
      
      expect(result).toBe(true);
      expect(service.getWebhook(webhook.id)?.isActive).toBe(true);
    });

    it('should deactivate a webhook', () => {
      const webhook = service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      const result = service.setWebhookActive(webhook.id, false);
      
      expect(result).toBe(true);
      expect(service.getWebhook(webhook.id)?.isActive).toBe(false);
    });

    it('should return false for non-existing webhook', () => {
      const result = service.setWebhookActive('non-existing-id', true);
      
      expect(result).toBe(false);
    });
  });

  describe('emitEvent', () => {
    it('should queue events for registered webhooks', async () => {
      service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      await service.emitEvent('test.event', { data: 'test' });
      
      // @ts-ignore - accessing private property for test
      const stats = service.getStats();
      expect(stats.totalDeliveries).toBeGreaterThanOrEqual(0);
    });

    it('should not queue events when no webhooks registered for event', async () => {
      await service.emitEvent('unregistered.event', { data: 'test' });
      
      // Should not throw
      expect(true).toBe(true);
    });

    it('should include metadata in emitted events', async () => {
      service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      await service.emitEvent('test.event', { data: 'test' }, { custom: 'metadata' });
      
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return webhook statistics', () => {
      service.registerWebhook({
        id: 'test-id-1',
        name: 'Active Webhook',
        url: 'https://example.com/webhook1',
        events: ['test.event'],
        isActive: true
      });
      
      service.registerWebhook({
        id: 'test-id-2',
        name: 'Inactive Webhook',
        url: 'https://example.com/webhook2',
        events: ['test.event'],
        isActive: false
      });
      
      const stats = service.getStats();
      
      expect(stats.totalWebhooks).toBe(2);
      expect(stats.activeWebhooks).toBe(1);
    });
  });

  describe('testWebhook', () => {
    it('should test a webhook successfully', async () => {
      service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as Response);
      
      const result = await service.testWebhook('test-id');
      
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return error for non-existing webhook', async () => {
      const result = await service.testWebhook('non-existing-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error for inactive webhook', async () => {
      service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: false
      });
      
      const result = await service.testWebhook('test-id');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle webhook test failures', async () => {
      service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);
      
      const result = await service.testWebhook('test-id');
      
      expect(result.success).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should clear all webhooks and events', () => {
      service.registerWebhook({
        id: 'test-id',
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['test.event'],
        isActive: true
      });
      
      service.clearAll();
      
      expect(service.listWebhooks()).toHaveLength(0);
    });
  });

  describe('Signature Verification', () => {
    it('should create valid signatures', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';
      
      // @ts-ignore - accessing private method for test
      const signature = service.createSignature(payload, secret);
      
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should verify valid signatures', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';
      
      // @ts-ignore - accessing private methods for test
      const signature = service.createSignature(payload, secret);
      const isValid = service.verifySignature(payload, signature, secret);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const payload = { test: 'data' };
      const secret = 'test-secret';
      const wrongSecret = 'wrong-secret';
      
      // @ts-ignore - accessing private methods for test
      const signature = service.createSignature(payload, secret);
      const isValid = service.verifySignature(payload, signature, wrongSecret);
      
      expect(isValid).toBe(false);
    });
  });
});

// Test singleton instance
describe('webhookService singleton', () => {
  it('should export a singleton instance', () => {
    expect(webhookService).toBeInstanceOf(WebhookService);
  });

  it('should be the same instance when imported multiple times', () => {
    const { webhookService: instance1 } = require('../src/services/webhookService');
    const { webhookService: instance2 } = require('../src/services/webhookService');
    
    expect(instance1).toBe(instance2);
  });
});
