import { config } from '../config';
import logger from '../lib/logger';
import { emailService } from './emailService';
import { webhookService } from './webhookService';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  recipient: NotificationRecipient;
  sender?: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  createdAt: Date;
  readAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface NotificationRecipient {
  userId?: number;
  email?: string;
  slackUserId?: string;
  propertyId?: number;
  channel?: string;
}

export type NotificationType = 
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'escalation'
  | 'shift_handover'
  | 'template_updated'
  | 'property_created'
  | 'report_ready'
  | 'custom';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'read' | 'expired';

export interface NotificationSettings {
  email: {
    enabled: boolean;
    fromEmail: string;
    replyTo?: string;
  };
  slack: {
    enabled: boolean;
    botToken?: string;
    defaultChannel?: string;
    signingSecret?: string;
  };
  inApp: {
    enabled: boolean;
    maxPerUser: number;
  };
  webhook: {
    enabled: boolean;
    events: string[];
  };
}

export interface SlackNotificationOptions {
  channel?: string;
  username?: string;
  iconEmoji?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  threadTs?: string;
}

export interface CreateNotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  recipient: NotificationRecipient;
  sender?: string;
  priority?: NotificationPriority;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  sendEmail?: boolean;
  sendSlack?: boolean;
  sendWebhook?: boolean;
  webhookEvent?: string;
}

export interface NotificationResult {
  id: string;
  email?: { success: boolean; messageId?: string; error?: string };
  slack?: { success: boolean; messageId?: string; error?: string };
  webhook?: { success: boolean; eventId?: string; error?: string };
  inApp?: { success: boolean; notificationId?: string; error?: string };
  status: NotificationStatus;
  createdAt: Date;
}

export interface NotificationStats {
  total: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
  byStatus: Record<NotificationStatus, number>;
  unreadCount: number;
  pendingCount: number;
}

// In-memory notification storage (in production, use database)
const notifications: Notification[] = [];
const userPreferences = new Map<number, {
  email: boolean;
  slack: boolean;
  inApp: boolean;
  webhook: boolean;
}>();

export class NotificationService {
  private readonly DEFAULT_PRIORITY: NotificationPriority = 'normal';
  private readonly MESSAGE_LIMIT = 1000;

  constructor() {
    logger.info('Notification service initialized');
  }

  /**
   * Get notification settings from configuration
   */
  getSettings(): NotificationSettings {
    return {
      email: {
        enabled: Boolean(config.SMTP_HOST || config.SENDGRID_API_KEY),
        fromEmail: config.SMTP_FROM_EMAIL || config.SENDGRID_FROM_EMAIL || 'noreply@front-desk-ai.com',
        replyTo: config.REPLY_TO_EMAIL
      },
      slack: {
        enabled: Boolean(config.SLACK_BOT_TOKEN),
        botToken: config.SLACK_BOT_TOKEN,
        defaultChannel: config.SLACK_DEFAULT_CHANNEL,
        signingSecret: config.SLACK_SIGNING_SECRET
      },
      inApp: {
        enabled: true,
        maxPerUser: 50
      },
      webhook: {
        enabled: true,
        events: ['notification.*']
      }
    };
  }

  /**
   * Check if a notification type should be sent via email
   */
  private shouldSendEmail(type: NotificationType, recipient: NotificationRecipient): boolean {
    const settings = this.getSettings();
    if (!settings.email.enabled) {
      return false;
    }

    // Check user preferences
    if (recipient.userId) {
      const prefs = userPreferences.get(recipient.userId);
      if (prefs && !prefs.email) {
        return false;
      }
    }

    // Always send critical notifications via email
    const urgentTypes: NotificationType[] = ['error', 'escalation'];
    if (urgentTypes.includes(type)) {
      return true;
    }

    return true;
  }

  /**
   * Check if a notification should be sent to Slack
   */
  private shouldSendSlack(type: NotificationType, recipient: NotificationRecipient): boolean {
    const settings = this.getSettings();
    if (!settings.slack.enabled) {
      return false;
    }

    // Check user preferences
    if (recipient.userId) {
      const prefs = userPreferences.get(recipient.userId);
      if (prefs && !prefs.slack) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a notification should be sent via webhook
   */
  private shouldSendWebhook(type: NotificationType): boolean {
    const settings = this.getSettings();
    return settings.webhook.enabled;
  }

  /**
   * Create and send a notification
   */
  async createNotification(options: CreateNotificationOptions): Promise<NotificationResult> {
    const id = this.generateNotificationId();
    const now = new Date();
    const priority = options.priority || this.DEFAULT_PRIORITY;

    // Truncate message if too long
    const message = options.message.length > this.MESSAGE_LIMIT
      ? options.message.substring(0, this.MESSAGE_LIMIT) + '...'
      : options.message;

    const notification: Notification = {
      id,
      type: options.type,
      title: options.title,
      message,
      data: options.data || {},
      recipient: options.recipient,
      sender: options.sender,
      priority,
      status: 'pending',
      createdAt: now,
      metadata: options.metadata
    };

    notifications.push(notification);
    logger.info('Notification created', { id, type: options.type, title: options.title });

    const result: NotificationResult = {
      id,
      status: 'pending',
      createdAt: now
    };

    // Send via email if configured
    const sendEmail = options.sendEmail ?? this.shouldSendEmail(options.type, options.recipient);
    if (sendEmail && options.recipient.email) {
      try {
        await this.sendEmailNotification(notification);
        result.email = { success: true };
        notification.status = 'sent';
      } catch (error) {
        result.email = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    // Send to Slack if configured
    const sendSlack = options.sendSlack ?? this.shouldSendSlack(options.type, options.recipient);
    if (sendSlack) {
      try {
        await this.sendSlackNotification(notification);
        result.slack = { success: true };
        notification.status = 'sent';
      } catch (error) {
        result.slack = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    // Send via webhook
    const sendWebhook = options.sendWebhook ?? this.shouldSendWebhook(options.type);
    if (sendWebhook) {
      try {
        const webhookEvent = options.webhookEvent || `notification.${options.type}`;
        await webhookService.emitEvent(webhookEvent, {
          notificationId: id,
          type: options.type,
          title: options.title,
          message,
          recipient: options.recipient,
          priority,
          createdAt: now.toISOString()
        });
        result.webhook = { success: true };
      } catch (error) {
        result.webhook = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    // In-app notification is always stored
    result.inApp = { success: true, notificationId: id };

    // Update notification status based on channel results only
    const channelResults = [result.email, result.slack, result.webhook, result.inApp];
    notification.status = channelResults.every(r => r === undefined || r.success)
      ? 'sent'
      : 'failed';

    if (notification.status === 'sent') {
      logger.info('Notification sent successfully', { id, type: options.type });
    } else {
      logger.warn('Notification partially failed', { id, type: options.type, result });
    }

    result.status = notification.status;
    return result;
  }

  /**
   * Generate a unique notification ID
   */
  private generateNotificationId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Send notification via email
   */
  private async sendEmailNotification(notification: Notification): Promise<void> {
    if (!notification.recipient.email) {
      throw new Error('No email address for recipient');
    }

    const subject = `[${this.capitalize(notification.type)}] ${notification.title}`;
    const priorityLabel = notification.priority.toUpperCase();

    await emailService.sendEmail({
      to: notification.recipient.email,
      subject,
      text: this.formatEmailText(notification),
      html: this.formatEmailHtml(notification),
      priority: this.mapPriorityToEmail(notification.priority)
    });

    logger.info('Email notification sent', { 
      notificationId: notification.id,
      to: notification.recipient.email
    });
  }

  /**
   * Format notification as plain text email
   */
  private formatEmailText(notification: Notification): string {
    const priorityLabel = notification.priority.toUpperCase();
    
    return `Notification: ${notification.title}
Type: ${notification.type.toUpperCase()}
Priority: ${priorityLabel}

${notification.message}

${notification.recipient.propertyId ? `Property ID: ${notification.recipient.propertyId}` : ''}
${notification.sender ? `From: ${notification.sender}` : ''}

Timestamp: ${notification.createdAt.toISOString()}`;
  }

  /**
   * Format notification as HTML email
   */
  private formatEmailHtml(notification: Notification): string {
    const priorityColors: Record<NotificationPriority, string> = {
      low: '#4CAF50',
      normal: '#2196F3',
      high: '#FF9800',
      urgent: '#F44336'
    };

    const typeIcons: Record<NotificationType, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      success: '✅',
      escalation: '🔴',
      shift_handover: '🔄',
      template_updated: '📝',
      property_created: '🏨',
      report_ready: '📊',
      custom: '📢'
    };

    const icon = typeIcons[notification.type] || '🔔';
    const color = priorityColors[notification.priority];
    const propertyInfo = notification.recipient.propertyId 
      ? `<p><strong>Property:</strong> ${notification.recipient.propertyId}</p>`
      : '';
    const senderInfo = notification.sender 
      ? `<p><strong>From:</strong> ${notification.sender}</p>`
      : '';

    return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${color}; color: white; padding: 15px; border-radius: 5px 5px 0 0;">
    <h2 style="margin: 0;">${icon} ${notification.title}</h2>
  </div>
  <div style="padding: 15px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
    <p><strong>Type:</strong> ${this.capitalize(notification.type)}</p>
    <p><strong>Priority:</strong> <span style="color: ${color}; font-weight: bold;">${notification.priority.toUpperCase()}</span></p>
    ${propertyInfo}
    ${senderInfo}
    <hr style="margin: 15px 0; border: none; border-top: 1px solid #eee;" />
    <p>${notification.message}</p>
    <p style="color: #999; font-size: 12px; margin-top: 20px;">
      Sent at: ${notification.createdAt.toLocaleString()}
    </p>
  </div>
</div>`;
  }

  /**
   * Map notification priority to email priority
   */
  private mapPriorityToEmail(priority: NotificationPriority): 'low' | 'normal' | 'high' {
    const priorityMap: Record<NotificationPriority, 'low' | 'normal' | 'high'> = {
      low: 'low',
      normal: 'normal',
      high: 'high',
      urgent: 'high'
    };
    return priorityMap[priority];
  }

  /**
   * Send notification to Slack
   */
  private async sendSlackNotification(notification: Notification): Promise<void> {
    const settings = this.getSettings();
    
    if (!settings.slack.enabled || !config.SLACK_BOT_TOKEN) {
      throw new Error('Slack is not configured');
    }

    try {
      const channel = notification.recipient.channel || 
                      settings.slack.defaultChannel || 
                      this.getDefaultChannelForType(notification.type);

      if (!channel) {
        throw new Error('No Slack channel configured');
      }

      const message = this.formatSlackMessage(notification);

      // Use Slack Web API to send message
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel,
          text: notification.title,
          blocks: message.blocks,
          attachments: message.attachments
        })
      });

      const result = await response.json() as { ok?: boolean; error?: string; ts?: string };

      if (!result.ok) {
        throw new Error(result.error || 'Failed to send Slack message');
      }

      logger.info('Slack notification sent', {
        notificationId: notification.id,
        channel,
        ts: result.ts
      });

    } catch (error) {
      logger.error('Failed to send Slack notification', {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get default Slack channel for notification type
   */
  private getDefaultChannelForType(type: NotificationType): string | undefined {
    const channelMap: Partial<Record<NotificationType, string>> = {
      escalation: config.SLACK_ESCALATION_CHANNEL || undefined,
      error: config.SLACK_ERROR_CHANNEL || undefined,
      shift_handover: config.SLACK_SHIFT_CHANNEL || undefined
    };
    return channelMap[type];
  }

  /**
   * Format notification for Slack
   */
  private formatSlackMessage(notification: Notification): { blocks: unknown[]; attachments: unknown[] } {
    const priorityColors: Record<NotificationPriority, string> = {
      low: '#439FE0',
      normal: '#439FE0',
      high: '#FFA500',
      urgent: '#FF0000'
    };

    const color = priorityColors[notification.priority];
    const priorityText = notification.priority.toUpperCase();

    const blocks: unknown[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🔔 ${notification.title}`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${notification.message}*`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Type: ${notification.type} | Priority: :${this.getPriorityEmoji(notification.priority)}: ${priorityText}`
          }
        ]
      }
    ];

    // Add sender and property info if available
    const contextElements: unknown[] = [];
    
    if (notification.sender) {
      contextElements.push({
        type: 'mrkdwn',
        text: `From: ${notification.sender}`
      });
    }

    if (notification.recipient.propertyId) {
      contextElements.push({
        type: 'mrkdwn',
        text: `Property: ${notification.recipient.propertyId}`
      });
    }

    if (contextElements.length > 0) {
      blocks.push({
        type: 'context',
        elements: contextElements
      });
    }

    // Add data as fields if present
    if (Object.keys(notification.data).length > 0) {
      const fields = Object.entries(notification.data).map(([key, value]) => ({
        type: 'mrkdwn',
        text: `*${key}:* ${JSON.stringify(value)}`
      }));

      blocks.push({
        type: 'section',
        fields: fields.slice(0, 10) // Limit to 10 fields
      });
    }

    const attachments = [
      {
        color,
        blocks: [
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Notification ID: ${notification.id} | ${notification.createdAt.toISOString()}`
              }
            ]
          }
        ]
      }
    ];

    return { blocks, attachments };
  }

  /**
   * Get emoji for priority level
   */
  private getPriorityEmoji(priority: NotificationPriority): string {
    const emojiMap: Record<NotificationPriority, string> = {
      low: 'large_green_circle',
      normal: 'large_blue_circle',
      high: 'large_orange_diamond',
      urgent: 'red_circle'
    };
    return emojiMap[priority];
  }

  /**
   * Capitalize first letter
   */
  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Send an escalation notification
   */
  async sendEscalationNotification(
    recipient: NotificationRecipient,
    escalationId: string,
    title: string,
    description: string,
    priority: NotificationPriority,
    propertyName: string,
    sender?: string
  ): Promise<NotificationResult> {
    return this.createNotification({
      type: 'escalation',
      title: `Escalation #${escalationId}: ${title}`,
      message: `New escalation has been created:\n\n${description}\n\nProperty: ${propertyName}`,
      recipient,
      sender,
      priority,
      data: {
        escalationId,
        title,
        description,
        priority,
        propertyName
      },
      sendEmail: true,
      sendSlack: true,
      sendWebhook: true,
      webhookEvent: 'notification.escalation'
    });
  }

  /**
   * Send a shift handover notification
   */
  async sendShiftHandoverNotification(
    recipient: NotificationRecipient,
    fromUser: string,
    toUser: string,
    propertyName: string,
    notes: string,
    pendingIssues: number,
    sender?: string
  ): Promise<NotificationResult> {
    return this.createNotification({
      type: 'shift_handover',
      title: `Shift Handover: ${propertyName}`,
      message: `Shift handover from ${fromUser} to ${toUser}:\n\n${notes}\n\nPending issues: ${pendingIssues}`,
      recipient,
      sender,
      priority: 'normal',
      data: {
        fromUser,
        toUser,
        propertyName,
        notes,
        pendingIssues
      },
      sendEmail: true,
      sendSlack: true,
      sendWebhook: true,
      webhookEvent: 'notification.shift_handover'
    });
  }

  /**
   * Send a report ready notification
   */
  async sendReportReadyNotification(
    recipient: NotificationRecipient,
    reportType: string,
    reportName: string,
    downloadUrl: string,
    propertyName?: string,
    sender?: string
  ): Promise<NotificationResult> {
    return this.createNotification({
      type: 'report_ready',
      title: `Report Ready: ${reportName}`,
      message: `Your ${reportType} report is ready to download:\n${downloadUrl}` +
               (propertyName ? `\n\nProperty: ${propertyName}` : ''),
      recipient,
      sender,
      priority: 'normal',
      data: {
        reportType,
        reportName,
        downloadUrl,
        propertyName
      },
      sendEmail: true,
      sendSlack: true,
      sendWebhook: true,
      webhookEvent: 'notification.report_ready'
    });
  }

  /**
   * Send a template updated notification
   */
  async sendTemplateUpdatedNotification(
    recipient: NotificationRecipient,
    templateId: number,
    templateName: string,
    updatedBy: string,
    changes: string[],
    propertyName?: string,
    sender?: string
  ): Promise<NotificationResult> {
    return this.createNotification({
      type: 'template_updated',
      title: `Template Updated: ${templateName}`,
      message: `Template #${templateId} was updated by ${updatedBy}:\n\nChanges:\n- ${changes.join('\n- ')}` +
               (propertyName ? `\n\nProperty: ${propertyName}` : ''),
      recipient,
      sender,
      priority: 'low',
      data: {
        templateId,
        templateName,
        updatedBy,
        changes,
        propertyName
      },
      sendEmail: false,
      sendSlack: true,
      sendWebhook: true,
      webhookEvent: 'notification.template_updated'
    });
  }

  /**
   * Send a property created notification
   */
  async sendPropertyCreatedNotification(
    recipient: NotificationRecipient,
    propertyId: number,
    propertyName: string,
    createdBy: string,
    sender?: string
  ): Promise<NotificationResult> {
    return this.createNotification({
      type: 'property_created',
      title: `New Property: ${propertyName}`,
      message: `A new property has been created:\n\nName: ${propertyName}\nID: ${propertyId}\nCreated by: ${createdBy}`,
      recipient,
      sender,
      priority: 'normal',
      data: {
        propertyId,
        propertyName,
        createdBy
      },
      sendEmail: true,
      sendSlack: true,
      sendWebhook: true,
      webhookEvent: 'notification.property_created'
    });
  }

  /**
   * Get notifications for a user
   */
  getNotificationsForUser(userId: number, limit = 20, offset = 0): Notification[] {
    return notifications
      .filter(n => n.recipient.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  /**
   * Get unread notifications for a user
   */
  getUnreadNotificationsForUser(userId: number): Notification[] {
    return notifications
      .filter(n => n.recipient.userId === userId && !n.readAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get notification by ID
   */
  getNotification(id: string): Notification | null {
    return notifications.find(n => n.id === id) || null;
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): boolean {
    const notification = notifications.find(n => n.id === id);
    if (notification) {
      notification.readAt = new Date();
      notification.status = 'read';
      logger.info('Notification marked as read', { id });
      return true;
    }
    return false;
  }

  /**
   * Mark all notifications for a user as read
   */
  markAllAsReadForUser(userId: number): number {
    let count = 0;
    notifications.forEach(n => {
      if (n.recipient.userId === userId && !n.readAt) {
        n.readAt = new Date();
        n.status = 'read';
        count++;
      }
    });
    logger.info('Marked all notifications as read for user', { userId, count });
    return count;
  }

  /**
   * Delete a notification
   */
  deleteNotification(id: string): boolean {
    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      notifications.splice(index, 1);
      logger.info('Notification deleted', { id });
      return true;
    }
    return false;
  }

  /**
   * Get notification statistics
   */
  getStats(): NotificationStats {
    const byType: Record<NotificationType, number> = {
      info: 0, warning: 0, error: 0, success: 0,
      escalation: 0, shift_handover: 0, template_updated: 0,
      property_created: 0, report_ready: 0, custom: 0
    };

    const byPriority: Record<NotificationPriority, number> = {
      low: 0, normal: 0, high: 0, urgent: 0
    };

    const byStatus: Record<NotificationStatus, number> = {
      pending: 0, sent: 0, delivered: 0, failed: 0, read: 0, expired: 0
    };

    let unreadCount = 0;
    let pendingCount = 0;

    notifications.forEach(n => {
      byType[n.type]++;
      byPriority[n.priority]++;
      byStatus[n.status]++;
      
      if (!n.readAt) {
        unreadCount++;
      }
      
      if (n.status === 'pending') {
        pendingCount++;
      }
    });

    return {
      total: notifications.length,
      byType,
      byPriority,
      byStatus,
      unreadCount,
      pendingCount
    };
  }

  /**
   * Set user notification preferences
   */
  setUserPreferences(userId: number, preferences: {
    email?: boolean;
    slack?: boolean;
    inApp?: boolean;
    webhook?: boolean;
  }): void {
    const existing = userPreferences.get(userId) || {
      email: true,
      slack: true,
      inApp: true,
      webhook: true
    };

    userPreferences.set(userId, {
      ...existing,
      ...preferences
    });

    logger.info('User notification preferences updated', { userId, preferences });
  }

  /**
   * Get user notification preferences
   */
  getUserPreferences(userId: number): {
    email: boolean;
    slack: boolean;
    inApp: boolean;
    webhook: boolean;
  } {
    return userPreferences.get(userId) || {
      email: true,
      slack: true,
      inApp: true,
      webhook: true
    };
  }

  /**
   * Expire old notifications
   */
  expireOldNotifications(days: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let count = 0;
    notifications.forEach(n => {
      if (n.createdAt < cutoffDate && !n.expiresAt) {
        n.status = 'expired';
        n.expiresAt = new Date();
        count++;
      }
    });

    logger.info('Expired old notifications', { days, count });
    return count;
  }

  /**
   * Clean up notifications (remove expired, read notifications older than X days)
   */
  cleanupNotifications(readDays: number = 30, expiredDays: number = 7): { 
    removed: number; 
    expired: number 
  } {
    const now = new Date();
    const readCutoff = new Date();
    readCutoff.setDate(readCutoff.getDate() - readDays);
    const expiredCutoff = new Date();
    expiredCutoff.setDate(expiredCutoff.getDate() - expiredDays);

    let removed = 0;
    let expired = 0;

    // First, mark old read notifications for removal
    for (let i = notifications.length - 1; i >= 0; i--) {
      const n = notifications[i];
      
      if (n.readAt && n.readAt < readCutoff) {
        notifications.splice(i, 1);
        removed++;
      } else if (n.status === 'expired' && n.expiresAt && n.expiresAt < expiredCutoff) {
        notifications.splice(i, 1);
        expired++;
      }
    }

    logger.info('Notification cleanup completed', { removed, expired });
    return { removed, expired };
  }

  /**
   * Clear all notifications (for testing)
   */
  clearAll(): void {
    notifications.length = 0;
    userPreferences.clear();
    logger.info('All notifications cleared');
  }
}

export const notificationService = new NotificationService();

