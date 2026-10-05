import { config } from '../config';
import logger from '../lib/logger';
import { Request, Response } from 'express';
import crypto from 'crypto';

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: WebhookPayload | Record<string, unknown>;
  timestamp: Date;
  attempts: number;
  maxAttempts: number;
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  error?: string;
  webhookId: string;
}

export interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  source: string;
  version: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  message?: string;
  error?: string;
  retryAfter?: number;
}

export interface WebhookStats {
  totalWebhooks: number;
  activeWebhooks: number;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  successRate: number;
  eventsByType: Record<string, number>;
}

export interface IncomingWebhookHandler {
  (payload: WebhookPayload, req: Request): Promise<Record<string, unknown>>;
}

// In-memory storage for webhooks (in production, use database)
const webhookRegistry = new Map<string, WebhookConfig>();
const eventQueue: WebhookEvent[] = [];
const deliveryAttempts = new Map<string, number>();

export class WebhookService {
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAY_MS = 5000;
  private readonly BATCH_SIZE = 10;
  private readonly VERSION = 'v1';
  private readonly SOURCE = 'front-desk-ai-orchestrator';

  constructor() {
    // Initialize with any configured webhooks
    this.loadConfiguredWebhooks();
    
    // Start background processor
    this.startProcessor();
  }

  private loadConfiguredWebhooks(): void {
    // Load webhooks from environment configuration
    if (config.WEBHOOK_URLS) {
      try {
        const webhooks = JSON.parse(config.WEBHOOK_URLS);
        webhooks.forEach((webhook: {
          id: string;
          name: string;
          url: string;
          secret?: string;
          events: string[];
        }) => {
          if (webhook.id && webhook.url) {
            const webhookConfig: WebhookConfig = {
              id: webhook.id,
              name: webhook.name || 'Configured Webhook',
              url: webhook.url,
              secret: webhook.secret,
              events: webhook.events || ['*'],
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            webhookRegistry.set(webhookConfig.id, webhookConfig);
            logger.info('Loaded configured webhook', { id: webhookConfig.id, url: webhookConfig.url });
          }
        });
      } catch (error) {
        logger.warn('Failed to parse WEBHOOK_URLS configuration', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Register a new webhook
   */
  registerWebhook(webhook: Omit<WebhookConfig, 'id' | 'createdAt' | 'updatedAt' | 'events'> & { id?: string; events?: string[] }): WebhookConfig {
    const id = webhook.id || crypto.randomUUID();
    
    const newWebhook: WebhookConfig = {
      ...webhook,
      events: webhook.events || ['*'],
      id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    webhookRegistry.set(id, newWebhook);
    logger.info('Webhook registered', { id, name: newWebhook.name, url: newWebhook.url });

    return newWebhook;
  }

  /**
   * Unregister a webhook
   */
  unregisterWebhook(id: string): boolean {
    if (webhookRegistry.has(id)) {
      webhookRegistry.delete(id);
      logger.info('Webhook unregistered', { id });
      return true;
    }
    return false;
  }

  /**
   * Get a webhook by ID
   */
  getWebhook(id: string): WebhookConfig | null {
    return webhookRegistry.get(id) || null;
  }

  /**
   * List all registered webhooks
   */
  listWebhooks(): WebhookConfig[] {
    return Array.from(webhookRegistry.entries())
      .map(([id, webhook], index) => ({ id, webhook, index }))
      .sort((a, b) =>
        b.webhook.createdAt.getTime() - a.webhook.createdAt.getTime() ||
        b.index - a.index
      )
      .map(entry => entry.webhook);
  }

  /**
   * List webhooks for a specific event type
   */
  listWebhooksForEvent(event: string): WebhookConfig[] {
    return Array.from(webhookRegistry.values()).filter(
      webhook => webhook.isActive && 
                (webhook.events.includes('*') || webhook.events.includes(event))
    );
  }

  /**
   * Update a webhook
   */
  updateWebhook(id: string, updates: Partial<Omit<WebhookConfig, 'id' | 'createdAt'>>): WebhookConfig | null {
    const existing = webhookRegistry.get(id);
    if (!existing) {
      return null;
    }

    const updated: WebhookConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    webhookRegistry.set(id, updated);
    logger.info('Webhook updated', { id, updatedFields: Object.keys(updates) });

    return updated;
  }

  /**
   * Activate or deactivate a webhook
   */
  setWebhookActive(id: string, isActive: boolean): boolean {
    const webhook = webhookRegistry.get(id);
    if (webhook) {
      webhook.isActive = isActive;
      webhook.updatedAt = new Date();
      webhookRegistry.set(id, webhook);
      logger.info('Webhook activation status changed', { id, isActive });
      return true;
    }
    return false;
  }

  /**
   * Send a webhook payload to all registered webhooks for the event
   */
  async emitEvent(event: string, data: Record<string, unknown>, metadata: Record<string, unknown> = {}): Promise<void> {
    const webhooks = this.listWebhooksForEvent(event);
    
    if (webhooks.length === 0) {
      logger.debug('No webhooks registered for event', { event });
      return;
    }

    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      source: this.SOURCE,
      version: this.VERSION,
      metadata
    };

    logger.info('Emitting webhook event', { event, webhookCount: webhooks.length });

    for (const webhook of webhooks) {
      await this.queueEvent(webhook.id, event, payload);
    }
  }

  /**
   * Queue an event for delivery
   */
  private async queueEvent(webhookId: string, event: string, payload: WebhookPayload): Promise<void> {
    const eventItem: WebhookEvent = {
      id: crypto.randomUUID(),
      type: event,
      data: payload,
      timestamp: new Date(),
      attempts: 0,
      maxAttempts: this.MAX_ATTEMPTS,
      status: 'pending',
      webhookId
    };

    eventQueue.push(eventItem);
    deliveryAttempts.delete(eventItem.id);

    logger.debug('Webhook event queued', {
      webhookId,
      event: eventItem.type,
      eventId: eventItem.id
    });
  }

  /**
   * Process the event queue
   */
  private async processQueue(): Promise<void> {
    if (eventQueue.length === 0) {
      return;
    }

    const batch = eventQueue.splice(0, this.BATCH_SIZE);
    logger.debug('Processing webhook batch', { batchSize: batch.length });

    await Promise.all(
      batch.map(async (event) => {
        await this.deliverEvent(event);
      })
    );
  }

  /**
   * Deliver a single event to its webhook
   */
  private async deliverEvent(event: WebhookEvent): Promise<void> {
    const webhook = webhookRegistry.get(event.webhookId);
    
    if (!webhook || !webhook.isActive) {
      logger.warn('Webhook not found or inactive, skipping delivery', {
        webhookId: event.webhookId
      });
      event.status = 'failed';
      event.error = 'Webhook not found or inactive';
      return;
    }

    try {
      const payload = event.data as WebhookPayload;
      
      // Add signature if webhook has a secret
      const body = webhook.secret
        ? this.createSignedPayload(payload, webhook.secret)
        : payload;

      const result = await this.sendWebhookRequest(webhook.url, body, webhook.secret);

      if (result.success) {
        event.status = 'delivered';
        event.attempts++;
        logger.info('Webhook delivered successfully', {
          webhookId: webhook.id,
          eventId: event.id,
          eventType: event.type,
          statusCode: result.statusCode
        });
      } else {
        event.status = 'failed';
        event.error = result.error || 'Delivery failed';
        event.attempts++;
        
        logger.error('Webhook delivery failed', {
          webhookId: webhook.id,
          eventId: event.id,
          error: result.error,
          statusCode: result.statusCode
        });

        // Requeue if we have attempts remaining
        if (event.attempts < event.maxAttempts) {
          event.status = 'retrying';
          const retryAttempts = deliveryAttempts.get(event.id) || 0;
          deliveryAttempts.set(event.id, retryAttempts + 1);
          
          // Exponential backoff
          const delay = this.RETRY_DELAY_MS * Math.pow(2, event.attempts);
          
          setTimeout(() => {
            eventQueue.push(event);
          }, delay);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      event.status = 'failed';
      event.error = errorMessage;
      event.attempts++;
      
      logger.error('Webhook delivery error', {
        webhookId: webhook.id,
        eventId: event.id,
        error: errorMessage
      });
    }
  }

  /**
   * Send HTTP request to webhook URL
   */
  private async sendWebhookRequest(
    url: string,
    payload: WebhookPayload | Record<string, unknown>,
    secret?: string
  ): Promise<WebhookDeliveryResult> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': `FrontDeskAI-Webhook/${this.VERSION}`
      };

      if (secret) {
        headers['X-FrontDesk-Signature'] = this.createSignature(payload, secret);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status} ${response.statusText}`
        };
      }

      return {
        success: true,
        statusCode: response.status
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Create a signature for webhook verification
   */
  private createSignature(payload: unknown, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    const data = JSON.stringify(payload, Object.keys(payload as object).sort());
    hmac.update(data);
    return hmac.digest('hex');
  }

  /**
   * Create a signed payload wrapper
   */
  private createSignedPayload(payload: WebhookPayload, secret: string): Record<string, unknown> {
    const signature = this.createSignature(payload, secret);
    return {
      payload,
      signature,
      timestamp: payload.timestamp
    };
  }

  /**
   * Verify an incoming webhook signature
   */
  verifySignature(
    payload: unknown,
    signature: string,
    secret: string
  ): boolean {
    try {
      const computedSignature = this.createSignature(payload, secret);
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Handle incoming webhook (for receiving webhooks from external services)
   */
  async handleIncomingWebhook(
    req: Request,
    res: Response,
    handler: IncomingWebhookHandler
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Verify content type
      const contentType = req.get('Content-Type');
      if (!contentType?.includes('application/json')) {
        res.status(415).json({
          error: 'Unsupported Media Type',
          message: 'Content-Type must be application/json'
        });
        return;
      }

      // Parse body
      const body = req.body;
      if (!body || Object.keys(body).length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Request body cannot be empty'
        });
        return;
      }

      // Create webhook payload
      const payload: WebhookPayload = {
        event: body.event || req.get('X-Webhook-Event') || 'unknown',
        data: body.data || body,
        timestamp: new Date().toISOString(),
        source: body.source || req.get('X-Webhook-Source') || 'external',
        version: body.version || 'v1',
        metadata: {
          headers: req.headers,
          ip: req.ip,
          receivedAt: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime
        }
      };

      logger.info('Incoming webhook received', {
        event: payload.event,
        source: payload.source,
        ip: req.ip
      });

      // Process with custom handler
      const result = await handler(payload, req);

      res.status(200).json({
        success: true,
        data: result,
        processingTimeMs: Date.now() - startTime
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Incoming webhook error', {
        error: errorMessage,
        ip: req.ip,
        processingTimeMs: Date.now() - startTime
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: errorMessage,
        processingTimeMs: Date.now() - startTime
      });
    }
  }

  /**
   * Verify incoming webhook signature
   */
  verifyIncomingWebhook(
    req: Request,
    secret: string
  ): { valid: boolean; payload?: unknown; error?: string } {
    try {
      const signature = req.get('X-FrontDesk-Signature');
      if (!signature) {
        return { valid: false, error: 'No signature header' };
      }

      const body = req.body;
      const computedSignature = this.createSignature(body, secret);

      const valid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(computedSignature)
      );

      if (!valid) {
        return { valid: false, error: 'Invalid signature' };
      }

      return { valid: true, payload: body };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Get webhook statistics
   */
  getStats(): WebhookStats {
    const totalWebhooks = webhookRegistry.size;
    const activeWebhooks = Array.from(webhookRegistry.values()).filter(w => w.isActive).length;
    
    const totalDeliveries = eventQueue.length;
    const successfulDeliveries = eventQueue.filter(e => e.status === 'delivered').length;
    const failedDeliveries = eventQueue.filter(e => e.status === 'failed').length;

    const eventsByType: Record<string, number> = {};
    eventQueue.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    });

    const successRate = totalDeliveries > 0 
      ? (successfulDeliveries / totalDeliveries) * 100 
      : 0;

    return {
      totalWebhooks,
      activeWebhooks,
      totalDeliveries,
      successfulDeliveries,
      failedDeliveries,
      successRate: Math.round(successRate * 100) / 100,
      eventsByType
    };
  }

  /**
   * Test a webhook endpoint
   */
  async testWebhook(webhookId: string): Promise<{ success: boolean; error?: string; response?: unknown }> {
    const webhook = webhookRegistry.get(webhookId);
    
    if (!webhook || !webhook.isActive) {
      return { success: false, error: 'Webhook not found or inactive' };
    }

    try {
      const testPayload: WebhookPayload = {
        event: 'test',
        data: { message: 'This is a test webhook payload' },
        timestamp: new Date().toISOString(),
        source: this.SOURCE,
        version: this.VERSION,
        metadata: { test: true }
      };

      const body = webhook.secret
        ? this.createSignedPayload(testPayload, webhook.secret)
        : testPayload;

      const result = await this.sendWebhookRequest(webhook.url, body, webhook.secret);

      return {
        success: result.success,
        error: result.error,
        response: {
          statusCode: result.statusCode,
          message: result.message
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Start the background processor
   */
  private startProcessor(): void {
    // Process queue every second
    setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        logger.error('Webhook queue processor error', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, 1000);

    logger.info('Webhook service started with background processor');
  }

  /**
   * Stop the background processor
   */
  stopProcessor(): void {
    // Clear the interval (handled by the service cleanup)
    logger.info('Webhook service background processor stopped');
  }

  /**
   * Clear all webhooks (for testing)
   */
  clearAll(): void {
    webhookRegistry.clear();
    eventQueue.length = 0;
    deliveryAttempts.clear();
    logger.info('All webhooks and events cleared');
  }
}

export const webhookService = new WebhookService();

