import { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
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

export class ResponseBuilder {
  private response: ApiResponse<unknown> = {
    success: true,
    meta: {
      requestId: '',
      timestamp: new Date().toISOString()
    }
  };

  constructor(private requestId: string) {
    this.response.meta!.requestId = requestId;
  }

  ok<T>(data: T): ApiResponse<T> {
    return {
      ...this.response,
      data,
      success: true
    };
  }

  created<T>(data: T): ApiResponse<T> {
    return {
      ...this.response,
      data,
      success: true
    };
  }

  error(code: string, message: string, details?: Record<string, unknown>): ApiResponse<never> {
    return {
      ...this.response,
      success: false,
      error: {
        code,
        message,
        ...(details && { details })
      }
    };
  }

  paginated<T>(data: T[], pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }): ApiResponse<T[]> {
    return {
      ...this.response,
      data,
      meta: {
        ...this.response.meta,
        pagination
      },
      success: true
    };
  }
}

export function createResponseBuilder(requestId: string) {
  return new ResponseBuilder(requestId);
}

// Middleware to add response builder to request
export function responseBuilder(req: Request, res: Response, next: NextFunction) {
  (res as any).locals = (res as any).locals || {};
  (res as any).locals.response = createResponseBuilder(req.requestId);
  next();
}
