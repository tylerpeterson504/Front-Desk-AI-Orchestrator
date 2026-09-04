/**
 * Data Handling and Validation Utilities
 * 
 * This module provides comprehensive tools for:
 * - Data validation with Zod schemas
 * - Data sanitization and cleaning
 * - Data transformation
 * - Type guards and runtime checks
 * - Deep object manipulation
 */

import { z, ZodSchema, ZodError } from 'zod';

/**
 * Result type for validation operations
 */
export type ValidationResult<T> = 
  | { success: true; data: T; error?: never }
  | { success: false; data?: never; error: ValidationErrorDetails };

/**
 * Detailed validation error information
 */
export interface ValidationErrorDetails {
  message: string;
  code: string;
  path?: string[];
  expected?: string;
  received?: string;
  errors: Array<{
    path: string[];
    message: string;
    code: string;
    expected?: string;
    received?: string;
  }>;
}

/**
 * Common validation schemas
 */
export const schemas = {
  // String schemas
  string: z.string(),
  nonEmptyString: z.string().min(1, 'String must not be empty'),
  email: z.string().email('Invalid email address'),
  url: z.string().url('Invalid URL'),
  uuid: z.string().uuid('Invalid UUID'),
  
  // Numeric schemas
  number: z.number(),
  positiveNumber: z.number().positive('Must be a positive number'),
  nonNegativeNumber: z.number().nonnegative('Must be a non-negative number'),
  integer: z.number().int('Must be an integer'),
  
  // Boolean schema
  boolean: z.boolean(),
  
  // Date schemas
  date: z.date(),
  dateString: z.string().datetime(),
  isoDateString: z.string().datetime({ offset: true }),
  
  // Array schemas
  array: z.array(z.unknown()),
  nonEmptyArray: z.array(z.unknown()).min(1, 'Array must not be empty'),
  
  // Object schemas
  object: z.object({}),
  nonEmptyObject: z.object({}).nonstrict().refine(obj => Object.keys(obj).length > 0, {
    message: 'Object must not be empty'
  }),
  
  // ID schemas
  id: z.union([z.string(), z.number()]),
  positiveId: z.union([z.string().min(1), z.number().positive()]),
  
  // Pagination schemas
  pagination: z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(1000).default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc')
  }),
  
  // Search schemas
  search: z.object({
    query: z.string().optional(),
    fields: z.array(z.string()).optional(),
    exactMatch: z.boolean().default(false)
  })
};

/**
 * Validate data against a Zod schema
 */
export function validate<T>(
  data: unknown,
  schema: ZodSchema<T>
): ValidationResult<T> {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    const zodError = error as ZodError;
    const formattedError: ValidationErrorDetails = {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: zodError.errors.map(err => ({
        path: err.path,
        message: err.message,
        code: err.code,
        expected: err.expected?.toString(),
        received: err.received?.toString()
      }))
    };
    
    // Add more details from first error
    if (zodError.errors.length > 0) {
      const firstError = zodError.errors[0];
      formattedError.path = firstError.path;
      formattedError.expected = firstError.expected?.toString();
      formattedError.received = firstError.received?.toString();
    }
    
    return { success: false, error: formattedError };
  }
}

/**
 * Safe validation that doesn't throw
 */
export function safeValidate<T>(
  data: unknown,
  schema: ZodSchema<T>
): T | null {
  const result = validate(data, schema);
  return result.success ? result.data : null;
}

/**
 * Validate and transform data
 */
export function validateAndTransform<T, U>(
  data: unknown,
  schema: ZodSchema<T>,
  transform: (validData: T) => U
): ValidationResult<U> {
  const result = validate(data, schema);
  if (!result.success) {
    return result as ValidationResult<U>;
  }
  
  try {
    const transformed = transform(result.data);
    return { success: true, data: transformed };
  } catch (error) {
    return {
      success: false,
      error: {
        message: 'Transformation failed',
        code: 'TRANSFORMATION_ERROR',
        errors: [{
          path: [],
          message: (error as Error).message,
          code: 'TRANSFORMATION_ERROR'
        }]
      }
    };
  }
}

/**
 * Create a validator function for a specific schema
 */
export function createValidator<T>(schema: ZodSchema<T>) {
  return (data: unknown) => validate(data, schema);
}

/**
 * Create a safe validator function
 */
export function createSafeValidator<T>(schema: ZodSchema<T>) {
  return (data: unknown) => safeValidate(data, schema);
}

/**
 * Data sanitization options
 */
export interface SanitizeOptions {
  trimStrings?: boolean;
  removeEmpty?: boolean;
  removeNull?: boolean;
  removeUndefined?: boolean;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxDepth?: number;
  allowedKeys?: string[];
  blockedKeys?: string[];
}

const DEFAULT_SANITIZE_OPTIONS: SanitizeOptions = {
  trimStrings: true,
  removeEmpty: false,
  removeNull: false,
  removeUndefined: false,
  maxStringLength: 10000,
  maxArrayLength: 100,
  maxDepth: 10,
  allowedKeys: [],
  blockedKeys: []
};

/**
 * Sanitize a value with configurable options
 */
export function sanitize<T>(
  value: T,
  options: SanitizeOptions = {}
): T {
  const opts = { ...DEFAULT_SANITIZE_OPTIONS, ...options };
  return _sanitize(value, opts, 0) as T;
}

function _sanitize<T>(
  value: T,
  options: SanitizeOptions,
  depth: number
): T {
  // Stop recursion at max depth
  if (depth > (options.maxDepth || 10)) {
    return value;
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    if (options.removeNull && value === null) {
      return undefined as T;
    }
    if (options.removeUndefined && value === undefined) {
      return undefined as T;
    }
    return value;
  }

  // Handle strings
  if (typeof value === 'string') {
    let result = value;
    if (options.trimStrings) {
      result = result.trim();
    }
    if (options.maxStringLength && result.length > options.maxStringLength) {
      result = result.substring(0, options.maxStringLength);
    }
    return result as T;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    const sanitized = value
      .slice(0, options.maxArrayLength || 100)
      .map(item => _sanitize(item, options, depth + 1));
    
    // Remove empty values if configured
    if (options.removeEmpty) {
      return sanitized.filter(item => item !== null && item !== undefined && item !== '') as unknown as T;
    }
    
    return sanitized as unknown as T;
  }

  // Handle objects
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Skip blocked keys
      if (options.blockedKeys?.length && options.blockedKeys.includes(key)) {
        continue;
      }
      
      // Only include allowed keys if specified
      if (options.allowedKeys?.length && !options.allowedKeys.includes(key)) {
        continue;
      }
      
      const sanitizedValue = _sanitize(val, options, depth + 1);
      
      // Skip null/undefined if configured
      if (sanitizedValue === null && options.removeNull) {
        continue;
      }
      if (sanitizedValue === undefined && options.removeUndefined) {
        continue;
      }
      
      result[key] = sanitizedValue;
    }
    
    // Remove empty objects if configured
    if (options.removeEmpty && Object.keys(result).length === 0) {
      return undefined as T;
    }
    
    return result as T;
  }

  // Handle other types (numbers, booleans, etc.)
  return value;
}

/**
 * Deep clone an object/value
 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, unknown>, U extends Record<string, unknown>>(
  target: T,
  source: U
): T & U {
  const result = { ...target } as T & U;
  
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (sourceValue === null || sourceValue === undefined) {
      continue;
    }
    
    if (typeof sourceValue === 'object' && 
        typeof targetValue === 'object' &&
        !Array.isArray(sourceValue) &&
        !Array.isArray(targetValue)) {
      result[key] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as unknown;
    } else {
      result[key] = sourceValue as unknown;
    }
  }
  
  return result;
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj } as Omit<T, K>;
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

/**
 * Rename keys in an object
 */
export function renameKeys<T extends Record<string, unknown>>(
  obj: T,
  keyMap: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [oldKey, newKey] of Object.entries(keyMap)) {
    if (oldKey in obj) {
      result[newKey] = obj[oldKey as keyof T];
    }
  }
  
  // Copy remaining keys
  for (const key of Object.keys(obj)) {
    if (!(key in keyMap)) {
      result[key] = obj[key as keyof T];
    }
  }
  
  return result;
}

/**
 * Type guard for checking if a value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }
  
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Type guard for checking if a value is a non-empty object
 */
export function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).length > 0;
}

/**
 * Type guard for checking if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard for checking if a value is a non-empty array
 */
export function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Type guard for checking if a value is a valid date string
 */
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Type guard for checking if a value is a valid email
 */
export function isEmail(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Type guard for checking if a value is a valid URL
 */
export function isUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard for checking if a value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard for checking if a value is an integer
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * Type guard for checking if a value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Safely parse JSON with fallback
 */
export function safeJsonParse<T>(
  jsonString: string,
  fallback: T
): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely stringify JSON with fallback
 */
export function safeJsonStringify(
  value: unknown,
  fallback: string = '{}'
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/**
 * Get nested property value safely
 */
export function getNestedValue<T>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | undefined {
  const keys = path.split('.');
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    
    if (isObject(current) && key in current) {
      current = current[key];
    } else {
      return defaultValue;
    }
  }
  
  return current as T;
}

/**
 * Set nested property value safely
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    
    if (!(key in current) || !isObject(current[key])) {
      current[key] = {};
    }
    
    current = current[key] as Record<string, unknown>;
  }
  
  current[keys[keys.length - 1]] = value;
  return obj;
}

/**
 * Flatten an object (convert nested keys to dot notation)
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix: string = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (isObject(value) && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  
  return result;
}

/**
 * Unflatten an object (convert dot notation keys to nested)
 */
export function unflattenObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    setNestedValue(result, key, value);
  }
  
  return result;
}

/**
 * Group array items by a key
 */
export function groupBy<T extends Record<string, unknown>, K extends keyof T>(
  array: T[],
  key: K
): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  
  for (const item of array) {
    const keyValue = String(item[key]);
    if (!result[keyValue]) {
      result[keyValue] = [];
    }
    result[keyValue].push(item);
  }
  
  return result;
}

/**
 * Create a lookup map from an array
 */
export function createLookup<T extends Record<string, unknown>, K extends keyof T>(
  array: T[],
  key: K
): Record<string, T> {
  const result: Record<string, T> = {};
  
  for (const item of array) {
    const keyValue = String(item[key]);
    result[keyValue] = item;
  }
  
  return result;
}

/**
 * Chunk an array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  
  return result;
}

/**
 * Unique array by key
 */
export function uniqueBy<T extends Record<string, unknown>, K extends keyof T>(
  array: T[],
  key: K
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  
  for (const item of array) {
    const keyValue = String(item[key]);
    if (!seen.has(keyValue)) {
      seen.add(keyValue);
      result.push(item);
    }
  }
  
  return result;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Memoize function
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  func: T
): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map<string, ReturnType<T>>();
  
  return (...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = func(...args);
    cache.set(key, result);
    return result;
  };
}

export default {
  // Validation
  schemas,
  validate,
  safeValidate,
  validateAndTransform,
  createValidator,
  createSafeValidator,
  ValidationResult,
  ValidationErrorDetails,
  
  // Sanitization
  sanitize,
  SanitizeOptions,
  
  // Type guards
  isObject,
  isPlainObject,
  isNonEmptyObject,
  isNonEmptyString,
  isNonEmptyArray,
  isDateString,
  isEmail,
  isUrl,
  isNumber,
  isInteger,
  isBoolean,
  
  // JSON utilities
  safeJsonParse,
  safeJsonStringify,
  
  // Object manipulation
  deepClone,
  deepMerge,
  pick,
  omit,
  renameKeys,
  getNestedValue,
  setNestedValue,
  flattenObject,
  unflattenObject,
  
  // Array utilities
  groupBy,
  createLookup,
  chunkArray,
  uniqueBy,
  
  // Function utilities
  debounce,
  throttle,
  memoize
};
