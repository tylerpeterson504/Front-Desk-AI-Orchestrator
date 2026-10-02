import { NotificationService, notificationService, NotificationRecipient } from '../src/services/notificationService';
import { config } from '../src/config';
import logger from '../src/lib/logger';

// Mock emailService
jest.mock('../src/services/emailService', () => ({
  emailService: {
    sendEmail: jest.fn().mockResolvedValue({ messageId: 'test-id', success: true }),
    isConfigured: jest.fn().mockReturnValue(true)
  }
}));

// Mock webhookService
jest.mock('../src/services/webhookService', () => ({
  webhookService: {
    emitEvent: jest.fn().mockResolvedValue(undefined),
    isConfigured: jest.fn().mockReturnValue(true)
  }
}));

// Mock logger
jest.mock('../src/lib/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock global fetch for Slack
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
    
    // Reset singleton state
    service = new NotificationService();
    
    // Mock configuration
    Object.assign(config, {
      SLACK_BOT_TOKEN: 'test-bot-token',
      SLACK_DEFAULT_CHANNEL: '#general',
      NODE_ENV: 'test'
    });
    
    // Clear any existing notifications
    service.clearAll();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize without errors', () => {
      expect(() => new NotificationService()).not.toThrow();
    });
  });

  describe('getSettings', () => {
    it('should return notification settings', () => {
      const settings = service.getSettings();
      
      expect(settings.email.enabled).toBeDefined();
      expect(settings.slack.enabled).toBeDefined();
      expect(settings.inApp.enabled).toBeDefined();
      expect(settings.webhook.enabled).toBeDefined();
    });
  });

  describe('createNotification', () => {
    const baseRecipient: NotificationRecipient = {
      email: 'test@example.com'
    };

    it('should create a notification and return result', async () => {
      const result = await service.createNotification({
        type: 'info',
        title: 'Test Notification',
        message: 'This is a test notification',
        recipient: baseRecipient
      });
      
      expect(result.id).toBeDefined();
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should generate unique notification IDs', async () => {
      const result1 = await service.createNotification({
        type: 'info',
        title: 'Test 1',
        message: 'Message 1',
        recipient: baseRecipient
      });
      
      const result2 = await service.createNotification({
        type: 'info',
        title: 'Test 2',
        message: 'Message 2',
        recipient: baseRecipient
      });
      
      expect(result1.id).not.toBe(result2.id);
    });

    it('should truncate long messages', async () => {
      const longMessage = 'a'.repeat(1500);
      
      const result = await service.createNotification({
        type: 'info',
        title: 'Test',
        message: longMessage,
        recipient: baseRecipient
      });
      
      expect(result.message?.length).toBeLessThanOrEqual(1003); // 1000 + '...'
    });

    it('should use default priority when not specified', async () => {
      const result = await service.createNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
        recipient: baseRecipient
      });
      
      expect(result.priority).toBe('normal');
    });

    it('should use specified priority', async () => {
      const result = await service.createNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
        recipient: baseRecipient,
        priority: 'high'
      });
      
      expect(result.priority).toBe('high');
    });

    it('should store notification for retrieval', async () => {
      const result = await service.createNotification({
        type: 'info',
        title: 'Test Notification',
        message: 'Test message',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      const notification = service.getNotification(result.id);
      
      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Test Notification');
    });
  });

  describe('sendEscalationNotification', () => {
    it('should send escalation notification with all details', async () => {
      const result = await service.sendEscalationNotification(
        { email: 'test@example.com' },
        'ESC-001',
        'Urgent Issue',
        'Something broke',
        'high',
        'Test Hotel',
        'system'
      );
      
      expect(result.id).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('sendShiftHandoverNotification', () => {
    it('should send shift handover notification', async () => {
      const result = await service.sendShiftHandoverNotification(
        { email: 'test@example.com' },
        'Alice',
        'Bob',
        'Test Hotel',
        'Test notes',
        5,
        'system'
      );
      
      expect(result.id).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('sendReportReadyNotification', () => {
    it('should send report ready notification', async () => {
      const result = await service.sendReportReadyNotification(
        { email: 'test@example.com' },
        'Analytics',
        'September Report',
        'https://example.com/report.pdf',
        'Test Hotel',
        'system'
      );
      
      expect(result.id).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('sendTemplateUpdatedNotification', () => {
    it('should send template updated notification', async () => {
      const result = await service.sendTemplateUpdatedNotification(
        { email: 'test@example.com' },
        1,
        'Welcome Template',
        'admin',
        ['Updated greeting', 'Fixed typo'],
        'Test Hotel',
        'system'
      );
      
      expect(result.id).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('sendPropertyCreatedNotification', () => {
    it('should send property created notification', async () => {
      const result = await service.sendPropertyCreatedNotification(
        { email: 'test@example.com' },
        1,
        'New Hotel',
        'admin',
        'system'
      );
      
      expect(result.id).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('getNotificationsForUser', () => {
    it('should return notifications for a specific user', async () => {
      await service.createNotification({
        type: 'info',
        title: 'Notification 1',
        message: 'Message 1',
        recipient: { userId: 1, email: 'test1@example.com' }
      });
      
      await service.createNotification({
        type: 'info',
        title: 'Notification 2',
        message: 'Message 2',
        recipient: { userId: 2, email: 'test2@example.com' }
      });
      
      await service.createNotification({
        type: 'info',
        title: 'Notification 3',
        message: 'Message 3',
        recipient: { userId: 1, email: 'test1@example.com' }
      });
      
      const notifications = service.getNotificationsForUser(1, 10, 0);
      
      expect(notifications).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createNotification({
          type: 'info',
          title: `Notification ${i}`,
          message: `Message ${i}`,
          recipient: { userId: 1, email: 'test@example.com' }
        });
      }
      
      const notifications = service.getNotificationsForUser(1, 3, 0);
      
      expect(notifications).toHaveLength(3);
    });

    it('should respect offset parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await service.createNotification({
          type: 'info',
          title: `Notification ${i}`,
          message: `Message ${i}`,
          recipient: { userId: 1, email: 'test@example.com' }
        });
      }
      
      const notifications = service.getNotificationsForUser(1, 3, 2);
      
      expect(notifications).toHaveLength(3);
    });

    it('should return empty array for user with no notifications', () => {
      const notifications = service.getNotificationsForUser(999);
      
      expect(notifications).toEqual([]);
    });
  });

  describe('getUnreadNotificationsForUser', () => {
    it('should return unread notifications for a user', async () => {
      await service.createNotification({
        type: 'info',
        title: 'Notification 1',
        message: 'Message 1',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      const notification = service.getNotification(service.getNotificationsForUser(1)[0].id);
      if (notification) {
        service.markAsRead(notification.id);
      }
      
      await service.createNotification({
        type: 'info',
        title: 'Notification 2',
        message: 'Message 2',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      const unread = service.getUnreadNotificationsForUser(1);
      
      expect(unread).toHaveLength(1);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const result = await service.createNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      const marked = service.markAsRead(result.id);
      
      expect(marked).toBe(true);
      
      const notification = service.getNotification(result.id);
      expect(notification?.readAt).toBeDefined();
      expect(notification?.status).toBe('read');
    });

    it('should return false for non-existing notification', () => {
      const result = service.markAsRead('non-existing-id');
      
      expect(result).toBe(false);
    });
  });

  describe('markAllAsReadForUser', () => {
    it('should mark all notifications as read for a user', async () => {
      for (let i = 0; i < 3; i++) {
        await service.createNotification({
          type: 'info',
          title: `Notification ${i}`,
          message: `Message ${i}`,
          recipient: { userId: 1, email: 'test@example.com' }
        });
      }
      
      const count = service.markAllAsReadForUser(1);
      
      expect(count).toBe(3);
      
      const unread = service.getUnreadNotificationsForUser(1);
      expect(unread).toHaveLength(0);
    });
  });

  describe('deleteNotification', () => {
    it('should delete a notification', async () => {
      const result = await service.createNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      const deleted = service.deleteNotification(result.id);
      
      expect(deleted).toBe(true);
      expect(service.getNotification(result.id)).toBeNull();
    });

    it('should return false for non-existing notification', () => {
      const result = service.deleteNotification('non-existing-id');
      
      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return notification statistics', async () => {
      await service.createNotification({
        type: 'info',
        title: 'Test 1',
        message: 'Message 1',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      await service.createNotification({
        type: 'escalation',
        title: 'Test 2',
        message: 'Message 2',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      const stats = service.getStats();
      
      expect(stats.total).toBe(2);
      expect(stats.byType.info).toBe(1);
      expect(stats.byType.escalation).toBe(1);
    });
  });

  describe('User Preferences', () => {
    it('should set user preferences', () => {
      service.setUserPreferences(1, {
        email: true,
        slack: false,
        inApp: true,
        webhook: false
      });
      
      const prefs = service.getUserPreferences(1);
      
      expect(prefs.email).toBe(true);
      expect(prefs.slack).toBe(false);
    });

    it('should return default preferences for unknown user', () => {
      const prefs = service.getUserPreferences(999);
      
      expect(prefs.email).toBe(true);
      expect(prefs.slack).toBe(true);
      expect(prefs.inApp).toBe(true);
      expect(prefs.webhook).toBe(true);
    });

    it('should merge with existing preferences', () => {
      service.setUserPreferences(1, { email: false });
      service.setUserPreferences(1, { slack: false });
      
      const prefs = service.getUserPreferences(1);
      
      expect(prefs.email).toBe(false);
      expect(prefs.slack).toBe(false);
      expect(prefs.inApp).toBe(true); // Default
    });
  });

  describe('clearAll', () => {
    it('should clear all notifications', async () => {
      await service.createNotification({
        type: 'info',
        title: 'Test',
        message: 'Test message',
        recipient: { userId: 1, email: 'test@example.com' }
      });
      
      service.clearAll();
      
      expect(service.listConfigs()).toHaveLength(0);
    });
  });
});

// Test singleton instance
describe('notificationService singleton', () => {
  it('should export a singleton instance', () => {
    expect(notificationService).toBeInstanceOf(NotificationService);
  });

  it('should be the same instance when imported multiple times', () => {
    const { notificationService: instance1 } = require('../src/services/notificationService');
    const { notificationService: instance2 } = require('../src/services/notificationService');
    
    expect(instance1).toBe(instance2);
  });
});
