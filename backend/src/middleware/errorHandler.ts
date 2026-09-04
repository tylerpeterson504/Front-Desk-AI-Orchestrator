import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import logger from '../lib/logger';

export function requestId(req: Request, res: Response, next: NextFunction) {
  req.requestId = crypto.randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    error: 'Not found',
    requestId: req.requestId,
  });
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const requestId = req.requestId || crypto.randomUUID();

  // Log full error details internally
  logger.error('Unhandled error', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.id,
  });

  // Handle AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId: err.requestId || requestId,
      ...(err.details && { details: err.details }),
    });
  }

  // Handle JWT errors
  if ((err as any).name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
      requestId,
    });
  }

  if ((err as any).name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
      requestId,
    });
  }

  // Handle validation errors (from express-validator)
  if ((err as any).name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      requestId,
      details: (err as any).details,
    });
  }

  // Default to 500
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId,
  });
}
