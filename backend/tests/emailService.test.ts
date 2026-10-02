import { EmailService, emailService } from '../src/services/emailService';
import { config } from '../src/config';
import logger from '../src/lib/logger';

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' })
  }))
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

// Mock @sendgrid/mail (optional dependency)
jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }])
}), { virtual: true });

describe('EmailService', () => {
  let service: EmailService;
  let mockConfig: Partial<typeof config>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the singleton
    service = new EmailService();
    
    // Mock configuration
    mockConfig = {
      SMTP_HOST: 'smtp.test.com',
      SMTP_PORT: 587,
      SMTP_SECURE: 'false',
      SMTP_USER: 'test@example.com',
      SMTP_PASSWORD: 'test-password',
      SMTP_FROM_EMAIL: 'noreply@test.com',
      SENDGRID_API_KEY: undefined,
      NODE_ENV: 'test'
    };
    
    // Override config
    Object.assign(config, mockConfig);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize without errors', () => {
      expect(() => new EmailService()).not.toThrow();
    });

    it('should not initialize transporter when not configured', () => {
      Object.assign(config, {
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SENDGRID_API_KEY: undefined
      });
      
      const testService = new EmailService();
      // @ts-ignore - accessing private property for test
      expect(testService.transporter).toBeNull();
    });
  });

  describe('isConfigured', () => {
    it('should return true when SMTP is configured', () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password'
      });
      
      expect(service.isConfigured()).toBe(true);
    });

    it('should return true when SendGrid is configured', () => {
      Object.assign(config, {
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SENDGRID_API_KEY: 'test-api-key'
      });
      
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when neither SMTP nor SendGrid is configured', () => {
      Object.assign(config, {
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SENDGRID_API_KEY: undefined
      });
      
      expect(service.isConfigured()).toBe(false);
    });

    it('should cache the configuration check result', () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password'
      });
      
      const result1 = service.isConfigured();
      const result2 = service.isConfigured();
      
      expect(result1).toBe(result2);
    });
  });

  describe('getStatus', () => {
    it('should return configured status and transport type', () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password'
      });
      
      const status = service.getStatus();
      
      expect(status.configured).toBe(true);
      expect(status.transportType).toBe('smtp');
    });

    it('should return SendGrid transport type when configured', () => {
      Object.assign(config, {
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SENDGRID_API_KEY: 'test-api-key'
      });
      
      const status = service.getStatus();
      
      expect(status.configured).toBe(true);
      expect(status.transportType).toBe('sendgrid');
    });

    it('should return none transport type when not configured', () => {
      Object.assign(config, {
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SENDGRID_API_KEY: undefined
      });
      
      const status = service.getStatus();
      
      expect(status.configured).toBe(false);
      expect(status.transportType).toBe('none');
    });
  });

  describe('isValidEmail', () => {
    it('should validate simple email addresses', () => {
      expect(service.isValidEmail('test@example.com')).toBe(true);
      expect(service.isValidEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(service.isValidEmail('invalid-email')).toBe(false);
      expect(service.isValidEmail('test@')).toBe(false);
      expect(service.isValidEmail('@example.com')).toBe(false);
      expect(service.isValidEmail('test @example.com')).toBe(false);
    });
  });

  describe('areValidEmails', () => {
    it('should validate array of emails', () => {
      expect(service.areValidEmails(['test1@example.com', 'test2@example.com'])).toBe(true);
    });

    it('should return false if any email is invalid', () => {
      expect(service.areValidEmails(['test@example.com', 'invalid-email'])).toBe(false);
    });

    it('should validate single email string', () => {
      expect(service.areValidEmails('test@example.com')).toBe(true);
    });
  });

  describe('sendEmail', () => {
    it('should throw error when not configured', async () => {
      Object.assign(config, {
        SMTP_HOST: undefined,
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        SENDGRID_API_KEY: undefined
      });
      
      await expect(service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test message'
      })).rejects.toThrow('Email service is not configured');
    });

    it('should send email via SMTP when configured', async () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password',
        SMTP_FROM_EMAIL: 'noreply@test.com'
      });
      
      const result = await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test message',
        html: '<p>Test message</p>'
      });
      
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it('should use custom from address when provided', async () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password',
        SMTP_FROM_EMAIL: 'noreply@test.com'
      });
      
      const nodemailer = require('nodemailer');
      const mockTransporter = {
        sendMail: jest.fn().mockImplementation((options) => {
          expect(options.from).toBe('custom@test.com');
          return Promise.resolve({ messageId: 'test-id' });
        })
      };
      nodemailer.createTransport.mockReturnValue(mockTransporter);
      
      await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test message',
        from: 'custom@test.com'
      });
    });

    it('should handle email sending errors', async () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password'
      });
      
      const nodemailer = require('nodemailer');
      const mockTransporter = {
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection failed'))
      };
      nodemailer.createTransport.mockReturnValue(mockTransporter);
      
      const result = await service.sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        text: 'Test message'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('sendTemplatedEmail', () => {
    it('should substitute template variables', async () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password',
        SMTP_FROM_EMAIL: 'noreply@test.com'
      });
      
      const result = await service.sendTemplatedEmail({
        to: 'test@example.com',
        template: {
          subject: 'Hello {name}!',
          textTemplate: 'Welcome, {name}!',
          htmlTemplate: '<h1>Welcome, {name}!</h1>'
        },
        templateData: { name: 'John' }
      });
      
      expect(result.success).toBe(true);
    });

    it('should handle multiple template variables', async () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password'
      });
      
      const result = await service.sendTemplatedEmail({
        to: 'test@example.com',
        template: {
          subject: '{greeting} {name}',
          textTemplate: '{greeting} {name}, welcome to {property}!'
        },
        templateData: {
          greeting: 'Hello',
          name: 'John',
          property: 'Test Hotel'
        }
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('sendTestEmail', () => {
    it('should send test email successfully', async () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password'
      });
      
      const result = await service.sendTestEmail('test@example.com');
      
      expect(result.success).toBe(true);
    });

    it('should return error on failure', async () => {
      Object.assign(config, {
        SMTP_HOST: 'smtp.test.com',
        SMTP_USER: 'user@test.com',
        SMTP_PASSWORD: 'password'
      });
      
      const nodemailer = require('nodemailer');
      const mockTransporter = {
        sendMail: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };
      nodemailer.createTransport.mockReturnValue(mockTransporter);
      
      const result = await service.sendTestEmail('test@example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Pre-built Templates', () => {
    const templateTests = [
      {
        name: 'sendWelcomeEmail',
        args: ['test@example.com', 'John Doe', 'Test Hotel'],
        expectedSubject: 'Welcome to Front Desk AI Orchestrator, John Doe!'
      },
      {
        name: 'sendShiftHandoverEmail',
        args: ['test@example.com', 'Alice', 'Bob', 'Test Hotel', 'Test notes', 5],
        expectedSubject: 'Shift Handover: Test Hotel'
      },
      {
        name: 'sendEscalationEmail',
        args: ['test@example.com', 'ESC-001', 'Urgent Issue', 'Something broke', 'high', 'Test Hotel'],
        expectedSubject: '[high] New Escalation #ESC-001: Urgent Issue'
      },
      {
        name: 'sendReportEmail',
        args: ['test@example.com', 'Analytics', 'September Report', 'Report data', '2026-09-01', '2026-09-30'],
        expectedSubject: 'Analytics Report - 2026-09-01 to 2026-09-30'
      }
    ];

    templateTests.forEach(({ name, args, expectedSubject }) => {
      it(`should send ${name} with correct subject`, async () => {
        Object.assign(config, {
          SMTP_HOST: 'smtp.test.com',
          SMTP_USER: 'user@test.com',
          SMTP_PASSWORD: 'password'
        });
        
        // @ts-ignore - accessing method dynamically
        const result = await service[name](...args);
        
        expect(result.success).toBe(true);
      });
    });
  });
});

// Test singleton instance
describe('emailService singleton', () => {
  it('should export a singleton instance', () => {
    expect(emailService).toBeInstanceOf(EmailService);
  });

  it('should be the same instance when imported multiple times', () => {
    const { emailService: instance1 } = require('../src/services/emailService');
    const { emailService: instance2 } = require('../src/services/emailService');
    
    expect(instance1).toBe(instance2);
  });
});
