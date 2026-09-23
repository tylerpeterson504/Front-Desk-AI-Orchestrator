import { NextFunction, Request, Response } from 'express';
import { authService } from '../services/authService';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

function unauthorized(res: Response, requestId: unknown): Response {
  return res.status(401).json({
    error: 'Authentication required',
    code: 'AUTHENTICATION_ERROR',
    requestId
  });
}

// Shared Bearer-token authentication. Verifies the access token and attaches
// the acting user to req.auth so route handlers stop hand-parsing the
// Authorization header.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res, (req as any).requestId);
    return;
  }

  const token = authHeader.substring(7);
  if (!token) {
    unauthorized(res, (req as any).requestId);
    return;
  }

  try {
    const { userId, email, role } = authService.getCurrentUser(token);
    req.auth = { userId, email, role };
    next();
  } catch (err) {
    // Invalid/expired tokens flow through the shared error handler so the
    // response shape stays identical to every other auth failure.
    next(err);
  }
}

// Admin-only guard. Mount after requireAuth so the role is always present;
// it still defends in depth if a route is ever mounted without it.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth || req.auth.role !== 'admin') {
    res.status(403).json({
      error: 'Admin access required',
      code: 'AUTHORIZATION_ERROR',
      requestId: (req as any).requestId
    });
    return;
  }
  next();
}
