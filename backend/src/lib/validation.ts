/**
 * Advanced Validation Utilities
 * 
 * This module provides comprehensive validation tools including:
 * - Schema-based validation with Zod
 * - Custom validators
 * - Validation pipelines
 * - Conditional validation
 * - Validation error formatting
 */

import { z, ZodSchema, ZodError, ZodTypeAny } from 'zod';
import { validate, ValidationResult, ValidationErrorDetails, isObject } from './dataUtils';

/**
 * Validation rule interface
 */
export interface ValidationRule<T = unknown> {
  validator: (value: T, context?: Record<string, unknown>) => ValidationResult<T>;
  message?: string;
  field?: string;
}

/**
 * Validation pipeline for chaining validators
 */
export class ValidationPipeline<T = unknown> {
  private rules: ValidationRule<T>[] = [];

  /**
   * Add a rule to the pipeline
   */
  addRule(rule: ValidationRule<T>): this {
    this.rules.push(rule);
    return this;
  }

  /**
   * Add a schema-based rule
   */
  addSchema(schema: ZodSchema<T>, field?: string): this {
    this.rules.push({
      validator: (value) => {
        const result = validate(value, schema);
        if (!result.success) {
          return {
            success: false,
            error: {
              message: result.error.message,
              code: result.error.code,
              errors: result.error.errors,
              path: field ? [field] : []
            }
          };
        }
        // Preserve the original value's extra fields by merging with the parsed result
        if (isObject(value) && isObject(result.data)) {
          return { success: true, data: { ...result.data, ...value } as T };
        }
        return result;
      },
      field
    });
    return this;
  }

  /**
   * Add a custom validator
   */
  addCustom(
    validator: (value: T) => boolean,
    message: string,
    field?: string
  ): this {
    this.rules.push({
      validator: (value) => {
        if (!validator(value)) {
          return {
            success: false,
            error: {
              message,
              code: 'CUSTOM_VALIDATION_ERROR',
              errors: [{
                path: field ? [field] : [],
                message,
                code: 'CUSTOM_VALIDATION_ERROR'
              }]
            }
          };
        }
        return { success: true, data: value };
      },
      message,
      field
    });
    return this;
  }

  /**
   * Add required validation
   */
  required(message: string = 'This field is required', field?: string): this {
    this.rules.push({
      validator: (value) => {
        if (value === null || value === undefined || value === '') {
          return {
            success: false,
            error: {
              message,
              code: 'REQUIRED_ERROR',
              errors: [{
                path: field ? [field] : [],
                message,
                code: 'REQUIRED_ERROR'
              }]
            }
          };
        }
        return { success: true, data: value };
      },
      message,
      field
    });
    return this;
  }

  /**
   * Add type validation
   */
  type(type: string, message?: string, field?: string): this {
    this.rules.push({
      validator: (value) => {
        const actualType = typeof value;
        const isNull = value === null;
        
        // Handle null
        if (isNull && type === 'null') {
          return { success: true, data: value };
        }
        
        // Handle arrays
        if (type === 'array' && Array.isArray(value)) {
          return { success: true, data: value };
        }
        
        // Handle objects
        if (type === 'object' && actualType === 'object' && !Array.isArray(value) && value !== null) {
          return { success: true, data: value };
        }
        
        // Handle other types
        if (actualType === type) {
          return { success: true, data: value };
        }
        
        return {
          success: false,
          error: {
            message: message || `Expected type ${type}, got ${actualType}`,
            code: 'TYPE_ERROR',
            errors: [{
              path: field ? [field] : [],
              message: message || `Expected type ${type}, got ${actualType}`,
              code: 'TYPE_ERROR'
            }]
          }
        };
      },
      message,
      field
    });
    return this;
  }

  /**
   * Add length validation for strings/arrays
   */
  length(
    options: {
      min?: number;
      max?: number;
      exact?: number;
    },
    message?: string,
    field?: string
  ): this {
    this.rules.push({
      validator: (value) => {
        const actualLength = (value as any)?.length;
        
        if (options.min !== undefined && actualLength < options.min) {
          return {
            success: false,
            error: {
              message: message || `Length must be at least ${options.min}`,
              code: 'LENGTH_ERROR',
              errors: [{
                path: field ? [field] : [],
                message: message || `Length must be at least ${options.min}`,
                code: 'LENGTH_ERROR'
              }]
            }
          };
        }
        
        if (options.max !== undefined && actualLength > options.max) {
          return {
            success: false,
            error: {
              message: message || `Length must be at most ${options.max}`,
              code: 'LENGTH_ERROR',
              errors: [{
                path: field ? [field] : [],
                message: message || `Length must be at most ${options.max}`,
                code: 'LENGTH_ERROR'
              }]
            }
          };
        }
        
        if (options.exact !== undefined && actualLength !== options.exact) {
          return {
            success: false,
            error: {
              message: message || `Length must be exactly ${options.exact}`,
              code: 'LENGTH_ERROR',
              errors: [{
                path: field ? [field] : [],
                message: message || `Length must be exactly ${options.exact}`,
                code: 'LENGTH_ERROR'
              }]
            }
          };
        }
        
        return { success: true, data: value };
      },
      message,
      field
    });
    return this;
  }

  /**
   * Add range validation for numbers
   */
  range(
    options: {
      min?: number;
      max?: number;
    },
    message?: string,
    field?: string
  ): this {
    this.rules.push({
      validator: (value) => {
        if (typeof value !== 'number') {
          return { success: true, data: value };
        }
        
        if (options.min !== undefined && value < options.min) {
          return {
            success: false,
            error: {
              message: message || `Value must be at least ${options.min}`,
              code: 'RANGE_ERROR',
              errors: [{
                path: field ? [field] : [],
                message: message || `Value must be at least ${options.min}`,
                code: 'RANGE_ERROR'
              }]
            }
          };
        }
        
        if (options.max !== undefined && value > options.max) {
          return {
            success: false,
            error: {
              message: message || `Value must be at most ${options.max}`,
              code: 'RANGE_ERROR',
              errors: [{
                path: field ? [field] : [],
                message: message || `Value must be at most ${options.max}`,
                code: 'RANGE_ERROR'
              }]
            }
          };
        }
        
        return { success: true, data: value };
      },
      message,
      field
    });
    return this;
  }

  /**
   * Add pattern validation for strings
   */
  pattern(regex: RegExp, message?: string, field?: string): this {
    this.rules.push({
      validator: (value) => {
        if (typeof value !== 'string') {
          return { success: true, data: value };
        }
        
        if (!regex.test(value)) {
          return {
            success: false,
            error: {
              message: message || `Value does not match required pattern`,
              code: 'PATTERN_ERROR',
              errors: [{
                path: field ? [field] : [],
                message: message || `Value does not match required pattern`,
                code: 'PATTERN_ERROR'
              }]
            }
          };
        }
        
        return { success: true, data: value };
      },
      message,
      field
    });
    return this;
  }

  /**
   * Add conditional validation
   */
  when(
    condition: (value: T, context?: Record<string, unknown>) => boolean,
    validator: (value: T, context?: Record<string, unknown>) => ValidationResult<T>,
    field?: string
  ): this {
    this.rules.push({
      validator: (value, context) => {
        if (condition(value, context)) {
          return validator(value, context);
        }
        return { success: true, data: value };
      },
      field
    });
    return this;
  }

  /**
   * Validate a value
   */
  validate(value: T, context?: Record<string, unknown>): ValidationResult<T> {
    let currentValue: T = value;
    
    for (const rule of this.rules) {
      const result = rule.validator(currentValue, context);
      
      if (!result.success) {
        // Add field information if available
        if (rule.field && result.error) {
          result.error.path = [rule.field, ...(result.error.path || [])];
          result.error.message = rule.message || result.error.message;
        }
        return result as ValidationResult<T>;
      }
      
      currentValue = result.data;
    }
    
    return { success: true, data: currentValue };
  }

  /**
   * Validate multiple values at once
   */
  validateMany(
    values: T[],
    context?: Record<string, unknown>
  ): ValidationResult<T[]> {
    const results: ValidationResult<T>[] = [];
    const errors: ValidationErrorDetails[] = [];
    
    for (let i = 0; i < values.length; i++) {
      const result = this.validate(values[i] as any, context);
      results.push(result);
      
      if (!result.success) {
        errors.push(result.error);
      }
    }
    
    if (errors.length > 0) {
      return {
        success: false,
        error: {
          message: `${errors.length} validation error(s)`,
          code: 'MULTIPLE_VALIDATION_ERRORS',
          errors: errors.flatMap(e => e.errors)
        }
      };
    }
    
    return {
      success: true,
      data: results.map(r => r.data) as any
    };
  }
}

/**
 * Create a validation pipeline
 */
export function createPipeline<T = unknown>(): ValidationPipeline<T> {
  return new ValidationPipeline<T>();
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // User schemas
  userCreate: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required')
  }),
  
  userUpdate: z.object({
    email: z.string().email('Invalid email address').optional(),
    name: z.string().min(1, 'Name is required').optional(),
    role: z.enum(['agent', 'admin']).optional()
  }),
  
  // Property schemas
  propertyCreate: z.object({
    name: z.string().min(1, 'Name is required'),
    address: z.string().optional(),
    checkout_time: z.string().optional(),
    wifi_ssid: z.string().optional(),
    tone_guidelines: z.string().optional()
  }),
  
  propertyUpdate: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    address: z.string().optional(),
    checkout_time: z.string().optional(),
    wifi_ssid: z.string().optional(),
    tone_guidelines: z.string().optional()
  }),
  
  // Template schemas
  templateCreate: z.object({
    name: z.string().min(1, 'Name is required'),
    content: z.string().min(1, 'Content is required'),
    is_global: z.boolean().default(false)
  }),
  
  templateUpdate: z.object({
    name: z.string().min(1, 'Name is required').optional(),
    content: z.string().min(1, 'Content is required').optional(),
    is_global: z.boolean().optional()
  }),
  
  // Shift note schemas
  shiftNoteCreate: z.object({
    content: z.string().min(1, 'Content is required'),
    shift_date: z.string().optional()
  }),
  
  // Pagination
  pagination: z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(1000).default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc')
  }),
  
  // Search
  search: z.object({
    query: z.string().optional(),
    fields: z.array(z.string()).optional(),
    exactMatch: z.boolean().default(false)
  })
};

/**
 * Validate and sanitize input
 */
export function validateAndSanitize<T>(
  data: unknown,
  schema: ZodSchema<T>,
  sanitizeFn?: (data: T) => T
): ValidationResult<T> {
  const result = validate(data, schema);
  
  if (!result.success) {
    return result;
  }
  
  if (sanitizeFn) {
    try {
      const sanitized = sanitizeFn(result.data);
      return { success: true, data: sanitized };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Sanitization failed',
          code: 'SANITIZATION_ERROR',
          errors: [{
            path: [],
            message: (error as Error).message,
            code: 'SANITIZATION_ERROR'
          }]
        }
      };
    }
  }
  
  return result;
}

/**
 * Create a validator with sanitization
 */
export function createValidatorWithSanitization<T>(
  schema: ZodSchema<T>,
  sanitizeFn?: (data: T) => T
) {
  return (data: unknown) => validateAndSanitize(data, schema, sanitizeFn);
}

/**
 * Validate an object against multiple schemas (AND logic)
 */
export function validateAll<T extends Record<string, unknown>>(
  data: T,
  schemas: Record<keyof T, ZodSchema<unknown>>
): ValidationResult<T> {
  const errors: ValidationErrorDetails[] = [];
  const validated: Record<string, unknown> = {};
  
  for (const [key, schema] of Object.entries(schemas)) {
    const result = validate(data[key as keyof T], schema as ZodSchema<unknown>);
    
    if (!result.success) {
      errors.push({
        ...result.error,
        path: [key, ...(result.error.path || [])]
      });
    } else {
      validated[key] = result.data;
    }
  }
  
  if (errors.length > 0) {
    return {
      success: false,
      error: {
        message: `${errors.length} validation error(s)`,
        code: 'MULTIPLE_VALIDATION_ERRORS',
        errors: errors.flatMap(e => e.errors)
      }
    };
  }
  
  return { success: true, data: validated as T };
}

/**
 * Validate an object against multiple schemas (OR logic - first to pass)
 */
export function validateAny<T>(
  data: unknown,
  schemas: ZodSchema<T>[]
): ValidationResult<T> {
  const errors: ValidationErrorDetails[] = [];
  
  for (const schema of schemas) {
    const result = validate(data, schema);
    
    if (result.success) {
      return result;
    }
    
    errors.push(result.error);
  }
  
  return {
    success: false,
    error: {
      message: 'None of the schemas matched',
      code: 'NO_SCHEMA_MATCH',
      errors: errors.flatMap(e => e.errors)
    }
  };
}

export default {
  // Pipeline
  ValidationPipeline,
  createPipeline,
  
  // Schemas
  commonSchemas,
  
  // Validation functions
  validateAndSanitize,
  createValidatorWithSanitization,
  validateAll,
  validateAny,
  
  // Re-export types
};
