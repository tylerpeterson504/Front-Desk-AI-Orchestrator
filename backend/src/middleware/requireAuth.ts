import { NextFunction, Request, Response } from 'express';
import { authService } from '../services/authService';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthUser;
  }
}

function unauthorized(res: Response, requestId: unknown): Response {
  return res.status(401).json({
    error: 'Authentication required',
    code: 'AUTHENTICATION_ERROR',
    requestId
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res, req.requestId);
    return;
  }

  const token = authHeader.substring(7);
  if (!token) {
    unauthorized(res, req.requestId);
    return;
  }

  try {
    const { userId, email, role } = authService.getCurrentUser(token);
    req.auth = { userId, email, role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.role !== 'admin') {
    res.status(403).json({
      error: 'Admin access required',
      code: 'AUTHORIZATION_ERROR',
      requestId: req.requestId
    });
    return;
  }
  next();
}
