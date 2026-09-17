import jsonwebtoken from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from './index';
import { AuthenticationError } from '../lib/errors';

export function generateToken(user: { userId: string; email: string; role: string }): string {
  return jsonwebtoken.sign(
    { userId: user.userId, email: user.email, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_TTL }
  );
}

export function accessTokenTtlSeconds(): number {
  const ttl = config.JWT_TTL || '15m';
  const match = ttl.match(/^(\d+)([smhd]?)$/i);
  if (!match) return 15 * 60; // 15 minutes default

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    default: return value * 60; // Assume minutes
  }
}

export function verifyToken(token: string): { userId: string; email: string; role: string } {
  try {
    return jsonwebtoken.verify(token, config.JWT_SECRET) as { userId: string; email: string; role: string };
  } catch (err) {
    throw new AuthenticationError('Invalid token');
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTHENTICATION_ERROR',
      requestId: req.requestId
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = verifyToken(token);
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Invalid token',
      code: 'AUTHENTICATION_ERROR',
      requestId: req.requestId
    });
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_ERROR',
        requestId: req.requestId
      });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'AUTHORIZATION_ERROR',
        requestId: req.requestId
      });
    }

    next();
  };
}
