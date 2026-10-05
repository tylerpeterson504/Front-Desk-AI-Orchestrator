import { ReportService, reportService, ReportConfig, ReportFilter, ReportType } from '../src/services/reportService';
import { config } from '../src/config';
import logger from '../src/lib/logger';
import path from 'path';
import fs from 'fs/promises';

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

// Mock emailService
jest.mock('../src/services/emailService', () => ({
  emailService: {
    sendReportEmail: jest.fn().mockResolvedValue({ success: true }),
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

// Mock notificationService
jest.mock('../src/services/notificationService', () => ({
  notificationService: {
    createNotification: jest.fn().mockResolvedValue({ success: true })
  }
}));

// Mock typeorm
jest.mock('typeorm', () => ({
  ...jest.requireActual('typeorm'),
  getRepository: jest.fn(() => ({
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
      getOne: jest.fn().mockResolvedValue(null)
    }))
  }))
}));

// Mock fs for file operations
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue('test content')
}));

describe('ReportService', () => {
  let service: ReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton state
    service = new ReportService();
    
    // Mock configuration
    Object.assign(config, {
      NODE_ENV: 'test'
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    service.clearAll();
  });

  describe('Constructor', () => {
    it('should initialize without errors', () => {
      expect(() => new ReportService()).not.toThrow();
    });
  });

  describe('createConfig', () => {
    it('should create a new report configuration', () => {
      const configData = {
        name: 'Test Report',
        type: 'response_analytics' as const,
        description: 'Test description',
        format: 'csv' as const,
        delivery: {}
      };
      
      const created = service.createConfig(configData);
      
      expect(created.id).toBeDefined();
      expect(created.name).toBe('Test Report');
      expect(created.type).toBe('response_analytics');
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
      expect(created.isActive).toBe(true);
    });

    it('should generate unique IDs', () => {
      const config1 = service.createConfig({
        name: 'Report 1',
        type: 'response_analytics' as const,
        description: 'Description 1',
        format: 'csv' as const,
        delivery: {}
      });
      
      const config2 = service.createConfig({
        name: 'Report 2',
        type: 'response_analytics' as const,
        description: 'Description 2',
        format: 'csv' as const,
        delivery: {}
      });
      
      expect(config1.id).not.toBe(config2.id);
    });
  });

  describe('getConfig', () => {
    it('should return configuration by ID', () => {
      const config = service.createConfig({
        name: 'Test Report',
        type: 'response_analytics' as const,
        description: 'Test description',
        format: 'csv' as const,
        delivery: {}
      });
      
      const retrieved = service.getConfig(config.id);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Test Report');
    });

    it('should return null for non-existing config', () => {
      const result = service.getConfig('non-existing-id');
      
      expect(result).toBeNull();
    });
  });

  describe('listConfigs', () => {
    it('should return all configurations sorted by creation date', () => {
      const config1 = service.createConfig({
        name: 'Report 1',
        type: 'response_analytics' as const,
        description: 'Description 1',
        format: 'csv' as const,
        delivery: {}
      });
      
      const config2 = service.createConfig({
        name: 'Report 2',
        type: 'template_usage' as const,
        description: 'Description 2',
        format: 'json' as const,
        delivery: {}
      });
      
      const configs = service.listConfigs();
      
      expect(configs).toHaveLength(2);
      // Most recent first
      expect(configs[0].id).toBe(config2.id);
      expect(configs[1].id).toBe(config1.id);
    });

    it('should return empty array when no configs', () => {
      const configs = service.listConfigs();
      
      expect(configs).toEqual([]);
    });
  });

  describe('updateConfig', () => {
    it('should update an existing configuration', () => {
      const config = service.createConfig({
        name: 'Original Name',
        type: 'response_analytics' as const,
        description: 'Original description',
        format: 'csv' as const,
        delivery: {}
      });
      
      const updated = service.updateConfig(config.id, {
        name: 'Updated Name',
        description: 'Updated description',
        format: 'json'
      });
      
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.format).toBe('json');
      expect(updated?.updatedAt).not.toBe(config.updatedAt);
    });

    it('should return null for non-existing config', () => {
      const result = service.updateConfig('non-existing-id', {
        name: 'Updated Name'
      });
      
      expect(result).toBeNull();
    });
  });

  describe('deleteConfig', () => {
    it('should delete a configuration', () => {
      const config = service.createConfig({
        name: 'Test Report',
        type: 'response_analytics' as const,
        description: 'Test description',
        format: 'csv' as const,
        delivery: {}
      });
      
      const deleted = service.deleteConfig(config.id);
      
      expect(deleted).toBe(true);
      expect(service.getConfig(config.id)).toBeNull();
    });

    it('should return false for non-existing config', () => {
      const result = service.deleteConfig('non-existing-id');
      
      expect(result).toBe(false);
    });
  });

  describe('generateReport', () => {
    it('should generate a report successfully', async () => {
      const result = await service.generateReport(
        'response_analytics',
        'csv',
        {}
      );
      
      expect(result.id).toBeDefined();
      expect(result.name).toBe('response_analytics');
      expect(result.type).toBe('response_analytics');
      expect(result.format).toBe('csv');
      expect(result.success).toBe(true);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should use config name when configId is provided', async () => {
      const config = service.createConfig({
        name: 'Custom Report Name',
        type: 'response_analytics' as const,
        description: 'Test description',
        format: 'csv' as const,
        delivery: {}
      });
      
      const result = await service.generateReport(
        'response_analytics',
        'csv',
        {},
        config.id
      );
      
      expect(result.name).toBe('Custom Report Name');
    });

    it('should handle different report types', async () => {
      const reportTypes: ReportType[] = [
        'response_analytics',
        'template_usage',
        'shift_notes',
        'escalation_summary',
        'user_activity',
        'property_performance'
      ];
      
      for (const type of reportTypes) {
        const result = await service.generateReport(type, 'json');
        expect(result.success).toBe(true);
        expect(result.type).toBe(type);
      }
    });

    it('should handle different report formats', async () => {
      const formats = ['csv', 'excel', 'pdf', 'json'];
      
      for (const format of formats) {
        const result = await service.generateReport(
          'response_analytics',
          format as any
        );
        expect(result.success).toBe(true);
        expect(result.format).toBe(format);
      }
    });

    it('should handle filters', async () => {
      const filters: ReportFilter = {
        properties: [1, 2, 3],
        dateRange: {
          start: '2026-01-01',
          end: '2026-12-31'
        },
        templates: [1, 2],
        users: [1, 2, 3]
      };
      
      const result = await service.generateReport(
        'response_analytics',
        'csv',
        filters
      );
      
      expect(result.success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      // Mock getRepository to throw an error
      const typeorm = require('typeorm');
      typeorm.getRepository.mockImplementationOnce(() => {
        throw new Error('Database error');
      });
      
      const result = await service.generateReport(
        'response_analytics',
        'csv'
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('formatAsCSV', () => {
    it('should format array data as CSV', () => {
      // @ts-ignore - accessing private method for test
      const csv = service.formatAsCSV([
        { name: 'John', age: 30, city: 'NYC' },
        { name: 'Jane', age: 25, city: 'LA' }
      ]);
      
      expect(csv).toContain('name,age,city');
      expect(csv).toContain('John,30,NYC');
      expect(csv).toContain('Jane,25,LA');
    });

    it('should handle empty array', () => {
      // @ts-ignore - accessing private method for test
      const csv = service.formatAsCSV([]);
      
      expect(csv).toBe('');
    });

    it('should handle objects with nested properties', () => {
      // @ts-ignore - accessing private method for test
      const csv = service.formatAsCSV([
        { id: 1, data: { value: 'test' } }
      ]);
      
      expect(csv).toContain('id,data');
    });

    it('should escape CSV special characters', () => {
      // @ts-ignore - accessing private method for test
      const csv = service.formatAsCSV([
        { name: 'John, Doe', description: 'Contains "quotes"' }
      ]);
      
      expect(csv).toContain('"John, Doe"');
      expect(csv).toContain('"Contains ""quotes"""');
    });
  });

  describe('getStats', () => {
    it('should return report statistics', () => {
      service.createConfig({
        name: 'Report 1',
        type: 'response_analytics' as const,
        description: 'Description 1',
        format: 'csv' as const,
        delivery: {}
      });
      
      service.createConfig({
        name: 'Report 2',
        type: 'template_usage' as const,
        description: 'Description 2',
        format: 'json' as const,
        delivery: {}
      });
      
      const stats = service.getStats();
      
      expect(stats.totalReports).toBe(0); // No reports generated yet
      expect(stats.byType.response_analytics).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all report configurations', () => {
      service.createConfig({
        name: 'Report 1',
        type: 'response_analytics' as const,
        description: 'Description 1',
        format: 'csv' as const,
        delivery: {}
      });
      
      service.clearAll();
      
      expect(service.listConfigs()).toHaveLength(0);
    });
  });
});

// Test singleton instance
describe('reportService singleton', () => {
  it('should export a singleton instance', () => {
    expect(reportService).toBeInstanceOf(ReportService);
  });

  it('should be the same instance when imported multiple times', () => {
    const { reportService: instance1 } = require('../src/services/reportService');
    const { reportService: instance2 } = require('../src/services/reportService');
    
    expect(instance1).toBe(instance2);
  });
});
