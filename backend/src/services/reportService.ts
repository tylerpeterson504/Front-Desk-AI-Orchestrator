import { getRepository, Between, MoreThan, LessThan, In, Like } from 'typeorm';
import { ResponseEvent } from '../entities/ResponseEvent';
import { Property } from '../entities/Property';
import { Template } from '../entities/Template';
import { ShiftNote } from '../entities/ShiftNote';
import { Escalation } from '../entities/Escalation';
import { User } from '../entities/User';
import { emailService } from './emailService';
import { webhookService } from './webhookService';
import { notificationService } from './notificationService';
import { config } from '../config';
import logger from '../lib/logger';
import path from 'path';
import fs from 'fs/promises';

export interface ReportConfig {
  id: string;
  name: string;
  type: ReportType;
  description: string;
  schedule?: ReportSchedule;
  filters?: ReportFilter;
  format: ReportFormat;
  delivery: ReportDelivery;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  time: string; // HH:mm format
  timezone: string; // IANA timezone
  daysOfWeek?: number[]; // 0-6 (Sunday = 0)
  dayOfMonth?: number; // 1-31
  cronExpression?: string; // For custom schedules
}

export interface ReportFilter {
  properties?: number[];
  dateRange?: {
    start: Date | string;
    end: Date | string;
  };
  templates?: number[];
  users?: number[];
  status?: string[];
  priority?: string[];
}

export type ReportType = 
  | 'response_analytics'
  | 'template_usage'
  | 'shift_notes'
  | 'escalation_summary'
  | 'user_activity'
  | 'property_performance'
  | 'custom';

export type ReportFormat = 'csv' | 'excel' | 'pdf' | 'json';

export interface ReportDelivery {
  email?: string[];
  slack?: {
    channel: string;
    botToken?: string;
  };
  webhook?: string[];
  saveToDisk?: boolean;
  uploadToCloud?: boolean;
}

export interface ReportData {
  metadata: {
    reportId: string;
    reportName: string;
    reportType: ReportType;
    generatedAt: string;
    dateRange?: {
      start: string;
      end: string;
    };
    propertyId?: number;
    propertyName?: string;
  };
  data: unknown;
  summary?: Record<string, unknown>;
}

export interface ReportResult {
  id: string;
  name: string;
  type: ReportType;
  format: ReportFormat;
  filePath?: string;
  fileUrl?: string;
  generatedAt: Date;
  size: number;
  rows: number;
  success: boolean;
  error?: string;
}

export interface ScheduledReport {
  id: string;
  configId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: ReportResult;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  sortable: boolean;
  width?: number;
}

export interface ReportStats {
  totalReports: number;
  scheduledReports: number;
  byType: Record<ReportType, number>;
  byFormat: Record<ReportFormat, number>;
  pendingJobs: number;
}

// In-memory storage for reports (in production, use database)
const reportConfigs = new Map<string, ReportConfig>();
const scheduledReports: ScheduledReport[] = [];
const generatedReports = new Map<string, ReportResult>();

export class ReportService {
  private readonly OUTPUT_DIR = path.join(__dirname, '../../../reports');
  private readonly TEMP_DIR = path.join(__dirname, '../../../temp');

  constructor() {
    // Ensure output directories exist
    this.ensureDirectories();
    logger.info('Report service initialized');
  }

  /**
   * Ensure output directories exist
   */
  private async ensureDirectories(): Promise<void> {
    try {
      await fs.access(this.OUTPUT_DIR);
    } catch {
      await fs.mkdir(this.OUTPUT_DIR, { recursive: true });
    }

    try {
      await fs.access(this.TEMP_DIR);
    } catch {
      await fs.mkdir(this.TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Create a new report configuration
   */
  createConfig(config: Omit<ReportConfig, 'id' | 'createdAt' | 'updatedAt'>): ReportConfig {
    const id = this.generateId();
    const now = new Date();

    const newConfig: ReportConfig = {
      id,
      createdAt: now,
      updatedAt: now,
      isActive: true,
      ...config
    };

    reportConfigs.set(id, newConfig);
    logger.info('Report configuration created', { id, name: config.name, type: config.type });

    return newConfig;
  }

  /**
   * Get a report configuration by ID
   */
  getConfig(id: string): ReportConfig | null {
    return reportConfigs.get(id) || null;
  }

  /**
   * List all report configurations
   */
  listConfigs(): ReportConfig[] {
    return Array.from(reportConfigs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Update a report configuration
   */
  updateConfig(id: string, updates: Partial<Omit<ReportConfig, 'id' | 'createdAt'>>): ReportConfig | null {
    const existing = reportConfigs.get(id);
    if (!existing) {
      return null;
    }

    const updated: ReportConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date()
    };

    reportConfigs.set(id, updated);
    logger.info('Report configuration updated', { id, updatedFields: Object.keys(updates) });

    return updated;
  }

  /**
   * Delete a report configuration
   */
  deleteConfig(id: string): boolean {
    if (reportConfigs.has(id)) {
      reportConfigs.delete(id);
      logger.info('Report configuration deleted', { id });
      return true;
    }
    return false;
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate a report by type
   */
  async generateReport(
    type: ReportType,
    format: ReportFormat,
    filters?: ReportFilter,
    configId?: string
  ): Promise<ReportResult> {
    const startTime = Date.now();
    const reportId = this.generateId();
    const reportName = configId ? reportConfigs.get(configId)?.name || type : type;

    logger.info('Generating report', { reportId, type, format, configId });

    try {
      let data: unknown;
      let columns: ReportColumn[] = [];
      let summary: Record<string, unknown> = {};

      switch (type) {
        case 'response_analytics':
          data = await this.generateResponseAnalyticsReport(filters);
          columns = this.getResponseAnalyticsColumns();
          summary = await this.getResponseAnalyticsSummary(filters);
          break;

        case 'template_usage':
          data = await this.generateTemplateUsageReport(filters);
          columns = this.getTemplateUsageColumns();
          summary = await this.getTemplateUsageSummary(filters);
          break;

        case 'shift_notes':
          data = await this.generateShiftNotesReport(filters);
          columns = this.getShiftNotesColumns();
          summary = await this.getShiftNotesSummary(filters);
          break;

        case 'escalation_summary':
          data = await this.generateEscalationSummaryReport(filters);
          columns = this.getEscalationSummaryColumns();
          summary = await this.getEscalationSummary(filters);
          break;

        case 'user_activity':
          data = await this.generateUserActivityReport(filters);
          columns = this.getUserActivityColumns();
          summary = await this.getUserActivitySummary(filters);
          break;

        case 'property_performance':
          data = await this.generatePropertyPerformanceReport(filters);
          columns = this.getPropertyPerformanceColumns();
          summary = await this.getPropertyPerformanceSummary(filters);
          break;

        default:
          throw new Error(`Unknown report type: ${type}`);
      }

      // Format the data
      const formattedData = this.formatData(data, format);
      const filePath = await this.saveReport(
        reportId,
        type,
        format,
        formattedData,
        reportName
      );

      const result: ReportResult = {
        id: reportId,
        name: reportName,
        type,
        format,
        filePath,
        generatedAt: new Date(),
        size: formattedData.length,
        rows: this.countRows(data),
        success: true
      };

      generatedReports.set(reportId, result);

      logger.info('Report generated successfully', {
        reportId,
        type,
        format,
        rows: result.rows,
        size: result.size,
        durationMs: Date.now() - startTime
      });

      // Deliver the report if configured
      if (configId) {
        const config = reportConfigs.get(configId);
        if (config && config.delivery) {
          await this.deliverReport(result, config);
        }
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to generate report', { reportId, type, error: errorMessage });

      return {
        id: reportId,
        name: reportName,
        type,
        format,
        generatedAt: new Date(),
        size: 0,
        rows: 0,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Schedule a report for future generation
   */
  async scheduleReport(
    configId: string,
    schedule: ReportSchedule,
    delivery: ReportDelivery
  ): Promise<ScheduledReport> {
    const config = reportConfigs.get(configId);
    if (!config) {
      throw new Error(`Report configuration not found: ${configId}`);
    }

    const scheduledReport: ScheduledReport = {
      id: this.generateId(),
      configId,
      status: 'pending'
    };

    scheduledReports.push(scheduledReport);

    // Schedule the job based on the frequency
    await this.scheduleJob(scheduledReport, config, schedule, delivery);

    logger.info('Report scheduled', {
      scheduledId: scheduledReport.id,
      configId,
      frequency: schedule.frequency
    });

    return scheduledReport;
  }

  /**
   * Schedule a job based on the frequency
   */
  private async scheduleJob(
    scheduledReport: ScheduledReport,
    config: ReportConfig,
    schedule: ReportSchedule,
    delivery: ReportDelivery
  ): Promise<void> {
    // For now, we'll schedule based on frequency
    // In production, use a proper job scheduler like Bull, Agenda, or node-cron
    
    let nextRun: Date;

    switch (schedule.frequency) {
      case 'daily':
        nextRun = this.getNextDailyRun(schedule.time, schedule.timezone);
        break;
      case 'weekly':
        nextRun = this.getNextWeeklyRun(schedule);
        break;
      case 'monthly':
        nextRun = this.getNextMonthlyRun(schedule);
        break;
      case 'custom':
        // For custom, we'd parse the cron expression
        // For now, just run once
        nextRun = new Date();
        break;
      default:
        nextRun = new Date();
    }

    // Set up the job to run at the scheduled time
    const delay = nextRun.getTime() - Date.now();
    
    if (delay > 0) {
      setTimeout(async () => {
        await this.runScheduledReport(scheduledReport, config, delivery);
      }, delay);
    } else {
      // Run immediately
      await this.runScheduledReport(scheduledReport, config, delivery);
    }
  }

  /**
   * Get next run time for daily schedule
   */
  private getNextDailyRun(time: string, timezone: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const nextRun = new Date();
    
    nextRun.setHours(hours, minutes, 0, 0);
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    return nextRun;
  }

  /**
   * Get next run time for weekly schedule
   */
  private getNextWeeklyRun(schedule: ReportSchedule): Date {
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const now = new Date();
    const nextRun = new Date();
    
    nextRun.setHours(hours, minutes, 0, 0);
    
    // Find the next day that matches
    const currentDay = now.getDay();
    const targetDays = schedule.daysOfWeek || [0]; // Default to Sunday
    
    let daysToAdd = 0;
    let found = false;
    
    for (let i = 1; i <= 7; i++) {
      const dayToCheck = (currentDay + i) % 7;
      if (targetDays.includes(dayToCheck)) {
        daysToAdd = i;
        found = true;
        break;
      }
    }
    
    if (!found) {
      daysToAdd = 7 - currentDay + targetDays[0];
    }
    
    nextRun.setDate(now.getDate() + daysToAdd);
    
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 7);
    }
    
    return nextRun;
  }

  /**
   * Get next run time for monthly schedule
   */
  private getNextMonthlyRun(schedule: ReportSchedule): Date {
    const [hours, minutes] = schedule.time.split(':').map(Number);
    const now = new Date();
    const nextRun = new Date();
    
    const targetDay = schedule.dayOfMonth || 1;
    const currentDay = now.getDate();
    
    if (currentDay < targetDay) {
      nextRun.setDate(targetDay);
    } else {
      // Next month
      nextRun.setMonth(now.getMonth() + 1, targetDay);
    }
    
    nextRun.setHours(hours, minutes, 0, 0);
    
    if (nextRun <= now) {
      nextRun.setMonth(nextRun.getMonth() + 1);
    }
    
    return nextRun;
  }

  /**
   * Run a scheduled report
   */
  private async runScheduledReport(
    scheduledReport: ScheduledReport,
    config: ReportConfig,
    delivery: ReportDelivery
  ): Promise<void> {
    scheduledReport.status = 'running';
    scheduledReport.startedAt = new Date();

    try {
      const result = await this.generateReport(
        config.type,
        config.format,
        config.filters,
        config.id
      );

      scheduledReport.status = 'completed';
      scheduledReport.completedAt = new Date();
      scheduledReport.result = result;

      // Deliver the report
      if (delivery) {
        await this.deliverReport(result, { ...config, delivery });
      }

      logger.info('Scheduled report completed', {
        scheduledId: scheduledReport.id,
        reportId: result.id,
        status: result.success ? 'success' : 'failed'
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      scheduledReport.status = 'failed';
      scheduledReport.completedAt = new Date();
      scheduledReport.error = errorMessage;

      logger.error('Scheduled report failed', {
        scheduledId: scheduledReport.id,
        error: errorMessage
      });
    }
  }

  /**
   * Deliver a report based on delivery configuration
   */
  private async deliverReport(result: ReportResult, config: ReportConfig & { delivery?: ReportDelivery }): Promise<void> {
    if (!result.success || !result.filePath) {
      logger.warn('Cannot deliver failed report', { reportId: result.id });
      return;
    }

    const delivery = config.delivery || {};

    // Send via email
    if (delivery.email && delivery.email.length > 0) {
      for (const email of delivery.email) {
        try {
          await emailService.sendReportEmail(
            email,
            config.name,
            await this.readReportFile(result.filePath),
            config.filters?.dateRange?.start?.toString() || '',
            config.filters?.dateRange?.end?.toString() || '',
            config.data?.propertyName
          );
          logger.info('Report emailed', { reportId: result.id, to: email });
        } catch (error) {
          logger.error('Failed to email report', {
            reportId: result.id,
            to: email,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    // Send via webhook
    if (delivery.webhook && delivery.webhook.length > 0) {
      for (const webhookUrl of delivery.webhook) {
        try {
          await webhookService.emitEvent('report.generated', {
            reportId: result.id,
            reportName: result.name,
            reportType: result.type,
            format: result.format,
            fileUrl: result.fileUrl,
            size: result.size,
            rows: result.rows,
            generatedAt: result.generatedAt.toISOString(),
            filters: config.filters
          });
          logger.info('Report webhooked', { reportId: result.id, url: webhookUrl });
        } catch (error) {
          logger.error('Failed to webhook report', {
            reportId: result.id,
            url: webhookUrl,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }

    // Send notification
    await notificationService.createNotification({
      type: 'report_ready',
      title: `Report Ready: ${result.name}`,
      message: `Your ${result.type} report has been generated and is ready.\n\nFormat: ${result.format}\nSize: ${result.size} bytes\nRows: ${result.rows}`,
      recipient: { email: delivery.email?.[0] },
      priority: 'normal',
      data: {
        reportId: result.id,
        reportName: result.name,
        reportType: result.type,
        format: result.format,
        filePath: result.filePath,
        size: result.size,
        rows: result.rows
      },
      sendEmail: false, // Already sent via email delivery
      sendSlack: true,
      sendWebhook: true,
      webhookEvent: 'report.ready'
    });
  }

  /**
   * Save report to file
   */
  private async saveReport(
    reportId: string,
    type: ReportType,
    format: ReportFormat,
    data: unknown,
    name: string
  ): Promise<string> {
    const safeName = name.toLowerCase().replace(/[^a-z0-9\-_]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${safeName}_${timestamp}_${reportId}.${format}`;
    const filePath = path.join(this.OUTPUT_DIR, filename);

    try {
      if (typeof data === 'string') {
        await fs.writeFile(filePath, data, 'utf8');
      } else {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
      }

      logger.info('Report saved to file', { filePath, size: data.length });
      return filePath;
    } catch (error) {
      logger.error('Failed to save report', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Read report file content
   */
  private async readReportFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      logger.error('Failed to read report file', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      return '';
    }
  }

  /**
   * Format data based on report format
   */
  private formatData(data: unknown, format: ReportFormat): string {
    switch (format) {
      case 'csv':
        return this.formatAsCSV(data);
      case 'excel':
        return this.formatAsExcel(data);
      case 'pdf':
        return this.formatAsPDF(data);
      case 'json':
        return JSON.stringify(data, null, 2);
      default:
        return JSON.stringify(data, null, 2);
    }
  }

  /**
   * Format data as CSV
   */
  private formatAsCSV(data: unknown): string {
    if (!Array.isArray(data)) {
      data = [data];
    }

    if (data.length === 0) {
      return '';
    }

    const firstItem = data[0] as Record<string, unknown>;
    const headers = Object.keys(firstItem);
    
    const lines: string[] = [
      headers.map(h => this.escapeCSV(h)).join(','),
      ...data.map(item => {
        const record = item as Record<string, unknown>;
        return headers.map(h => this.escapeCSV(String(record[h] || ''))).join(',');
      })
    ];

    return lines.join('\n');
  }

  /**
   * Escape CSV value
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Format data as Excel (simplified - in production use xlsx library)
   */
  private formatAsExcel(data: unknown): string {
    // For now, return CSV that can be imported into Excel
    return this.formatAsCSV(data);
  }

  /**
   * Format data as PDF (simplified - in production use pdfkit or similar)
   */
  private formatAsPDF(data: unknown): string {
    // For now, return JSON as PDF would require a library
    return JSON.stringify(data, null, 2);
  }

  /**
   * Count rows in data
   */
  private countRows(data: unknown): number {
    if (Array.isArray(data)) {
      return data.length;
    }
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        return obj.data.length;
      }
      return Object.keys(obj).length;
    }
    return 0;
  }

  // ============= Report Type Generators =============

  /**
   * Generate response analytics report
   */
  private async generateResponseAnalyticsReport(filters?: ReportFilter): Promise<unknown> {
    const repo = getRepository(ResponseEvent);
    
    let query = repo.createQueryBuilder('response');

    // Apply filters
    if (filters?.properties) {
      query = query.andWhere('response.property_id IN (:...properties)', {
        properties: filters.properties
      });
    }

    if (filters?.dateRange) {
      query = query.andWhere('response.first_seen_at BETWEEN :start AND :end', {
        start: filters.dateRange.start,
        end: filters.dateRange.end
      });
    }

    if (filters?.templates) {
      query = query.andWhere('response.template_id IN (:...templates)', {
        templates: filters.templates
      });
    }

    const events = await query.getMany();

    return events.map(event => ({
      id: event.id,
      propertyId: event.property_id,
      templateId: event.template_id,
      conversationHash: event.conversation_hash,
      firstSeenAt: event.first_seen_at,
      repliedAt: event.replied_at,
      responseTimeSeconds: event.replied_at 
        ? Math.floor((new Date(event.replied_at).getTime() - new Date(event.first_seen_at).getTime()) / 1000)
        : null
    }));
  }

  /**
   * Get response analytics columns
   */
  private getResponseAnalyticsColumns(): ReportColumn[] {
    return [
      { key: 'id', label: 'ID', type: 'string', sortable: true },
      { key: 'propertyId', label: 'Property ID', type: 'number', sortable: true },
      { key: 'templateId', label: 'Template ID', type: 'number', sortable: true },
      { key: 'conversationHash', label: 'Conversation Hash', type: 'string', sortable: false },
      { key: 'firstSeenAt', label: 'First Seen', type: 'date', sortable: true },
      { key: 'repliedAt', label: 'Replied At', type: 'date', sortable: true },
      { key: 'responseTimeSeconds', label: 'Response Time (s)', type: 'number', sortable: true }
    ];
  }

  /**
   * Get response analytics summary
   */
  private async getResponseAnalyticsSummary(filters?: ReportFilter): Promise<Record<string, unknown>> {
    const repo = getRepository(ResponseEvent);
    
    let query = repo.createQueryBuilder('response');

    if (filters?.properties) {
      query = query.andWhere('response.property_id IN (:...properties)', {
        properties: filters.properties
      });
    }

    if (filters?.dateRange) {
      query = query.andWhere('response.first_seen_at BETWEEN :start AND :end', {
        start: filters.dateRange.start,
        end: filters.dateRange.end
      });
    }

    const events = await query.getMany();
    
    const total = events.length;
    const withReplies = events.filter(e => e.replied_at);
    const responseTimes = withReplies.map(e => 
      (new Date(e.replied_at!).getTime() - new Date(e.first_seen_at).getTime()) / 1000
    );
    
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
    
    const medianResponseTime = responseTimes.length > 0
      ? this.calculateMedian(responseTimes)
      : 0;

    return {
      totalEvents: total,
      totalReplied: withReplies.length,
      replyRate: total > 0 ? Math.round((withReplies.length / total) * 100) : 0,
      avgResponseTimeSeconds: Math.round(avgResponseTime),
      medianResponseTimeSeconds: Math.round(medianResponseTime)
    };
  }

  /**
   * Calculate median
   */
  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  }

  /**
   * Generate template usage report
   */
  private async generateTemplateUsageReport(filters?: ReportFilter): Promise<unknown> {
    const repo = getRepository(ResponseEvent);
    
    let query = repo.createQueryBuilder('response')
      .select(['response.template_id', 'COUNT(*) as count'])
      .groupBy('response.template_id');

    if (filters?.properties) {
      query = query.andWhere('response.property_id IN (:...properties)', {
        properties: filters.properties
      });
    }

    if (filters?.dateRange) {
      query = query.andWhere('response.first_seen_at BETWEEN :start AND :end', {
        start: filters.dateRange.start,
        end: filters.dateRange.end
      });
    }

    const results = await query.getRawMany();

    return results.map(row => ({
      templateId: row.template_id,
      usageCount: parseInt(row.count, 10)
    }));
  }

  /**
   * Get template usage columns
   */
  private getTemplateUsageColumns(): ReportColumn[] {
    return [
      { key: 'templateId', label: 'Template ID', type: 'number', sortable: true },
      { key: 'usageCount', label: 'Usage Count', type: 'number', sortable: true }
    ];
  }

  /**
   * Get template usage summary
   */
  private async getTemplateUsageSummary(filters?: ReportFilter): Promise<Record<string, unknown>> {
    const usage = await this.generateTemplateUsageReport(filters);
    const total = (usage as Array<{ usageCount: number }>).reduce((sum, item) => sum + item.usageCount, 0);
    
    return {
      totalUsage: total,
      uniqueTemplates: usage.length,
      mostUsedTemplate: usage.length > 0 
        ? Math.max(...(usage as Array<{ usageCount: number }>).map(item => item.usageCount))
        : 0
    };
  }

  /**
   * Generate shift notes report
   */
  private async generateShiftNotesReport(filters?: ReportFilter): Promise<unknown> {
    const repo = getRepository(ShiftNote);
    
    let query = repo.createQueryBuilder('note');

    if (filters?.properties) {
      query = query.andWhere('note.property_id IN (:...properties)', {
        properties: filters.properties
      });
    }

    if (filters?.dateRange) {
      query = query.andWhere('note.created_at BETWEEN :start AND :end', {
        start: filters.dateRange.start,
        end: filters.dateRange.end
      });
    }

    if (filters?.users) {
      query = query.andWhere('note.user_id IN (:...users)', {
        users: filters.users
      });
    }

    const notes = await query.getMany();

    return notes.map(note => ({
      id: note.id,
      propertyId: note.property_id,
      userId: note.user_id,
      title: note.title,
      content: note.content,
      completed: note.completed,
      createdAt: note.created_at,
      updatedAt: note.updated_at
    }));
  }

  /**
   * Get shift notes columns
   */
  private getShiftNotesColumns(): ReportColumn[] {
    return [
      { key: 'id', label: 'ID', type: 'string', sortable: true },
      { key: 'propertyId', label: 'Property ID', type: 'number', sortable: true },
      { key: 'userId', label: 'User ID', type: 'number', sortable: true },
      { key: 'title', label: 'Title', type: 'string', sortable: true },
      { key: 'content', label: 'Content', type: 'string', sortable: false },
      { key: 'completed', label: 'Completed', type: 'boolean', sortable: true },
      { key: 'createdAt', label: 'Created At', type: 'date', sortable: true },
      { key: 'updatedAt', label: 'Updated At', type: 'date', sortable: true }
    ];
  }

  /**
   * Get shift notes summary
   */
  private async getShiftNotesSummary(filters?: ReportFilter): Promise<Record<string, unknown>> {
    const notes = await this.generateShiftNotesReport(filters) as Array<{ completed: boolean }>;
    const total = notes.length;
    const completed = notes.filter(n => n.completed).length;
    
    return {
      totalNotes: total,
      completedNotes: completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  /**
   * Generate escalation summary report
   */
  private async generateEscalationSummaryReport(filters?: ReportFilter): Promise<unknown> {
    const repo = getRepository(Escalation);
    
    let query = repo.createQueryBuilder('escalation');

    if (filters?.properties) {
      query = query.andWhere('escalation.property_id IN (:...properties)', {
        properties: filters.properties
      });
    }

    if (filters?.dateRange) {
      query = query.andWhere('escalation.created_at BETWEEN :start AND :end', {
        start: filters.dateRange.start,
        end: filters.dateRange.end
      });
    }

    if (filters?.priority) {
      query = query.andWhere('escalation.priority IN (:...priorities)', {
        priorities: filters.priority
      });
    }

    if (filters?.status) {
      query = query.andWhere('escalation.status IN (:...statuses)', {
        statuses: filters.status
      });
    }

    const escalations = await query.getMany();

    return escalations.map(escalation => ({
      id: escalation.id,
      propertyId: escalation.property_id,
      title: escalation.title,
      description: escalation.description,
      priority: escalation.priority,
      status: escalation.status,
      assignedTo: escalation.assigned_to,
      createdAt: escalation.created_at,
      updatedAt: escalation.updated_at,
      resolvedAt: escalation.resolved_at
    }));
  }

  /**
   * Get escalation summary columns
   */
  private getEscalationSummaryColumns(): ReportColumn[] {
    return [
      { key: 'id', label: 'ID', type: 'string', sortable: true },
      { key: 'propertyId', label: 'Property ID', type: 'number', sortable: true },
      { key: 'title', label: 'Title', type: 'string', sortable: true },
      { key: 'description', label: 'Description', type: 'string', sortable: false },
      { key: 'priority', label: 'Priority', type: 'string', sortable: true },
      { key: 'status', label: 'Status', type: 'string', sortable: true },
      { key: 'assignedTo', label: 'Assigned To', type: 'number', sortable: true },
      { key: 'createdAt', label: 'Created At', type: 'date', sortable: true },
      { key: 'updatedAt', label: 'Updated At', type: 'date', sortable: true },
      { key: 'resolvedAt', label: 'Resolved At', type: 'date', sortable: true }
    ];
  }

  /**
   * Get escalation summary
   */
  private async getEscalationSummary(filters?: ReportFilter): Promise<Record<string, unknown>> {
    const escalations = await this.generateEscalationSummaryReport(filters) as Array<{
      priority: string;
      status: string;
      createdAt: string;
      resolvedAt: string;
    }>;

    const byPriority: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let avgResolutionTime = 0;
    let resolutionCount = 0;

    escalations.forEach(e => {
      byPriority[e.priority] = (byPriority[e.priority] || 0) + 1;
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;

      if (e.resolvedAt && e.createdAt) {
        const resolutionTime = (new Date(e.resolvedAt).getTime() - new Date(e.createdAt).getTime()) / (1000 * 60 * 60); // hours
        avgResolutionTime += resolutionTime;
        resolutionCount++;
      }
    });

    return {
      totalEscalations: escalations.length,
      byPriority,
      byStatus,
      avgResolutionTimeHours: resolutionCount > 0 ? Math.round(avgResolutionTime / resolutionCount) : 0,
      openEscalations: byStatus['open'] || 0,
      resolvedEscalations: byStatus['resolved'] || 0
    };
  }

  /**
   * Generate user activity report
   */
  private async generateUserActivityReport(filters?: ReportFilter): Promise<unknown> {
    const repo = getRepository(ResponseEvent);
    
    let query = repo.createQueryBuilder('response')
      .select(['response.user_id', 'COUNT(*) as count'])
      .groupBy('response.user_id');

    if (filters?.properties) {
      query = query.andWhere('response.property_id IN (:...properties)', {
        properties: filters.properties
      });
    }

    if (filters?.dateRange) {
      query = query.andWhere('response.first_seen_at BETWEEN :start AND :end', {
        start: filters.dateRange.start,
        end: filters.dateRange.end
      });
    }

    const results = await query.getRawMany();

    return results.map(row => ({
      userId: row.user_id,
      activityCount: parseInt(row.count, 10)
    }));
  }

  /**
   * Get user activity columns
   */
  private getUserActivityColumns(): ReportColumn[] {
    return [
      { key: 'userId', label: 'User ID', type: 'number', sortable: true },
      { key: 'activityCount', label: 'Activity Count', type: 'number', sortable: true }
    ];
  }

  /**
   * Get user activity summary
   */
  private async getUserActivitySummary(filters?: ReportFilter): Promise<Record<string, unknown>> {
    const activity = await this.generateUserActivityReport(filters);
    const total = (activity as Array<{ activityCount: number }>).reduce((sum, item) => sum + item.activityCount, 0);
    
    return {
      totalActivity: total,
      uniqueUsers: activity.length,
      avgActivityPerUser: activity.length > 0 ? Math.round(total / activity.length) : 0
    };
  }

  /**
   * Generate property performance report
   */
  private async generatePropertyPerformanceReport(filters?: ReportFilter): Promise<unknown> {
    const repo = getRepository(ResponseEvent);
    
    let query = repo.createQueryBuilder('response')
      .select(['response.property_id', 'COUNT(*) as count', 'AVG(EXTRACT(EPOCH FROM (response.replied_at - response.first_seen_at))) as avg_response_time'])
      .groupBy('response.property_id');

    if (filters?.properties) {
      query = query.andWhere('response.property_id IN (:...properties)', {
        properties: filters.properties
      });
    }

    if (filters?.dateRange) {
      query = query.andWhere('response.first_seen_at BETWEEN :start AND :end', {
        start: filters.dateRange.start,
        end: filters.dateRange.end
      });
    }

    const results = await query.getRawMany();

    return results.map(row => ({
      propertyId: row.property_id,
      totalEvents: parseInt(row.count, 10),
      avgResponseTimeSeconds: row.avg_response_time ? Math.round(parseFloat(row.avg_response_time)) : null
    }));
  }

  /**
   * Get property performance columns
   */
  private getPropertyPerformanceColumns(): ReportColumn[] {
    return [
      { key: 'propertyId', label: 'Property ID', type: 'number', sortable: true },
      { key: 'totalEvents', label: 'Total Events', type: 'number', sortable: true },
      { key: 'avgResponseTimeSeconds', label: 'Avg Response Time (s)', type: 'number', sortable: true }
    ];
  }

  /**
   * Get property performance summary
   */
  private async getPropertyPerformanceSummary(filters?: ReportFilter): Promise<Record<string, unknown>> {
    const performance = await this.generatePropertyPerformanceReport(filters) as Array<{
      totalEvents: number;
      avgResponseTimeSeconds: number | null;
    }>;

    const totalEvents = performance.reduce((sum, item) => sum + item.totalEvents, 0);
    const validResponseTimes = performance
      .map(item => item.avgResponseTimeSeconds)
      .filter(Boolean) as number[];
    
    const avgResponseTime = validResponseTimes.length > 0
      ? validResponseTimes.reduce((a, b) => a + b, 0) / validResponseTimes.length
      : 0;

    return {
      totalEvents,
      propertiesWithData: performance.length,
      avgResponseTimeSeconds: Math.round(avgResponseTime)
    };
  }

  // ============= Utility Methods =============

  /**
   * Get report statistics
   */
  getStats(): ReportStats {
    const byType: Record<ReportType, number> = {
      response_analytics: 0,
      template_usage: 0,
      shift_notes: 0,
      escalation_summary: 0,
      user_activity: 0,
      property_performance: 0,
      custom: 0
    };

    const byFormat: Record<ReportFormat, number> = {
      csv: 0,
      excel: 0,
      pdf: 0,
      json: 0
    };

    const byStatus: Record<string, number> = {};

    generatedReports.forEach(result => {
      byType[result.type]++;
      byFormat[result.format]++;
      byStatus[result.success ? 'success' : 'failed'] = 
        (byStatus[result.success ? 'success' : 'failed'] || 0) + 1;
    });

    return {
      totalReports: generatedReports.size,
      scheduledReports: scheduledReports.filter(r => r.status === 'pending').length,
      byType,
      byFormat,
      pendingJobs: scheduledReports.filter(r => r.status === 'pending').length
    };
  }

  /**
   * Clear all reports (for testing)
   */
  clearAll(): void {
    reportConfigs.clear();
    scheduledReports.length = 0;
    generatedReports.clear();
    logger.info('All reports cleared');
  }
}

export const reportService = new ReportService();

// Re-export types for convenience
export type {
  ReportConfig,
  ReportSchedule,
  ReportFilter,
  ReportType,
  ReportFormat,
  ReportDelivery,
  ReportData,
  ReportResult,
  ScheduledReport,
  ReportColumn,
  ReportStats
};
