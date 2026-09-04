import { Request } from 'express';

// Standard response shape
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// Pagination metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Build a successful API response
 */
export function successResponse<T>(
  data: T,
  req: Request,
  pagination?: PaginationMeta
): ApiResponse<T> {
  const baseMeta: ApiResponse<T>['meta'] = {
    requestId: req.requestId ?? 'unknown',
    timestamp: new Date().toISOString(),
  };

  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: pagination ? { ...baseMeta, pagination } : baseMeta,
  };

  return response;
}

/**
 * Build an error API response
 */
export function errorResponse(
  message: string,
  code: string,
  req: Request,
  details?: Record<string, unknown>,
  statusCode?: number
): { status: number; body: ApiResponse<never> } {
  const requestId = req.requestId ?? 'unknown';
  const response: ApiResponse<never> = {
    success: false,
    error: {
      message,
      code,
      requestId,
      ...(details && { details }),
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };

  // Map error codes to HTTP status codes
  const statusMap: Record<string, number> = {
    VALIDATION_ERROR: 400,
    AUTHENTICATION_ERROR: 401,
    AUTHORIZATION_ERROR: 403,
    NOT_FOUND: 404,
    RATE_LIMIT_ERROR: 429,
    DATABASE_ERROR: 500,
    INTERNAL_ERROR: 500,
  };

  return {
    status: statusCode ?? statusMap[code] ?? 500,
    body: response,
  };
}

/**
 * Build a paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  req: Request,
  total: number,
  page: number,
  limit: number
): ApiResponse<T[]> {
  const totalPages = Math.ceil(total / limit);

  return successResponse(data, req, {
    page,
    limit,
    total,
    totalPages,
  });
}

/**
 * Build a created response (201)
 */
export function createdResponse<T>(
  data: T,
  req: Request
): { status: number; body: ApiResponse<T> } {
  return {
    status: 201,
    body: successResponse(data, req),
  };
}

/**
 * Build a no content response (204)
 */
export function noContentResponse(req: Request): { status: number; body?: ApiResponse<never> } {
  return {
    status: 204,
  };
}
