/**
 * Internationalization (i18n) configuration
 * Provides multi-language support for the Front Desk AI Orchestrator
 * Uses react-i18next for frontend and custom backend i18n
 */

import path from 'path';
import fs from 'fs/promises';
import logger from '../lib/logger';
import { config } from './index';

// Supported languages
export type SupportedLanguage = 
  | 'en'    // English
  | 'es'    // Spanish
  | 'fr'    // French
  | 'de'    // German
  | 'it'    // Italian
  | 'pt'    // Portuguese
  | 'nl'    // Dutch
  | 'ru'    // Russian
  | 'zh'    // Chinese
  | 'ja'    // Japanese
  | 'ar'    // Arabic (RTL)
  | 'he'    // Hebrew (RTL)
  | string; // Allow custom languages

// Default language
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

// RTL (Right-to-Left) languages
export const RTL_LANGUAGES: Set<SupportedLanguage> = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * i18n Configuration
 */
export interface I18nConfig {
  enabled: boolean;
  defaultLanguage: SupportedLanguage;
  fallbackLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  localesPath: string;
  namespaces: string[];
  defaultNamespace: string;
  interpolation: {
    escapeValue: boolean;
    prefix: string;
    suffix: string;
  };
  detection: {
    order: ('querystring' | 'cookie' | 'localStorage' | 'navigator' | 'htmlTag' | 'path' | 'subdomain')[];
    caches: ('cookie' | 'localStorage')[];
    lookupQuerystring: string;
    lookupCookie: string;
    lookupLocalStorage: string;
    cookieOptions: {
      path: string;
      sameSite: 'strict' | 'lax' | 'none';
      secure?: boolean;
    };
  };
  backend: {
    loadPath: string;
    addPath: string;
  };
  saveMissing: boolean;
  returnEmptyString: boolean;
  returnNull: boolean;
  returnObjects: boolean;
  joinArrays: boolean;
  keySeparator: string;
  nsSeparator: string;
  pluralSeparator: string;
  contextSeparator: string;
}

/**
 * Translation object structure
 */
export interface TranslationObject {
  [key: string]: string | TranslationObject | string[];
}

/**
 * Namespace configuration
 */
export interface NamespaceConfig {
  name: string;
  description: string;
  files: string[];
}

/**
 * Language configuration
 */
export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string; // Emoji flag
  rtl: boolean;
  active: boolean;
}

/**
 * i18n Runtime configuration
 */
export interface I18nRuntimeConfig {
  currentLanguage: SupportedLanguage;
  currentNamespace: string;
  fallbackChain: SupportedLanguage[];
}

/**
 * Missing translation handler
 */
export interface MissingTranslationHandler {
  (language: SupportedLanguage, namespace: string, key: string, defaultValue?: string): string;
}

/**
 * Loaded translations cache
 */
const translationsCache = new Map<string, TranslationObject>();

/**
 * i18n Service
 */
export class I18nService {
  private readonly localesPath: string;
  private readonly config: I18nConfig;
  private currentLanguage: SupportedLanguage;
  private currentNamespace: string;
  private missingTranslationHandler: MissingTranslationHandler | null = null;

  constructor() {
    // Initialize configuration
    this.config = this.getConfig();
    this.localesPath = this.config.localesPath;
    this.currentLanguage = this.getStoredLanguage() || this.config.defaultLanguage;
    this.currentNamespace = this.config.defaultNamespace;

    logger.info('i18n service initialized', {
      defaultLanguage: this.config.defaultLanguage,
      supportedLanguages: this.config.supportedLanguages,
      localesPath: this.localesPath
    });
  }

  /**
   * Get i18n configuration
   */
  private getConfig(): I18nConfig {
    // Default supported languages
    const defaultSupportedLanguages: SupportedLanguage[] = [
      'en', 'es', 'fr', 'de', 'it', 'pt', 'nl'
    ];

    return {
      enabled: true,
      defaultLanguage: DEFAULT_LANGUAGE,
      fallbackLanguage: 'en',
      supportedLanguages: config.SUPPORTED_LANGUAGES
        ? config.SUPPORTED_LANGUAGES.split(',') as SupportedLanguage[]
        : defaultSupportedLanguages,
      localesPath: path.join(__dirname, '../../../locales'),
      namespaces: ['common', 'auth', 'properties', 'templates', 'shiftNotes', 'escalations', 'reports', 'notifications'],
      defaultNamespace: 'common',
      interpolation: {
        escapeValue: true,
        prefix: '{{',
        suffix: '}}'
      },
      detection: {
        order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
        caches: ['cookie', 'localStorage'],
        lookupQuerystring: 'lng',
        lookupCookie: 'i18next',
        lookupLocalStorage: 'i18nextLng',
        cookieOptions: {
          path: '/',
          sameSite: 'strict'
        }
      },
      backend: {
        loadPath: path.join(__dirname, '../../../locales/{{lng}}/{{ns}}.json'),
        addPath: path.join(__dirname, '../../../locales/{{lng}}/{{ns}}.missing.json')
      },
      saveMissing: config.NODE_ENV === 'development',
      returnEmptyString: false,
      returnNull: false,
      returnObjects: true,
      joinArrays: true,
      keySeparator: '.',
      nsSeparator: ':',
      pluralSeparator: '_',
      contextSeparator: '_'
    };
  }

  /**
   * Get stored language from cookie or localStorage
   */
  private getStoredLanguage(): SupportedLanguage | null {
    // This would be implemented in the frontend
    // For backend, we check request headers
    return null;
  }

  /**
   * Get all supported languages with metadata
   */
  getSupportedLanguages(): LanguageConfig[] {
    const languages: LanguageConfig[] = [
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', rtl: false, active: true },
      { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', rtl: false, active: true },
      { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', rtl: false, active: true },
      { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', rtl: false, active: true },
      { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', rtl: false, active: true },
      { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹', rtl: false, active: true },
      { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', rtl: false, active: true },
      { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', rtl: false, active: true },
      { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', rtl: false, active: true },
      { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', rtl: false, active: true },
      { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇦🇪', rtl: true, active: true },
      { code: 'he', name: 'Hebrew', nativeName: 'עברית', flag: '🇮🇱', rtl: true, active: true }
    ];

    // Filter by supported languages from config
    return languages.filter(lang => 
      this.config.supportedLanguages.includes(lang.code)
    );
  }

  /**
   * Get the current language
   */
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Set the current language
   */
  setCurrentLanguage(language: SupportedLanguage): boolean {
    if (this.config.supportedLanguages.includes(language)) {
      this.currentLanguage = language;
      logger.info('Language changed', { from: this.currentLanguage, to: language });
      return true;
    }

    logger.warn('Unsupported language requested', { language });
    return false;
  }

  /**
   * Get the current namespace
   */
  getCurrentNamespace(): string {
    return this.currentNamespace;
  }

  /**
   * Set the current namespace
   */
  setCurrentNamespace(namespace: string): boolean {
    if (this.config.namespaces.includes(namespace)) {
      this.currentNamespace = namespace;
      return true;
    }
    return false;
  }

  /**
   * Check if a language is RTL
   */
  isRTL(language: SupportedLanguage): boolean {
    return RTL_LANGUAGES.has(language);
  }

  /**
   * Check if current language is RTL
   */
  isCurrentRTL(): boolean {
    return this.isRTL(this.currentLanguage);
  }

  /**
   * Get language direction (ltr or rtl)
   */
  getDirection(language: SupportedLanguage = this.currentLanguage): 'ltr' | 'rtl' {
    return this.isRTL(language) ? 'rtl' : 'ltr';
  }

  /**
   * Set missing translation handler
   */
  setMissingTranslationHandler(handler: MissingTranslationHandler): void {
    this.missingTranslationHandler = handler;
  }

  /**
   * Load translations for a language and namespace
   */
  async loadTranslations(
    language: SupportedLanguage,
    namespace: string = this.config.defaultNamespace
  ): Promise<TranslationObject> {
    const cacheKey = `${language}:${namespace}`;

    // Check cache
    if (translationsCache.has(cacheKey)) {
      return translationsCache.get(cacheKey)!;
    }

    try {
      // Try to load from file
      const filePath = this.getTranslationFilePath(language, namespace);
      const content = await fs.readFile(filePath, 'utf-8');
      const translations = JSON.parse(content) as TranslationObject;

      translationsCache.set(cacheKey, translations);
      logger.debug('Translations loaded', { language, namespace, file: filePath });

      return translations;
    } catch (error) {
      logger.warn('Failed to load translations', {
        language,
        namespace,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return empty object if file not found
      return {};
    }
  }

  /**
   * Get translation file path
   */
  private getTranslationFilePath(language: SupportedLanguage, namespace: string): string {
    return path.join(
      this.localesPath,
      language,
      `${namespace}.json`
    );
  }

  /**
   * Translate a key
   */
  async t(
    key: string,
    options?: {
      language?: SupportedLanguage;
      namespace?: string;
      defaultValue?: string;
      interpolationValues?: Record<string, string | number>;
      plural?: number;
      context?: string;
    }
  ): Promise<string> {
    const lang = options?.language || this.currentLanguage;
    const ns = options?.namespace || this.currentNamespace;
    const defaultValue = options?.defaultValue || key;

    try {
      const translations = await this.loadTranslations(lang, ns);
      const value = this.getValueFromPath(translations, key);

      if (value === undefined || value === null) {
        // Try fallback language
        if (lang !== this.config.fallbackLanguage) {
          return this.t(key, { ...options, language: this.config.fallbackLanguage });
        }

        // Handle missing translation
        if (this.missingTranslationHandler) {
          return this.missingTranslationHandler(lang, ns, key, defaultValue);
        }

        if (this.config.saveMissing) {
          await this.saveMissingTranslation(lang, ns, key, defaultValue);
        }

        return defaultValue;
      }

      // Handle interpolation
      if (options?.interpolationValues) {
        return this.interpolate(String(value), options.interpolationValues);
      }

      return String(value);
    } catch (error) {
      logger.error('Translation error', {
        key,
        language: lang,
        namespace: ns,
        error: error instanceof Error ? error.message : String(error)
      });

      return defaultValue;
    }
  }

  /**
   * Get value from nested path
   */
  private getValueFromPath(obj: TranslationObject, path: string): unknown {
    const keys = path.split(this.config.keySeparator);
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = (current as TranslationObject)[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Simple interpolation
   */
  private interpolate(template: string, values: Record<string, string | number>): string {
    const prefix = this.config.interpolation.prefix;
    const suffix = this.config.interpolation.suffix;

    return template.replace(
      new RegExp(`${prefix}(\\w+}${suffix}`, 'g'),
      (match, key) => {
        const value = values[key];
        return value !== undefined ? String(value) : match;
      }
    );
  }

  /**
   * Save a missing translation
   */
  private async saveMissingTranslation(
    language: SupportedLanguage,
    namespace: string,
    key: string,
    defaultValue: string
  ): Promise<void> {
    try {
      const filePath = this.getTranslationFilePath(language, namespace);
      
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        // Create directory and file if it doesn't exist
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, '{}', 'utf-8');
      }

      // Read existing content
      const content = await fs.readFile(filePath, 'utf-8');
      const translations = JSON.parse(content) as TranslationObject;

      // Add the missing translation
      const keys = key.split(this.config.keySeparator);
      let current = translations;

      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k] || typeof current[k] !== 'object') {
          current[k] = {} as TranslationObject;
        }
        current = current[k] as TranslationObject;
      }

      current[keys[keys.length - 1]] = defaultValue;

      // Write back to file
      await fs.writeFile(filePath, JSON.stringify(translations, null, 2), 'utf-8');

      logger.debug('Missing translation saved', { language, namespace, key, defaultValue });
    } catch (error) {
      logger.error('Failed to save missing translation', {
        language,
        namespace,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Translate multiple keys at once
   */
  async tMany(
    keys: string[],
    options?: {
      language?: SupportedLanguage;
      namespace?: string;
      defaultValues?: Record<string, string>;
      interpolationValues?: Record<string, string | number>;
    }
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    for (const key of keys) {
      const defaultValue = options?.defaultValues?.[key] || key;
      results[key] = await this.t(key, { ...options, defaultValue });
    }

    return results;
  }

  /**
   * Get all translations for a namespace
   */
  async getAllTranslations(
    namespace: string = this.config.defaultNamespace,
    language: SupportedLanguage = this.currentLanguage
  ): Promise<TranslationObject> {
    return this.loadTranslations(language, namespace);
  }

  /**
   * Extract translatable strings from code
   */
  extractStrings(
    content: string,
    pattern: RegExp = /t\(['"]([^'"\\]+(?:\\.[^'"\\]*)*)['"]/g
  ): string[] {
    const strings: Set<string> = new Set();
    let match;

    while ((match = pattern.exec(content)) !== null) {
      strings.add(match[1]);
    }

    return Array.from(strings);
  }

  /**
   * Extract strings from multiple files
   */
  async extractStringsFromFiles(
    filePaths: string[],
    pattern?: RegExp
  ): Promise<{
    byFile: Record<string, string[]>;
    all: string[];
  }> {
    const byFile: Record<string, string[]> = {};
    const all: Set<string> = new Set();

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const strings = this.extractStrings(content, pattern);
        byFile[filePath] = strings;
        strings.forEach(s => all.add(s));
      } catch (error) {
        logger.error('Failed to read file for string extraction', {
          filePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return {
      byFile,
      all: Array.from(all)
    };
  }

  /**
   * Generate translation template for a new language
   */
  async generateTranslationTemplate(
    sourceLanguage: SupportedLanguage,
    targetLanguage: SupportedLanguage,
    namespace: string = this.config.defaultNamespace
  ): Promise<TranslationObject> {
    try {
      const sourceTranslations = await this.loadTranslations(sourceLanguage, namespace);
      
      // Create a template with empty values
      const template: TranslationObject = {};
      
      for (const [key, value] of Object.entries(sourceTranslations)) {
        if (typeof value === 'string') {
          template[key] = '';
        } else if (typeof value === 'object' && value !== null) {
          template[key] = this.createEmptyTemplate(value as TranslationObject);
        } else {
          template[key] = '';
        }
      }

      return template;
    } catch (error) {
      logger.error('Failed to generate translation template', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    }
  }

  /**
   * Create empty template from object
   */
  private createEmptyTemplate(obj: TranslationObject): TranslationObject {
    const result: TranslationObject = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = '';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.createEmptyTemplate(value as TranslationObject);
      } else {
        result[key] = '';
      }
    }

    return result;
  }

  /**
   * Check translation completeness
   */
  async getTranslationCompleteness(
    language: SupportedLanguage,
    namespace: string = this.config.defaultNamespace
  ): Promise<{
    total: number;
    translated: number;
    missing: number;
    completeness: number;
    missingKeys: string[];
  }> {
    try {
      const sourceTranslations = await this.loadTranslations(this.config.defaultLanguage, namespace);
      const targetTranslations = await this.loadTranslations(language, namespace);

      const allKeys = this.getAllKeys(sourceTranslations);
      const translatedKeys = this.getAllKeys(targetTranslations);
      const missingKeys = allKeys.filter(key => !translatedKeys.includes(key));

      return {
        total: allKeys.length,
        translated: translatedKeys.length,
        missing: missingKeys.length,
        completeness: Math.round((translatedKeys.length / allKeys.length) * 100),
        missingKeys
      };
    } catch (error) {
      logger.error('Failed to check translation completeness', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        total: 0,
        translated: 0,
        missing: 0,
        completeness: 0,
        missingKeys: []
      };
    }
  }

  /**
   * Get all keys from a translation object
   */
  private getAllKeys(obj: TranslationObject, prefix: string = ''): string[] {
    const keys: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}${this.config.keySeparator}${key}` : key;

      if (typeof value === 'string') {
        keys.push(fullKey);
      } else if (typeof value === 'object' && value !== null) {
        keys.push(...this.getAllKeys(value as TranslationObject, fullKey));
      }
    }

    return keys;
  }

  /**
   * Synchronize translations between source and target
   */
  async syncTranslations(
    sourceLanguage: SupportedLanguage,
    targetLanguage: SupportedLanguage,
    namespace: string = this.config.defaultNamespace
  ): Promise<{
    added: number;
    removed: number;
    unchanged: number;
  }> {
    try {
      const sourceTranslations = await this.loadTranslations(sourceLanguage, namespace);
      const targetFilePath = this.getTranslationFilePath(targetLanguage, namespace);

      // Check if target file exists
      let targetTranslations: TranslationObject = {};
      try {
        const content = await fs.readFile(targetFilePath, 'utf-8');
        targetTranslations = JSON.parse(content);
      } catch {
        // File doesn't exist, create it
        await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
      }

      // Sync keys from source to target
      const result = this.syncObjects(sourceTranslations, targetTranslations);

      // Save updated target translations
      await fs.writeFile(targetFilePath, JSON.stringify(targetTranslations, null, 2), 'utf-8');

      logger.info('Translations synchronized', {
        sourceLanguage,
        targetLanguage,
        namespace,
        added: result.added,
        removed: result.removed
      });

      return result;
    } catch (error) {
      logger.error('Failed to sync translations', {
        error: error instanceof Error ? error.message : String(error)
      });

      return { added: 0, removed: 0, unchanged: 0 };
    }
  }

  /**
   * Sync two translation objects
   */
  private syncObjects(
    source: TranslationObject,
    target: TranslationObject,
    prefix: string = ''
  ): { added: number; removed: number; unchanged: number } {
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    // Add missing keys from source to target
    for (const [key, sourceValue] of Object.entries(source)) {
      const fullKey = prefix ? `${prefix}${this.config.keySeparator}${key}` : key;
      
      if (!(key in target)) {
        // Add the missing key
        if (typeof sourceValue === 'object' && sourceValue !== null) {
          target[key] = this.createEmptyTemplate(sourceValue as TranslationObject);
        } else {
          target[key] = '';
        }
        added++;
      } else {
        // Recursively sync nested objects
        const targetValue = target[key];
        if (typeof sourceValue === 'object' && sourceValue !== null &&
            typeof targetValue === 'object' && targetValue !== null) {
          const result = this.syncObjects(
            sourceValue as TranslationObject,
            targetValue as TranslationObject,
            fullKey
          );
          added += result.added;
          removed += result.removed;
          unchanged += result.unchanged;
        } else if (typeof sourceValue === 'string' && typeof targetValue === 'string') {
          unchanged++;
        } else if (typeof sourceValue === 'string' && targetValue === '') {
          // Keep empty string for translation
          unchanged++;
        }
      }
    }

    // Remove keys in target that don't exist in source
    for (const key of Object.keys(target)) {
      if (!(key in source)) {
        delete target[key];
        removed++;
      }
    }

    return { added, removed, unchanged };
  }

  /**
   * Get language statistics across all namespaces
   */
  async getLanguageStats(language: SupportedLanguage): Promise<{
    namespace: string;
    total: number;
    translated: number;
    completeness: number;
  }[]> {
    const stats: Array<{
      namespace: string;
      total: number;
      translated: number;
      completeness: number;
    }> = [];

    for (const namespace of this.config.namespaces) {
      const completeness = await this.getTranslationCompleteness(language, namespace);
      stats.push({
        namespace,
        total: completeness.total,
        translated: completeness.translated,
        completeness: completeness.completeness
      });
    }

    return stats;
  }

  /**
   * Get overall translation statistics
   */
  async getTranslationStatistics(): Promise<{
    byLanguage: Record<SupportedLanguage, {
      namespaces: Record<string, {
        total: number;
        translated: number;
        completeness: number;
      }>;
      total: number;
      translated: number;
      completeness: number;
    }>;
    overall: {
      total: number;
      translated: number;
      completeness: number;
    };
  }> {
    const byLanguage: Record<SupportedLanguage, {
      namespaces: Record<string, {
        total: number;
        translated: number;
        completeness: number;
      }>;
      total: number;
      translated: number;
      completeness: number;
    }> = {} as any;

    let overallTotal = 0;
    let overallTranslated = 0;

    for (const language of this.config.supportedLanguages) {
      const languageStats = await this.getLanguageStats(language);
      
      const languageEntry: {
        namespaces: Record<string, {
          total: number;
          translated: number;
          completeness: number;
        }>;
        total: number;
        translated: number;
        completeness: number;
      } = {
        namespaces: {},
        total: 0,
        translated: 0,
        completeness: 0
      };

      for (const stat of languageStats) {
        languageEntry.namespaces[stat.namespace] = {
          total: stat.total,
          translated: stat.translated,
          completeness: stat.completeness
        };
        languageEntry.total += stat.total;
        languageEntry.translated += stat.translated;
      }

      languageEntry.completeness = languageEntry.total > 0
        ? Math.round((languageEntry.translated / languageEntry.total) * 100)
        : 0;

      byLanguage[language] = languageEntry;
      overallTotal += languageEntry.total;
      overallTranslated += languageEntry.translated;
    }

    return {
      byLanguage,
      overall: {
        total: overallTotal,
        translated: overallTranslated,
        completeness: overallTotal > 0
          ? Math.round((overallTranslated / overallTotal) * 100)
          : 0
      }
    };
  }

  /**
   * Clear all cached translations
   */
  clearCache(): void {
    translationsCache.clear();
    logger.info('i18n cache cleared');
  }

  /**
   * Clear cache for a specific language and namespace
   */
  clearNamespaceCache(language: SupportedLanguage, namespace: string): void {
    const cacheKey = `${language}:${namespace}`;
    translationsCache.delete(cacheKey);
    logger.debug('i18n namespace cache cleared', { language, namespace });
  }
}

// Singleton instance
export const i18nService = new I18nService();

// Re-export types and constants
export {
  I18nConfig,
  TranslationObject,
  NamespaceConfig,
  LanguageConfig,
  I18nRuntimeConfig,
  MissingTranslationHandler
};
