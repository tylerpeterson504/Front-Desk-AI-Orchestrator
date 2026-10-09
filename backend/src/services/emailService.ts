import { config } from '../config';
import logger from '../lib/logger';
import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  encoding?: string;
  mimeType?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
  from?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface EmailTemplate {
  subject: string;
  textTemplate: string;
  htmlTemplate?: string;
}

export interface TemplatedEmailOptions extends Omit<SendEmailOptions, 'subject' | 'text' | 'html'> {
  template: EmailTemplate;
  templateData: Record<string, string>;
}

export interface EmailStatus {
  configured: boolean;
  transportType?: 'smtp' | 'sendgrid' | 'aws-ses' | 'none';
  testConnection?: boolean;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private isConfiguredCache: boolean | null = null;

  constructor() {
    // Initialize transporter if configured
    if (this.isConfigured()) {
      this.initializeTransporter();
    }
  }

  private getSmtpConfig(): EmailConfig | null {
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD) {
      return null;
    }

    return {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT ? Number(config.SMTP_PORT) : 587,
      secure: config.SMTP_SECURE === 'true',
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASSWORD
      }
    };
  }

  private getSendGridConfig(): { apiKey: string; from: string } | null {
    if (!config.SENDGRID_API_KEY) {
      return null;
    }

    return {
      apiKey: config.SENDGRID_API_KEY,
      from: config.SENDGRID_FROM_EMAIL || 'noreply@front-desk-ai.com'
    };
  }

  isConfigured(): boolean {
    if (this.isConfiguredCache !== null) {
      return this.isConfiguredCache;
    }

    const smtpConfigured = Boolean(
      config.SMTP_HOST &&
      config.SMTP_USER &&
      config.SMTP_PASSWORD
    );

    const sendGridConfigured = Boolean(config.SENDGRID_API_KEY);

    this.isConfiguredCache = smtpConfigured || sendGridConfigured;
    return this.isConfiguredCache;
  }

  getStatus(): EmailStatus {
    const smtpConfigured = this.getSmtpConfig() !== null;
    const sendGridConfigured = this.getSendGridConfig() !== null;

    let transportType: 'smtp' | 'sendgrid' | 'aws-ses' | 'none' = 'none';

    if (sendGridConfigured) {
      transportType = 'sendgrid';
    } else if (smtpConfigured) {
      transportType = 'smtp';
    }

    return {
      configured: smtpConfigured || sendGridConfigured,
      transportType
    };
  }

  private initializeTransporter(): void {
    const sendGridConfig = this.getSendGridConfig();
    const smtpConfig = this.getSmtpConfig();

    if (sendGridConfig) {
      // Use SendGrid
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(sendGridConfig.apiKey);
        this.transporter = {
          sendMail: async (options: SendMailOptions) => {
            const msg = {
              to: options.to,
              from: options.from || sendGridConfig.from,
              subject: options.subject,
              text: options.text,
              html: options.html
            };
            await sgMail.send(msg);
            return { messageId: '' };
          }
        } as any;
        logger.info('Email service initialized with SendGrid');
      } catch (error) {
        logger.warn('SendGrid not available, falling back to SMTP');
      }
    }

    if (smtpConfig && !this.transporter) {
      // Use SMTP
      try {
        this.transporter = nodemailer.createTransport(smtpConfig);
        logger.info('Email service initialized with SMTP', {
          host: smtpConfig.host,
          port: smtpConfig.port
        });
      } catch (error) {
        logger.error('Failed to initialize SMTP transporter', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (!this.transporter) {
      logger.warn('Email service not configured - no transport available');
    }
  }

  /**
   * Send an email with the specified options
   */
  async sendEmail(options: SendEmailOptions): Promise<{ messageId: string; success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      logger.error('Email service not configured - cannot send email');
      throw new Error('Email service is not configured');
    }

    if (!this.transporter) {
      this.initializeTransporter();
    }

    if (!this.transporter) {
      throw new Error('No email transporter available');
    }

    try {
      const from = options.from || config.SMTP_FROM_EMAIL || config.SENDGRID_FROM_EMAIL || 'noreply@front-desk-ai.com';

      const mailOptions: SendMailOptions = {
        from,
        to: options.to,
        cc: options.cc,
        bcc: options.bcc,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: options.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          encoding: a.encoding,
          contentType: a.mimeType
        })),
        priority: options.priority
      };

      logger.info('Sending email', {
        to: options.to,
        subject: options.subject,
        hasAttachments: Boolean(options.attachments?.length)
      });

      const result = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        messageId: result.messageId,
        to: options.to,
        subject: options.subject
      });

      return {
        messageId: result.messageId || '',
        success: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send email', {
        to: options.to,
        subject: options.subject,
        error: errorMessage
      });

      return {
        messageId: '',
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Send an email using a template
   */
  async sendTemplatedEmail(options: TemplatedEmailOptions): Promise<{ messageId: string; success: boolean; error?: string }> {
    let subject = options.template.subject;
    let text = options.template.textTemplate;
    let html = options.template.htmlTemplate;

    // Replace template variables
    for (const [key, value] of Object.entries(options.templateData)) {
      const placeholder = `{${key}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
      text = text.replace(new RegExp(placeholder, 'g'), value);
      if (html) {
        html = html.replace(new RegExp(placeholder, 'g'), value);
      }
    }

    return this.sendEmail({
      ...options,
      subject,
      text,
      html
    });
  }

  /**
   * Send a test email to verify configuration
   */
  async sendTestEmail(to: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.sendEmail({
        to,
        subject: 'Front Desk AI - Email Configuration Test',
        text: 'This is a test email to verify that the email service is properly configured.',
        html: '<h1>Email Test</h1><p>This is a test email to verify that the email service is properly configured.</p>'
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send a welcome email to a new user
   */
  async sendWelcomeEmail(email: string, userName: string, propertyName: string): Promise<{ messageId: string; success: boolean; error?: string }> {
    const welcomeTemplate: EmailTemplate = {
      subject: 'Welcome to Front Desk AI Orchestrator, {userName}!',
      textTemplate: `Hello {userName},

Welcome to Front Desk AI Orchestrator! You've been successfully registered for {propertyName}.

Our AI-powered system will help you:
- Generate consistent, professional responses to guest messages
- Maintain your property's unique voice and style
- Improve response times and guest satisfaction

If you have any questions, please don't hesitate to reach out.

Best regards,
The Front Desk AI Team`,
      htmlTemplate: `<h2>Welcome to Front Desk AI Orchestrator, {userName}!</h2>
<p>Hello {userName},</p>
<p>Welcome to <strong>Front Desk AI Orchestrator</strong>! You've been successfully registered for <strong>{propertyName}</strong>.</p>
<p>Our AI-powered system will help you:</p>
<ul>
<li>Generate consistent, professional responses to guest messages</li>
<li>Maintain your property's unique voice and style</li>
<li>Improve response times and guest satisfaction</li>
</ul>
<p>If you have any questions, please don't hesitate to reach out.</p>
<p>Best regards,<br>The Front Desk AI Team</p>`
    };

    return this.sendTemplatedEmail({
      to: email,
      template: welcomeTemplate,
      templateData: { userName, propertyName }
    });
  }

  /**
   * Send a shift handover notification email
   */
  async sendShiftHandoverEmail(
    to: string,
    fromUser: string,
    toUser: string,
    propertyName: string,
    notes: string,
    pendingIssues: number
  ): Promise<{ messageId: string; success: boolean; error?: string }> {
    const handoverTemplate: EmailTemplate = {
      subject: 'Shift Handover: {propertyName} - {date}',
      textTemplate: `Shift Handover Notification

Property: {propertyName}
From: {fromUser}
To: {toUser}
Date: {date}

Notes from outgoing shift:
{notes}

Pending Issues: {pendingIssues}

Please review and acknowledge receipt of this handover.`,
      htmlTemplate: `<h2>Shift Handover: {propertyName}</h2>
<p><strong>From:</strong> {fromUser}<br>
<strong>To:</strong> {toUser}<br>
<strong>Date:</strong> {date}</p>
<h3>Notes from outgoing shift:</h3>
<pre>{notes}</pre>
<p><strong>Pending Issues:</strong> {pendingIssues}</p>
<p>Please review and acknowledge receipt of this handover.</p>`
    };

    return this.sendTemplatedEmail({
      to,
      template: handoverTemplate,
      templateData: {
        fromUser,
        toUser,
        propertyName,
        notes,
        pendingIssues: String(pendingIssues),
        date: new Date().toLocaleDateString()
      }
    });
  }

  /**
   * Send an escalation notification email
   */
  async sendEscalationEmail(
    to: string,
    escalationId: string,
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high' | 'critical',
    propertyName: string
  ): Promise<{ messageId: string; success: boolean; error?: string }> {
    const priorityColors: Record<string, string> = {
      low: '#4CAF50',
      medium: '#FFC107',
      high: '#FF9800',
      critical: '#F44336'
    };

    const escalationTemplate: EmailTemplate = {
      subject: '[{priority}] New Escalation #{escalationId}: {title}',
      textTemplate: `New Escalation Notification

Priority: {priority}
Escalation ID: {escalationId}
Title: {title}
Property: {propertyName}

Description:
{description}

Please review and take appropriate action.`,
      htmlTemplate: `<h2 style="color: ${priorityColors[priority]};">[${priority.toUpperCase()}] New Escalation #${escalationId}</h2>
<p><strong>Title:</strong> {title}<br>
<strong>Property:</strong> {propertyName}</p>
<h3>Description:</h3>
<p>{description}</p>
<p>Please review and take appropriate action.</p>`
    };

    return this.sendTemplatedEmail({
      to,
      template: escalationTemplate,
      templateData: { escalationId, title, description, priority, propertyName }
    });
  }

  /**
   * Send a scheduled report email
   */
  async sendReportEmail(
    to: string,
    reportType: string,
    reportData: string,
    startDate: string,
    endDate: string,
    propertyName?: string
  ): Promise<{ messageId: string; success: boolean; error?: string }> {
    const reportTemplate: EmailTemplate = {
      subject: '{reportType} Report - {startDate} to {endDate}{propertySuffix}',
      textTemplate: `{reportType} Report

Period: {startDate} to {endDate}
{propertyInfo}

Report Data:
{reportData}

Generated by Front Desk AI Orchestrator`,
      htmlTemplate: `<h2>{reportType} Report</h2>
<p><strong>Period:</strong> {startDate} to {endDate}</p>
{propertyInfoHtml}
<h3>Report Data:</h3>
<pre>{reportData}</pre>
<p><em>Generated by Front Desk AI Orchestrator</em></p>`
    };

    const propertySuffix = propertyName ? ` - ${propertyName}` : '';
    const propertyInfo = propertyName ? `Property: ${propertyName}` : '';
    const propertyInfoHtml = propertyName ? `<p><strong>Property:</strong> ${propertyName}</p>` : '';

    return this.sendTemplatedEmail({
      to,
      template: reportTemplate,
      templateData: {
        reportType,
        startDate,
        endDate,
        propertySuffix,
        reportData,
        propertyInfo,
        propertyInfoHtml
      }
    });
  }

  /**
   * Validate email address format
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate multiple email addresses
   */
  areValidEmails(emails: string | string[]): boolean {
    const emailList = Array.isArray(emails) ? emails : [emails];
    return emailList.every(email => this.isValidEmail(email));
  }
}

export const emailService = new EmailService();
