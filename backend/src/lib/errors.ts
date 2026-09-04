/**
 * Comprehensive Error Handling System
 * 
 * This module provides a hierarchical error system with:
 * - Custom error classes for different error categories
 * - Error detection and classification utilities
 * - Error recovery mechanisms
 * - Error context preservation
 * - Type-safe error handling
 */



/**
 * Error severity levels for prioritization and logging
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit',
  DATABASE = 'database',
  NETWORK = 'network',
  EXTERNAL_SERVICE = 'external_service',
  INTERNAL = 'internal',
  CONFIGURATION = 'configuration',
  SECURITY = 'security'
}

/**
 * Error context interface for preserving request and environment context
 */
export interface ErrorContext {
  requestId?: string;
  timestamp: Date;
  path?: string;
  method?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base application error with enhanced context and classification
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly details?: Record<string, unknown>;
  public readonly requestId?: string;
  public readonly context?: ErrorContext;
  public readonly isOperational: boolean;
  public override readonly cause?: Error;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: {
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      details?: Record<string, unknown>;
      requestId?: string;
      context?: ErrorContext;
      isOperational?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.category = options.category || ErrorCategory.INTERNAL;
    this.details = options.details;
    this.requestId = options.requestId;
    this.context = options.context;
    this.isOperational = options.isOperational !== false;
    this.cause = options.cause;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      severity: this.severity,
      category: this.category,
      details: this.details,
      requestId: this.requestId,
      context: this.context,
      isOperational: this.isOperational,
      timestamp: this.context?.timestamp?.toISOString() || new Date().toISOString()
    };
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    return [
      'NETWORK_ERROR',
      'RATE_LIMIT_ERROR',
      'EXTERNAL_SERVICE_ERROR',
      'DATABASE_ERROR'
    ].includes(this.code);
  }

  /**
   * Check if this error should be reported to monitoring systems
   */
  shouldReport(): boolean {
    return this.severity === ErrorSeverity.HIGH || 
           this.severity === ErrorSeverity.CRITICAL ||
           !this.isOperational;
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    context?: ErrorContext
  ) {
    super(400, 'VALIDATION_ERROR', message, {
      severity: ErrorSeverity.LOW,
      category: ErrorCategory.VALIDATION,
      details,
      context,
      isOperational: true
    });
  }
}

/**
 * Authentication error for failed authentication attempts
 */
export class AuthenticationError extends AppError {
  public readonly failedAttempts?: number;
  public readonly lockedUntil?: Date;

  constructor(
    message: string = 'Authentication failed',
    options: {
      failedAttempts?: number;
      lockedUntil?: Date;
      context?: ErrorContext;
    } = {}
  ) {
    super(401, 'AUTHENTICATION_ERROR', message, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.AUTHENTICATION,
      context: options.context,
      isOperational: true
    });
    this.failedAttempts = options.failedAttempts;
    this.lockedUntil = options.lockedUntil;
  }
}

/**
 * Authorization error for access denied scenarios
 */
export class AuthorizationError extends AppError {
  public readonly requiredRole?: string;
  public readonly userRole?: string;
  public readonly resource?: string;
  public readonly action?: string;

  constructor(
    message: string = 'Access denied',
    options: {
      requiredRole?: string;
      userRole?: string;
      resource?: string;
      action?: string;
      context?: ErrorContext;
    } = {}
  ) {
    super(403, 'AUTHORIZATION_ERROR', message, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.AUTHORIZATION,
      details: {
        requiredRole: options.requiredRole,
        userRole: options.userRole,
        resource: options.resource,
        action: options.action
      },
      context: options.context,
      isOperational: true
    });
    this.requiredRole = options.requiredRole;
    this.userRole = options.userRole;
    this.resource = options.resource;
    this.action = options.action;
  }
}

/**
 * Not found error for missing resources
 */
export class NotFoundError extends AppError {
  public readonly resourceType: string;
  public readonly resourceId: string | number;

  constructor(
    resourceType: string,
    resourceId: string | number,
    context?: ErrorContext
  ) {
    super(404, 'NOT_FOUND', `${resourceType} not found: ${resourceId}`, {
      severity: ErrorSeverity.LOW,
      category: ErrorCategory.NOT_FOUND,
      context,
      isOperational: true
    });
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Conflict error for resource conflicts
 */
export class ConflictError extends AppError {
  public readonly conflictingResource?: string;
  public readonly conflictType?: string;

  constructor(
    message: string = 'Conflict',
    options: {
      conflictingResource?: string;
      conflictType?: string;
      context?: ErrorContext;
    } = {}
  ) {
    super(409, 'CONFLICT', message, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.CONFLICT,
      details: {
        conflictingResource: options.conflictingResource,
        conflictType: options.conflictType
      },
      context: options.context,
      isOperational: true
    });
    this.conflictingResource = options.conflictingResource;
    this.conflictType = options.conflictType;
  }
}

/**
 * Rate limit error for too many requests
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;
  public readonly limit?: number;
  public readonly window?: string;

  constructor(
    message: string = 'Too many requests',
    options: {
      retryAfter?: number;
      limit?: number;
      window?: string;
      context?: ErrorContext;
    } = {}
  ) {
    super(429, 'RATE_LIMIT_ERROR', message, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.RATE_LIMIT,
      details: {
        retryAfter: options.retryAfter,
        limit: options.limit,
        window: options.window
      },
      context: options.context,
      isOperational: true
    });
    this.retryAfter = options.retryAfter;
    this.limit = options.limit;
    this.window = options.window;
  }
}

/**
 * Database error with internal/external message separation
 */
export class DatabaseError extends AppError {
  public readonly internalMessage: string;
  public readonly query?: string;
  public readonly parameters?: unknown[];

  constructor(
    internalMessage: string,
    publicMessage: string = 'Database error',
    options: {
      query?: string;
      parameters?: unknown[];
      context?: ErrorContext;
    } = {}
  ) {
    super(500, 'DATABASE_ERROR', publicMessage, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.DATABASE,
      context: options.context,
      isOperational: false,
      cause: options.context?.metadata as unknown as Error
    });
    this.internalMessage = internalMessage;
    this.query = options.query;
    this.parameters = options.parameters;
  }
}

/**
 * Network error for connection issues
 */
export class NetworkError extends AppError {
  public readonly url?: string;
  public readonly method?: string;
  public readonly timeout?: boolean;

  constructor(
    message: string = 'Network error',
    options: {
      url?: string;
      method?: string;
      timeout?: boolean;
      context?: ErrorContext;
      cause?: Error;
    } = {}
  ) {
    super(503, 'NETWORK_ERROR', message, {
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.NETWORK,
      details: {
        url: options.url,
        method: options.method,
        timeout: options.timeout
      },
      context: options.context,
      isOperational: true,
      cause: options.cause
    });
    this.url = options.url;
    this.method = options.method;
    this.timeout = options.timeout;
  }
}

/**
 * External service error for third-party API failures
 */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string;
  public readonly serviceUrl?: string;
  public readonly serviceStatus?: number;

  constructor(
    serviceName: string,
    message: string = 'External service error',
    options: {
      serviceUrl?: string;
      serviceStatus?: number;
      context?: ErrorContext;
      cause?: Error;
    } = {}
  ) {
    super(503, 'EXTERNAL_SERVICE_ERROR', message, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.EXTERNAL_SERVICE,
      details: {
        serviceName,
        serviceUrl: options.serviceUrl,
        serviceStatus: options.serviceStatus
      },
      context: options.context,
      isOperational: true,
      cause: options.cause
    });
    this.serviceName = serviceName;
    this.serviceUrl = options.serviceUrl;
    this.serviceStatus = options.serviceStatus;
  }
}

/**
 * Configuration error for missing/invalid configuration
 */
export class ConfigurationError extends AppError {
  public readonly missingKeys?: string[];
  public readonly invalidKeys?: Record<string, string>;

  constructor(
    message: string = 'Configuration error',
    options: {
      missingKeys?: string[];
      invalidKeys?: Record<string, string>;
      context?: ErrorContext;
    } = {}
  ) {
    super(500, 'CONFIGURATION_ERROR', message, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.CONFIGURATION,
      details: {
        missingKeys: options.missingKeys,
        invalidKeys: options.invalidKeys
      },
      context: options.context,
      isOperational: false
    });
    this.missingKeys = options.missingKeys;
    this.invalidKeys = options.invalidKeys;
  }
}

/**
 * Security error for security-related issues
 */
export class SecurityError extends AppError {
  public readonly threatType?: string;
  public readonly threatDetails?: Record<string, unknown>;

  constructor(
    message: string = 'Security violation detected',
    options: {
      threatType?: string;
      threatDetails?: Record<string, unknown>;
      context?: ErrorContext;
    } = {}
  ) {
    super(403, 'SECURITY_ERROR', message, {
      severity: ErrorSeverity.CRITICAL,
      category: ErrorCategory.SECURITY,
      details: {
        threatType: options.threatType,
        threatDetails: options.threatDetails
      },
      context: options.context,
      isOperational: false
    });
    this.threatType = options.threatType;
    this.threatDetails = options.threatDetails;
  }
}

/**
 * Internal server error for unexpected errors
 */
export class InternalServerError extends AppError {
  public readonly originalError?: Error;

  constructor(
    message: string = 'Internal server error',
    options: {
      originalError?: Error;
      context?: ErrorContext;
    } = {}
  ) {
    super(500, 'INTERNAL_ERROR', message, {
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.INTERNAL,
      context: options.context,
      isOperational: false,
      cause: options.originalError
    });
    this.originalError = options.originalError;
  }
}

/**
 * Create error context from Express request
 */
export function createErrorContext(req: any): ErrorContext {
  return {
    requestId: req.requestId,
    timestamp: new Date(),
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
    ipAddress: req.ipAddress || "0.0.0.0" ,
    userAgent: req.headers?.['user-agent'],
    metadata: {
      headers: req.headers,
      query: req.query,
      body: req.body
    }
  };
}

/**
 * Classify an error based on its properties
 */
export function classifyError(error: Error): {
  severity: ErrorSeverity;
  category: ErrorCategory;
  isOperational: boolean;
} {
  if (error instanceof AppError) {
    return {
      severity: error.severity,
      category: error.category,
      isOperational: error.isOperational
    };
  }

  // Default classification for unknown errors
  return {
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.INTERNAL,
    isOperational: false
  };
}

/**
 * Check if an error is a specific type
 */
export function isErrorType<T extends AppError>(
  error: Error,
  errorClass: new (...args: unknown[]) => T
): error is T {
  return error instanceof errorClass;
}

/**
 * Wrap an error with additional context
 */
export function wrapError(
  error: Error,
  context: ErrorContext
): AppError {
  if (error instanceof AppError) {
    // Preserve existing error but add context
    const mergedContext = { ...error.context, ...context };
    return new (error.constructor as any)(
      error.message,
      {
        severity: error.severity,
        category: error.category,
        details: error.details,
        requestId: error.requestId,
        context: mergedContext,
        isOperational: error.isOperational,
        cause: error.cause
      }
    );
  }

  // Wrap unknown errors
  return new InternalServerError(error.message, {
    originalError: error,
    context
  });
}

/**
 * Create a user-friendly error message
 */
export function getUserFriendlyMessage(error: Error): string {
  if (error instanceof AppError) {
    // Return the message if it's safe to expose
    if (error.isOperational) {
      return error.message;
    }
    // For non-operational errors, return a generic message
    return 'An unexpected error occurred. Please try again later.';
  }

  // For unknown errors, return generic message
  return 'An unexpected error occurred. Please try again later.';
}

/**
 * Error detection utility - detect error from various sources
 */
export function detectError(
  source: unknown,
  context?: ErrorContext
): AppError | null {
  // Null/undefined is not an error
  if (source == null) {
    return null;
  }

  // Already an AppError
  if (source instanceof AppError) {
    return source;
  }

  // Error object
  if (source instanceof Error) {
    return wrapError(source, context || createErrorContext({} as any));
  }

  // String error message (non-empty)
  if (typeof source === 'string' && source.length > 0) {
    return new InternalServerError(source, { context });
  }

  // Object with error properties
  if (typeof source === 'object' && source !== null) {
    const obj = source as Record<string, unknown>;
    
    if (obj.message && typeof obj.message === 'string') {
      const error = new Error(obj.message as string);
      return wrapError(error, context || createErrorContext({} as any));
    }
    
    if (obj.error && typeof obj.error === 'string') {
      const error = new Error(obj.error as string);
      return wrapError(error, context || createErrorContext({} as any));
    }
  }

  return null;
}

/**
 * Error recovery options
 */
export interface ErrorRecoveryOptions {
  retryAfter?: number;
  maxRetries?: number;
  fallback?: () => Promise<unknown>;
  notifyUser?: boolean;
  log?: boolean;
}

/**
 * Default error recovery options
 */
export const DEFAULT_RECOVERY_OPTIONS: ErrorRecoveryOptions = {
  retryAfter: 1000, // 1 second
  maxRetries: 3,
  notifyUser: true,
  log: true
};

/**
 * Attempt to recover from an error
 */
export async function recoverFromError<T>(
  operation: () => Promise<T>,
  options: ErrorRecoveryOptions = DEFAULT_RECOVERY_OPTIONS
): Promise<T> {
  let lastError: Error | undefined;
  let retryCount = 0;

  while (retryCount <= (options.maxRetries || 3)) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      retryCount++;

      // Don't retry if it's the last attempt
      if (retryCount > (options.maxRetries || 3)) {
        break;
      }

      // Check if error is retryable
      const appError = detectError(error);
      if (appError && !appError.isRetryable()) {
        break;
      }

      // Wait before retrying
      if (options.retryAfter) {
        await new Promise(resolve => setTimeout(resolve, options.retryAfter));
      }
    }
  }

  // All retries failed
  if (options.fallback) {
    return options.fallback() as Promise<T>;
  }

  throw lastError;
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelay = 100,
    maxDelay = 10000,
    shouldRetry = () => true
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry if we shouldn't
      if (!shouldRetry(lastError)) {
        throw lastError;
      }

      // Don't retry on last attempt
      if (attempt >= maxRetries) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  NetworkError,
  ExternalServiceError,
  ConfigurationError,
  SecurityError,
  InternalServerError,
  ErrorSeverity,
  ErrorCategory,
  createErrorContext,
  classifyError,
  isErrorType,
  wrapError,
  getUserFriendlyMessage,
  detectError,
  recoverFromError,
  retryWithBackoff,
  DEFAULT_RECOVERY_OPTIONS
};
