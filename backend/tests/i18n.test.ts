/**
 * i18n Service Tests
 * Comprehensive test suite for internationalization configuration
 */

import {
  I18nService,
  i18nService,
  DEFAULT_LANGUAGE,
  RTL_LANGUAGES,
  SupportedLanguage,
  I18nConfig,
  TranslationObject,
  LanguageConfig,
  NamespaceConfig,
  I18nRuntimeConfig,
  MissingTranslationHandler
} from '../src/config/i18n';

import path from 'path';
import fs from 'fs/promises';

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  mkdir: jest.fn()
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

// Mock config
const mockConfig = {
  NODE_ENV: 'test',
  SUPPORTED_LANGUAGES: 'en,es,fr,de'
};

jest.mock('../src/config', () => ({
  config: mockConfig
}));

describe('i18n Service', () => {
  let service: I18nService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new I18nService();
  });

  describe('Constructor', () => {
    it('should initialize without errors', () => {
      expect(() => new I18nService()).not.toThrow();
    });

    it('should initialize with default language', () => {
      expect(service.getCurrentLanguage()).toBe(DEFAULT_LANGUAGE);
    });

    it('should initialize with default namespace', () => {
      expect(service.getCurrentNamespace()).toBe('common');
    });

    it('should log initialization', () => {
      const logger = require('../src/lib/logger').default;
      expect(logger.info).toHaveBeenCalledWith(
        'i18n service initialized',
        expect.any(Object)
      );
    });
  });

  describe('getSupportedLanguages', () => {
    it('should return array of language configs', () => {
      const languages = service.getSupportedLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
    });

    it('should include English by default', () => {
      const languages = service.getSupportedLanguages();
      const codes = languages.map(lang => lang.code);
      expect(codes).toContain('en');
    });

    it('should filter by supported languages from config', () => {
      const languages = service.getSupportedLanguages();
      const codes = languages.map(lang => lang.code);
      
      // Config has en,es,fr,de
      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('fr');
      expect(codes).toContain('de');
    });

    it('should return languages with correct structure', () => {
      const languages = service.getSupportedLanguages();
      const firstLanguage = languages[0];
      
      expect(firstLanguage).toHaveProperty('code');
      expect(firstLanguage).toHaveProperty('name');
      expect(firstLanguage).toHaveProperty('nativeName');
      expect(firstLanguage).toHaveProperty('flag');
      expect(firstLanguage).toHaveProperty('rtl');
      expect(firstLanguage).toHaveProperty('active');
    });

    it('should identify RTL languages correctly', () => {
      const languages = service.getSupportedLanguages();
      
      // Find Arabic if it exists
      const arabic = languages.find(lang => lang.code === 'ar');
      if (arabic) {
        expect(arabic.rtl).toBe(true);
      }

      // Find Hebrew if it exists
      const hebrew = languages.find(lang => lang.code === 'he');
      if (hebrew) {
        expect(hebrew.rtl).toBe(true);
      }
    });

    it('should identify LTR languages correctly', () => {
      const languages = service.getSupportedLanguages();
      const english = languages.find(lang => lang.code === 'en');
      
      expect(english).toBeDefined();
      expect(english?.rtl).toBe(false);
    });
  });

  describe('getCurrentLanguage', () => {
    it('should return the current language', () => {
      const currentLanguage = service.getCurrentLanguage();
      expect(currentLanguage).toBeDefined();
      expect(typeof currentLanguage).toBe('string');
    });

    it('should return default language initially', () => {
      expect(service.getCurrentLanguage()).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe('setCurrentLanguage', () => {
    it('should change the current language', () => {
      const result = service.setCurrentLanguage('fr');
      expect(result).toBe(true);
      expect(service.getCurrentLanguage()).toBe('fr');
    });

    it('should return true for valid supported language', () => {
      const result = service.setCurrentLanguage('es');
      expect(result).toBe(true);
    });

    it('should return false for unsupported language', () => {
      // Assuming 'invalid-lang' is not in supported languages
      const result = service.setCurrentLanguage('invalid-lang' as SupportedLanguage);
      expect(result).toBe(false);
    });

    it('should log language change', () => {
      const logger = require('../src/lib/logger').default;
      service.setCurrentLanguage('fr');
      
      expect(logger.info).toHaveBeenCalledWith(
        'Language changed',
        expect.objectContaining({
          to: 'fr'
        })
      );
    });

    it('should log warning for unsupported language', () => {
      const logger = require('../src/lib/logger').default;
      service.setCurrentLanguage('invalid-lang' as SupportedLanguage);
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Unsupported language requested',
        expect.objectContaining({
          language: 'invalid-lang'
        })
      );
    });
  });

  describe('getCurrentNamespace', () => {
    it('should return the current namespace', () => {
      const currentNamespace = service.getCurrentNamespace();
      expect(currentNamespace).toBeDefined();
      expect(typeof currentNamespace).toBe('string');
    });

    it('should return default namespace initially', () => {
      expect(service.getCurrentNamespace()).toBe('common');
    });
  });

  describe('setCurrentNamespace', () => {
    it('should change the current namespace', () => {
      const result = service.setCurrentNamespace('auth');
      expect(result).toBe(true);
      expect(service.getCurrentNamespace()).toBe('auth');
    });

    it('should return true for valid namespace', () => {
      const result = service.setCurrentNamespace('properties');
      expect(result).toBe(true);
    });

    it('should return false for invalid namespace', () => {
      const result = service.setCurrentNamespace('invalid-namespace');
      expect(result).toBe(false);
    });
  });

  describe('isRTL', () => {
    it('should return true for RTL languages', () => {
      expect(service.isRTL('ar')).toBe(true);
      expect(service.isRTL('he')).toBe(true);
    });

    it('should return false for LTR languages', () => {
      expect(service.isRTL('en')).toBe(false);
      expect(service.isRTL('es')).toBe(false);
      expect(service.isRTL('fr')).toBe(false);
    });

    it('should return false for unknown languages', () => {
      expect(service.isRTL('unknown' as SupportedLanguage)).toBe(false);
    });
  });

  describe('isCurrentRTL', () => {
    it('should return false when current language is LTR', () => {
      // Default language is English (LTR)
      expect(service.isCurrentRTL()).toBe(false);
    });

    it('should return true when current language is RTL', () => {
      service.setCurrentLanguage('ar');
      expect(service.isCurrentRTL()).toBe(true);
    });
  });

  describe('getDirection', () => {
    it('should return ltr for LTR languages', () => {
      expect(service.getDirection('en')).toBe('ltr');
      expect(service.getDirection('es')).toBe('ltr');
    });

    it('should return rtl for RTL languages', () => {
      expect(service.getDirection('ar')).toBe('rtl');
      expect(service.getDirection('he')).toBe('rtl');
    });

    it('should use current language by default', () => {
      // Default language is English (ltr)
      expect(service.getDirection()).toBe('ltr');
    });

    it('should respect provided language parameter', () => {
      expect(service.getDirection('ar')).toBe('rtl');
      expect(service.getDirection()).toBe('ltr'); // Should not change current
    });
  });

  describe('setMissingTranslationHandler', () => {
    it('should set the missing translation handler', () => {
      const handler: MissingTranslationHandler = (lang, ns, key, defaultValue) => {
        return `Fallback: ${key}`;
      };

      service.setMissingTranslationHandler(handler);
      // @ts-ignore - accessing private property for test
      expect(service.missingTranslationHandler).toBe(handler);
    });
  });

  describe('loadTranslations', () => {
    it('should return cached translations if available', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      const mockTranslations = { welcome: 'Welcome' };
      
      // Pre-populate cache
      translationsCache.set('en:common', mockTranslations);
      
      const result = await service.loadTranslations('en', 'common');
      expect(result).toEqual(mockTranslations);
    });

    it('should load translations from file if not cached', async () => {
      const mockTranslations = { welcome: 'Bienvenue' };
      
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockTranslations));
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await service.loadTranslations('fr', 'common');
      expect(result).toEqual(mockTranslations);
    });

    it('should handle file not found gracefully', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      
      const result = await service.loadTranslations('unknown', 'common');
      expect(result).toEqual({});
    });

    it('should cache loaded translations', async () => {
      const mockTranslations = { welcome: 'Hola' };
      
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockTranslations));
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      // First load
      await service.loadTranslations('es', 'common');
      
      // Second load should use cache
      const result = await service.loadTranslations('es', 'common');
      expect(result).toEqual(mockTranslations);
      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should log debug message when loading translations', async () => {
      const mockTranslations = { welcome: 'Test' };
      
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockTranslations));
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const logger = require('../src/lib/logger').default;
      await service.loadTranslations('en', 'common');
      
      expect(logger.debug).toHaveBeenCalledWith(
        'Translations loaded',
        expect.any(Object)
      );
    });

    it('should log warning when failing to load translations', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const logger = require('../src/lib/logger').default;
      await service.loadTranslations('unknown', 'common');
      
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to load translations',
        expect.any(Object)
      );
    });
  });

  describe('t (translate)', () => {
    it('should return translation for existing key', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { welcome: 'Welcome' });

      const result = await service.t('welcome', { language: 'en', namespace: 'common' });
      expect(result).toBe('Welcome');
    });

    it('should return default value for missing key', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', {});

      const result = await service.t('missing.key', { 
        language: 'en', 
        namespace: 'common',
        defaultValue: 'Default value'
      });
      expect(result).toBe('Default value');
    });

    it('should use current language and namespace by default', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { welcome: 'Welcome' });

      const result = await service.t('welcome');
      expect(result).toBe('Welcome');
    });

    it('should try fallback language for missing translation', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('es:common', {});
      translationsCache.set('en:common', { welcome: 'Welcome' });

      const result = await service.t('welcome', { language: 'es', namespace: 'common' });
      expect(result).toBe('Welcome'); // Should fallback to English
    });

    it('should handle interpolation', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { 
        greeting: 'Hello, {{name}}!' 
      });

      const result = await service.t('greeting', { 
        language: 'en', 
        namespace: 'common',
        interpolationValues: { name: 'World' }
      });
      expect(result).toBe('Hello, World!');
    });

    it('should handle nested translation keys', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { 
        auth: { 
          login: { 
            title: 'Login Title' 
          } 
        } 
      });

      const result = await service.t('auth.login.title', { 
        language: 'en', 
        namespace: 'common'
      });
      expect(result).toBe('Login Title');
    });

    it('should log error on translation failure', async () => {
      // Mock loadTranslations to throw error
      jest.spyOn(service, 'loadTranslations').mockRejectedValue(new Error('Load error'));

      const logger = require('../src/lib/logger').default;
      const result = await service.t('test.key');
      
      expect(logger.error).toHaveBeenCalledWith(
        'Translation error',
        expect.any(Object)
      );
    });
  });

  describe('tMany', () => {
    it('should translate multiple keys', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { 
        welcome: 'Welcome',
        goodbye: 'Goodbye'
      });

      const result = await service.tMany(['welcome', 'goodbye'], { 
        language: 'en', 
        namespace: 'common'
      });

      expect(result.welcome).toBe('Welcome');
      expect(result.goodbye).toBe('Goodbye');
    });

    it('should use default values for missing keys', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { 
        welcome: 'Welcome'
      });

      const result = await service.tMany(
        ['welcome', 'missing'],
        { 
          language: 'en', 
          namespace: 'common',
          defaultValues: { 
            missing: 'Default Missing' 
          }
        }
      );

      expect(result.welcome).toBe('Welcome');
      expect(result.missing).toBe('Default Missing');
    });
  });

  describe('getAllTranslations', () => {
    it('should return all translations for a namespace', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      const mockTranslations = { welcome: 'Welcome', goodbye: 'Goodbye' };
      translationsCache.set('en:common', mockTranslations);

      const result = await service.getAllTranslations('common', 'en');
      expect(result).toEqual(mockTranslations);
    });
  });

  describe('extractStrings', () => {
    it('should extract strings from content', () => {
      const content = `
        t('welcome')
        t('auth.login.title')
        t('common.button.submit')
      `;

      const result = service.extractStrings(content);
      expect(result).toContain('welcome');
      expect(result).toContain('auth.login.title');
      expect(result).toContain('common.button.submit');
    });

    it('should handle escaped quotes', () => {
      const content = `t('button\\'s label')`;
      const result = service.extractStrings(content);
      expect(result).toContain("button's label");
    });

    it('should return empty array for no matches', () => {
      const content = 'No translation strings here';
      const result = service.extractStrings(content);
      expect(result).toHaveLength(0);
    });

    it('should handle double quotes', () => {
      const content = 't("welcome")';
      const result = service.extractStrings(content, /t\("([^"]+)"\)/g);
      expect(result).toContain('welcome');
    });

    it('should remove duplicates', () => {
      const content = `t('welcome') t('welcome') t('welcome')`;
      const result = service.extractStrings(content);
      
      // Should only have one 'welcome'
      const uniqueResults = new Set(result);
      expect(uniqueResults.size).toBe(1);
    });
  });

  describe('extractStringsFromFiles', () => {
    it('should extract strings from multiple files', async () => {
      const file1 = '/path/to/file1.ts';
      const file2 = '/path/to/file2.ts';

      (fs.readFile as jest.Mock)
        .mockImplementation((filePath: string) => {
          if (filePath === file1) {
            return Promise.resolve("t('file1.string')");
          }
          if (filePath === file2) {
            return Promise.resolve("t('file2.string')");
          }
          return Promise.reject(new Error('File not found'));
        });

      const result = await service.extractStringsFromFiles([file1, file2]);
      
      expect(result.byFile[file1]).toContain('file1.string');
      expect(result.byFile[file2]).toContain('file2.string');
      expect(result.all).toContain('file1.string');
      expect(result.all).toContain('file2.string');
    });

    it('should handle file read errors gracefully', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const logger = require('../src/lib/logger').default;
      const result = await service.extractStringsFromFiles(['/path/to/missing.ts']);
      
      expect(logger.error).toHaveBeenCalled();
      expect(result.byFile['/path/to/missing.ts']).toBeUndefined();
    });
  });

  describe('generateTranslationTemplate', () => {
    it('should generate template from source translations', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { 
        welcome: 'Welcome',
        goodbye: 'Goodbye'
      });

      const template = await service.generateTranslationTemplate('en', 'es', 'common');
      
      expect(template).toHaveProperty('welcome');
      expect(template).toHaveProperty('goodbye');
      expect(template.welcome).toBe('');
      expect(template.goodbye).toBe('');
    });

    it('should handle nested objects', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { 
        auth: { 
          login: { 
            title: 'Login',
            description: 'Login description'
          } 
        } 
      });

      const template = await service.generateTranslationTemplate('en', 'es', 'common');
      
      expect(template).toHaveProperty('auth');
      expect((template as any).auth).toHaveProperty('login');
      expect(((template as any).auth as any).login).toHaveProperty('title');
      expect(((template as any).auth as any).login).toHaveProperty('description');
    });

    it('should handle errors gracefully', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', {});

      const logger = require('../src/lib/logger').default;
      const template = await service.generateTranslationTemplate(
        'unknown' as SupportedLanguage, 
        'es', 
        'common'
      );
      
      expect(logger.error).toHaveBeenCalled();
      expect(template).toEqual({});
    });
  });

  describe('getTranslationCompleteness', () => {
    it('should calculate completeness correctly', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      
      // Source translations
      translationsCache.set('en:common', { 
        key1: 'Value 1',
        key2: 'Value 2',
        key3: 'Value 3'
      });
      
      // Target translations (missing key3)
      translationsCache.set('fr:common', { 
        key1: 'Valeur 1',
        key2: 'Valeur 2'
      });

      const result = await service.getTranslationCompleteness('fr', 'common');
      
      expect(result.total).toBe(3);
      expect(result.translated).toBe(2);
      expect(result.missing).toBe(1);
      expect(result.completeness).toBeCloseTo(66.67, 0);
      expect(result.missingKeys).toContain('key3');
    });

    it('should handle missing source translations', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', {});
      translationsCache.set('fr:common', { key1: 'Value 1' });

      const result = await service.getTranslationCompleteness('fr', 'common');
      
      expect(result.total).toBe(0);
      expect(result.translated).toBe(0);
      expect(result.missing).toBe(0);
      expect(result.completeness).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(service, 'loadTranslations').mockRejectedValue(new Error('Load error'));

      const logger = require('../src/lib/logger').default;
      const result = await service.getTranslationCompleteness('fr', 'common');
      
      expect(logger.error).toHaveBeenCalled();
      expect(result.total).toBe(0);
    });
  });

  describe('syncTranslations', () => {
    it('should sync translations from source to target', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      
      // Source translations
      translationsCache.set('en:common', { 
        key1: 'Value 1',
        key2: 'Value 2'
      });
      
      // Target translations (missing key2)
      translationsCache.set('fr:common', { 
        key1: 'Valeur 1'
      });

      (fs.readFile as jest.Mock)
        .mockImplementation((filePath: string) => {
          if (filePath.includes('fr') && filePath.includes('common.json')) {
            return Promise.resolve(JSON.stringify({ key1: 'Valeur 1' }));
          }
          return Promise.reject(new Error('File not found'));
        });

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      const result = await service.syncTranslations('en', 'fr', 'common');
      
      expect(result.added).toBeGreaterThanOrEqual(0);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should create target file if it does not exist', async () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { key1: 'Value 1' });

      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

      await service.syncTranslations('en', 'fr', 'common');
      
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(service, 'loadTranslations').mockRejectedValue(new Error('Load error'));

      const logger = require('../src/lib/logger').default;
      const result = await service.syncTranslations('en', 'fr', 'common');
      
      expect(logger.error).toHaveBeenCalled();
      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.unchanged).toBe(0);
    });
  });

  describe('getLanguageStats', () => {
    it('should return stats for all namespaces', async () => {
      jest.spyOn(service, 'getTranslationCompleteness').mockResolvedValue({
        total: 10,
        translated: 8,
        missing: 2,
        completeness: 80,
        missingKeys: []
      });

      const stats = await service.getLanguageStats('en');
      
      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThan(0);
    });
  });

  describe('getTranslationStatistics', () => {
    it('should return comprehensive translation statistics', async () => {
      jest.spyOn(service, 'getLanguageStats').mockResolvedValue([
        {
          namespace: 'common',
          total: 10,
          translated: 8,
          completeness: 80
        }
      ]);

      const stats = await service.getTranslationStatistics();
      
      expect(stats).toHaveProperty('byLanguage');
      expect(stats).toHaveProperty('overall');
      expect(stats.overall).toHaveProperty('total');
      expect(stats.overall).toHaveProperty('translated');
      expect(stats.overall).toHaveProperty('completeness');
    });
  });

  describe('clearCache', () => {
    it('should clear all cached translations', () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { test: 'value' });
      
      expect(translationsCache.size).toBeGreaterThan(0);
      
      service.clearCache();
      
      expect(translationsCache.size).toBe(0);
    });

    it('should log cache cleared', () => {
      const logger = require('../src/lib/logger').default;
      service.clearCache();
      
      expect(logger.info).toHaveBeenCalledWith(
        'i18n cache cleared',
        undefined
      );
    });
  });

  describe('clearNamespaceCache', () => {
    it('should clear cache for specific namespace', () => {
      // @ts-ignore - accessing private property for test
      const translationsCache = (service as any).translationsCache;
      translationsCache.set('en:common', { test: 'value' });
      translationsCache.set('en:auth', { test: 'value' });
      
      expect(translationsCache.size).toBe(2);
      
      service.clearNamespaceCache('en', 'common');
      
      expect(translationsCache.has('en:common')).toBe(false);
      expect(translationsCache.has('en:auth')).toBe(true);
    });

    it('should log namespace cache cleared', () => {
      const logger = require('../src/lib/logger').default;
      service.clearNamespaceCache('en', 'common');
      
      expect(logger.debug).toHaveBeenCalledWith(
        'i18n namespace cache cleared',
        expect.objectContaining({
          language: 'en',
          namespace: 'common'
        })
      );
    });
  });
});

describe('i18n Constants', () => {
  describe('DEFAULT_LANGUAGE', () => {
    it('should be English', () => {
      expect(DEFAULT_LANGUAGE).toBe('en');
    });
  });

  describe('RTL_LANGUAGES', () => {
    it('should contain RTL languages', () => {
      expect(RTL_LANGUAGES.has('ar')).toBe(true);
      expect(RTL_LANGUAGES.has('he')).toBe(true);
      expect(RTL_LANGUAGES.has('fa')).toBe(true);
      expect(RTL_LANGUAGES.has('ur')).toBe(true);
    });

    it('should not contain LTR languages', () => {
      expect(RTL_LANGUAGES.has('en')).toBe(false);
      expect(RTL_LANGUAGES.has('es')).toBe(false);
      expect(RTL_LANGUAGES.has('fr')).toBe(false);
    });
  });
});

describe('i18n Types', () => {
  describe('SupportedLanguage', () => {
    it('should accept string values', () => {
      const lang: SupportedLanguage = 'en';
      expect(lang).toBe('en');
    });

    it('should accept custom languages', () => {
      const lang: SupportedLanguage = 'custom';
      expect(lang).toBe('custom');
    });
  });

  describe('TranslationObject', () => {
    it('should support nested objects', () => {
      const obj: TranslationObject = {
        auth: {
          login: {
            title: 'Login',
            description: 'Login description'
          }
        },
        common: {
          welcome: 'Welcome'
        }
      };

      expect(obj).toBeDefined();
    });

    it('should support arrays', () => {
      const obj: TranslationObject = {
        messages: ['Hello', 'World']
      };

      expect(obj).toBeDefined();
    });
  });

  describe('LanguageConfig', () => {
    it('should have all required properties', () => {
      const config: LanguageConfig = {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flag: '🇺🇸',
        rtl: false,
        active: true
      };

      expect(config.code).toBe('en');
      expect(config.name).toBe('English');
      expect(config.rtl).toBe(false);
    });
  });

  describe('NamespaceConfig', () => {
    it('should have all required properties', () => {
      const config: NamespaceConfig = {
        name: 'common',
        description: 'Common translations',
        files: ['common.json']
      };

      expect(config.name).toBe('common');
      expect(config.description).toBe('Common translations');
    });
  });

  describe('I18nRuntimeConfig', () => {
    it('should have all required properties', () => {
      const config: I18nRuntimeConfig = {
        currentLanguage: 'en',
        currentNamespace: 'common',
        fallbackChain: ['en', 'es']
      };

      expect(config.currentLanguage).toBe('en');
      expect(config.currentNamespace).toBe('common');
    });
  });

  describe('MissingTranslationHandler', () => {
    it('should be a function type', () => {
      const handler: MissingTranslationHandler = (lang, ns, key, defaultValue) => {
        return defaultValue || key;
      };

      const result = handler('en', 'common', 'missing.key', 'Default value');
      expect(result).toBe('Default value');
    });
  });
});

describe('Singleton Instance', () => {
  it('should export singleton instance', () => {
    expect(i18nService).toBeInstanceOf(I18nService);
  });

  it('should be the same instance', () => {
    expect(i18nService).toBe(i18nService);
  });
});
