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

import { z, ZodSchema, ZodError, ZodIssue } from 'zod';

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
  path?: (string | number)[];
  expected?: string;
  received?: string;
  errors: Array<{
    path: (string | number)[];
    message: string;
    code: string;
    expected?: string;
    received?: string;
  }>;
}

/**
 * Options for sanitize function
 */
export interface SanitizeOptions {
  trimStrings?: boolean;
  maxStringLength?: number;
  maxDepth?: number;
  maxArrayLength?: number;
  removeEmpty?: boolean;
  allowedKeys?: string[];
  blockedKeys?: string[];
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
  positiveNumber: z.number().positive('Must be positive'),
  integer: z.number().int('Must be an integer'),
  
  // Date schemas
  date: z.date(),
  dateString: z.string().datetime(),
  
  // Array schemas
  array: z.array(z.unknown()),
  nonEmptyArray: z.array(z.unknown()).min(1, 'Array must not be empty'),
  
  // Object schemas
  object: z.object({}),
  
  // ID schemas
  id: z.union([z.string(), z.number()]),
  
  // Pagination schemas
  pagination: z.object({
    page: z.number().int().positive().default(1),
    pageSize: z.number().int().positive().max(100).default(20),
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
    const errors = zodError.errors.map(err => ({
      path: err.path,
      message: err.message,
      code: err.code,
      expected: (err as any).expected?.toString(),
      received: (err as any).received?.toString()
    }));
    
    const formattedError: ValidationErrorDetails = {
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors
    };
    
    // Add more details from first error
    if (zodError.errors.length > 0) {
      const firstError = zodError.errors[0] as any;
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
    return result as any;
  }
  try {
    const transformed = transform(result.data);
    return { success: true, data: transformed };
  } catch (error) {
    return {
      success: false,
      error: {
        message: (error as Error).message,
        code: 'TRANSFORMATION_ERROR'
      } as any
    };
  }
}

/**
 * Create a reusable validator function
 */
export function createValidator<T>(
  schema: ZodSchema<T>,
  options?: { trim?: boolean; defaultValue?: T }
): (data: unknown) => ValidationResult<T> {
  return (data: unknown) => {
    // Apply trimming if enabled
    if (options?.trim && typeof data === 'string') {
      data = data.trim();
    }
    return validate(data, schema);
  };
}

/**
 * Create a safe validator that returns null on failure
 */
export function createSafeValidator<T>(
  schema: ZodSchema<T>,
  options?: { trim?: boolean; defaultValue?: T }
): (data: unknown) => T | null {
  const validator = createValidator(schema, options);
  return (data: unknown) => {
    const result = validator(data);
    return result.success ? result.data : options?.defaultValue ?? null;
  };
}

/**
 * Sanitize data to prevent injection and XSS
 */
export function sanitize<T>(
  data: T,
  options: SanitizeOptions = {}
): T {
  const {
    trimStrings = true,
    maxStringLength = 10000,
    maxDepth = 10,
    maxArrayLength = 100,
    removeEmpty = true,
    allowedKeys,
    blockedKeys = []
  } = options;

  function _sanitize(value: unknown, depth: number = 0): unknown {
    if (depth > maxDepth) {
      return undefined;
    }

    // Handle null and undefined
    if (value === null || value === undefined) {
      return undefined;
    }

    // Handle blocked keys
    if (isObject(value) && 'constructor' in (value as any) && value.constructor === Object) {
      const obj = value as Record<string, unknown>;
      const sanitized: Record<string, unknown> = {};
      
      for (const [key, val] of Object.entries(obj)) {
        // Skip blocked keys
        if (blockedKeys.includes(key)) {
          continue;
        }
        
        // Skip disallowed keys if allowedKeys is specified
        if (allowedKeys && !allowedKeys.includes(key)) {
          continue;
        }
        
        const sanitizedValue = _sanitize(val, depth + 1);
        if (sanitizedValue !== undefined || !removeEmpty) {
          sanitized[key] = sanitizedValue;
        }
      }
      
      return sanitized;
    }

    // Handle strings
    if (typeof value === 'string') {
      let result = value;
      if (trimStrings) {
        result = result.trim();
      }
      // Replace newlines and tabs with spaces
      result = result.replace(/[\n\t]/g, ' ');
      // Collapse multiple spaces into one
      result = result.replace(/\s+/g, ' ');
      if (maxStringLength && result.length > maxStringLength) {
        result = result.substring(0, maxStringLength);
      }
      return result;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      const sanitized = value
        .slice(0, maxArrayLength)
        .map(item => _sanitize(item, depth + 1));
      
      // Remove empty values if configured
      if (removeEmpty) {
        return sanitized.filter(item => item !== null && item !== undefined && item !== '');
      }
      
      return sanitized;
    }

    // Handle numbers, booleans, dates
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value;
    }

    // For other types, return as-is
    return value;
  }

  return _sanitize(data, 0) as T;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if value is an object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check if value is a plain object (not array, date, etc.)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    isObject(value) &&
    value.constructor === Object &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/**
 * Check if value is a non-empty object
 */
export function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length > 0;
}

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if value is a non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if value is a date string
 */
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Check if value is a valid email
 */
export function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Check if value is a valid URL
 */
export function isUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\/.+/.test(value);
}

/**
 * Check if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Check if value is an integer
 */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

// ============================================================================
// JSON Utilities
// ============================================================================

/**
 * Safely parse JSON
 */
export function safeJsonParse<T>(json: string, defaultValue?: T): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue ?? null;
  }
}

/**
 * Safely stringify JSON
 */
export function safeJsonStringify(
  data: unknown,
  replacer?: (key: string, value: unknown) => unknown,
  space?: number
): string {
  try {
    return JSON.stringify(data, replacer, space);
  } catch {
    return '{}';
  }
}

// ============================================================================
// Object Manipulation
// ============================================================================

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Deep merge two objects
 */
export function deepMerge<T, U>(target: T, source: U): T & U {
  const result = { ...target } as T & U;
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = (source as Record<string, unknown>)[key];
      const targetValue = (result as Record<string, unknown>)[key];
      
      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue as object,
          sourceValue as object
        );
      } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        (result as Record<string, unknown>)[key] = [
          ...(targetValue as unknown[]),
          ...(sourceValue as unknown[])
        ];
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
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
  const result = { ...obj };
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
): T {
  const result: Record<string, unknown> = {};
  
  for (const [oldKey, value] of Object.entries(obj)) {
    const newKey = keyMap[oldKey] || oldKey;
    result[newKey] = value;
  }
  
  return result as T;
}

// ============================================================================
// Nested Access
// ============================================================================

/**
 * Get a nested value from an object using dot notation
 */
export function getNestedValue<T>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T {
  const keys = path.split('.');
  let current: unknown = obj;
  
  for (const key of keys) {
    if (current === null || current === undefined || !isObject(current)) {
      return defaultValue as T;
    }
    current = (current as Record<string, unknown>)[key];
  }
  
  return (current as T) ?? defaultValue as T;
}

/**
 * Set a nested value in an object using dot notation
 */
export function setNestedValue<T>(
  obj: Record<string, unknown>,
  path: string,
  value: T
): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const currentVal = current[key as string];
    if (currentVal === undefined || currentVal === null || !isObject(currentVal)) {
      current[key as string] = {};
    }
    current = current[key as string] as Record<string, unknown>;
  }
  
  const lastKey = keys[keys.length - 1];
  if (lastKey !== undefined) {
    current[lastKey as string] = value;
  }
}

// ============================================================================
// Object Flattening
// ============================================================================

/**
 * Flatten an object into a single level with dot-notation keys
 */
export function flattenObject(
  obj: Record<string, unknown>,
  prefix: string = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (isPlainObject(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else if (Array.isArray(value)) {
      // Handle arrays by joining with comma
      result[newKey] = (value as unknown[]).join(',');
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}

/**
 * Unflatten a flattened object back to nested structure
 */
export function unflattenObject(
  flattened: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(flattened)) {
    const keys = key.split('.');
    let current = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      const currentVal = current[k as string];
      if (currentVal === undefined || currentVal === null || !isObject(currentVal)) {
        current[k as string] = {};
      }
      current = current[k as string] as Record<string, unknown>;
    }
    
    const lastKey = keys[keys.length - 1];
    if (lastKey !== undefined) {
      current[lastKey as string] = value;
    }
  }
  
  return result;
}

// ============================================================================
// Array Utilities
// ============================================================================

/**
 * Group array items by a key
 */
export function groupBy<T, K extends keyof T>(
  items: T[],
  key: K
): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const keyValue = String(item[key]);
    if (!acc[keyValue]) {
      acc[keyValue] = [];
    }
    acc[keyValue].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Create a lookup object from an array
 */
export function createLookup<T, K extends keyof T>(
  items: T[],
  key: K
): Record<string, T> {
  return items.reduce((acc, item) => {
    const keyValue = String(item[key]);
    acc[keyValue] = item;
    return acc;
  }, {} as Record<string, T>);
}

/**
 * Chunk an array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

/**
 * Get unique items by a key
 */
export function uniqueBy<T, K extends keyof T>(items: T[], key: K): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const keyValue = String(item[key]);
    if (seen.has(keyValue)) {
      return false;
    }
    seen.add(keyValue);
    return true;
  });
}

// ============================================================================
// Function Utilities
// ============================================================================

/**
 * Debounce a function
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => ReturnType<T> {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      inThrottle = true;
      const result = fn(...args);
      setTimeout(() => {
        inThrottle = false;
      }, limit);
      return result;
    }
    return undefined as ReturnType<T>;
  };
}

/**
 * Memoize a function
 */
export function memoize<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T
): (...args: Parameters<T>) => ReturnType<T> {
  const cache = new Map<string, ReturnType<T>>();
  
  return (...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

// ============================================================================
// Type Exports for external use
// ============================================================================

