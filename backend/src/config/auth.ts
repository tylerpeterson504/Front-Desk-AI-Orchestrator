import * as jsonwebtoken from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config, JWT_SECRET, Config } from './index';
import { AuthenticationError } from '../lib/errors';

export function generateToken(user: { userId: string; email: string; role: string }): string {
  return jsonwebtoken.sign(
    { userId: user.userId, email: user.email, role: user.role },
    JWT_SECRET as string,
    { expiresIn: (config as Config).JWT_TTL as string }
  );
}

export function accessTokenTtlSeconds(): number {
  const ttl = (config as Config).JWT_TTL ?? '15m';
  const match = ttl.match(/^(\d+)([smhd]?)$/i);
  if (!match) return 15 * 60; // 15 minutes default

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 60 * 60 * 24;
    default:
      return value * 60; // Assume minutes
  }
}

export function verifyToken(token: string): { userId: string; email: string; role: string } {
  try {
    return jsonwebtoken.verify(token, JWT_SECRET as string) as {
      userId: string;
      email: string;
      role: string;
    };
  } catch (err: unknown) {
    throw new AuthenticationError('Invalid token');
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTHENTICATION_ERROR',
      requestId: req.requestId ?? 'unknown',
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyToken(token);
    (req as { user?: unknown }).user = decoded;
    next();
  } catch {
    res.status(401).json({
      error: 'Invalid token',
      code: 'AUTHENTICATION_ERROR',
      requestId: req.requestId ?? 'unknown',
    });
    return;
  }
}

export function requireRole(
  roles: string[]
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as { user?: { role?: string } }).user;

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_ERROR',
        requestId: req.requestId ?? 'unknown',
      });
      return;
    }

    if (!roles.includes(user.role ?? '')) {
      res.status(403).json({
        error: 'Insufficient permissions',
        code: 'AUTHORIZATION_ERROR',
        requestId: req.requestId ?? 'unknown',
      });
      return;
    }

    next();
  };
}
