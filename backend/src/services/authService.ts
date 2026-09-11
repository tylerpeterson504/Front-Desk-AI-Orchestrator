import jsonwebtoken from 'jsonwebtoken';
import { User } from '../entities/User';
import { userService } from './userService';
import { refreshTokenService } from './refreshTokenService';
import { config } from '../config';
import { AppError, AuthenticationError, NotFoundError } from '../lib/errors';
import { createRequestLogger } from '../lib/logger';

export interface AuthTokens {
  token: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: Date;
}

export interface AuthResponse {
  token: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_at: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: 'admin' | 'agent';
  };
}

function generateToken(user: User): string {
  return jsonwebtoken.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.JWT_SECRET as string,
    { expiresIn: config.JWT_TTL }
  );
}

function accessTokenTtlSeconds(): number {
  const ttl = config.JWT_TTL || '15m';
  const match = ttl.match(/^(d+)([smhd]?)$/i);
  if (!match) return 15 * 60;

  const value = parseInt(match[1], 10);
  if (isNaN(value)) return 15 * 60;
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    default: return value * 60;
  }
}

function verifyToken(token: string): { userId: string; email: string; role: string } {
  try {
    return jsonwebtoken.verify(token, config.JWT_SECRET as string) as { userId: string; email: string; role: string };
  } catch (err) {
    throw new AuthenticationError('Invalid token');
  }
}

export class AuthService {
  async register(data: { email: string; password: string; name: string }, requestId?: string): Promise<AuthResponse> {
    const log = createRequestLogger(requestId || '');

    const user = await userService.createUser({
      email: data.email,
      password: data.password,
      name: data.name
    }, requestId);

    const session = await refreshTokenService.issueSession(user, {
      client: 'unknown'
    });

    log.info('User registered', { user_id: user.id, role: user.role });

    return {
      token: generateToken(user),
      expires_in: accessTokenTtlSeconds(),
      refresh_token: session.token,
      refresh_expires_at: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
  }

  async login(data: { email: string; password: string }, requestId?: string): Promise<AuthResponse> {
    const log = createRequestLogger(requestId || '');

    const user = await userService.findByEmail(data.email);
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    const isValidPassword = await userService.validatePassword(user, data.password);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    const session = await refreshTokenService.issueSession(user, {
      client: 'unknown'
    });

    log.info('User logged in', { user_id: user.id });

    return {
      token: generateToken(user),
      expires_in: accessTokenTtlSeconds(),
      refresh_token: session.token,
      refresh_expires_at: session.expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
  }

  async refresh(refreshToken: string, requestId?: string): Promise<AuthTokens> {
    const log = createRequestLogger(requestId || '');

    const session = await refreshTokenService.validateSession(refreshToken);
    const user = await userService.findById(session.user_id);

    if (!user) {
      throw new NotFoundError('User', session.user_id);
    }

    const newSession = await refreshTokenService.issueSession(user, {
      client: 'unknown'
    });

    log.info('Token refreshed', { user_id: user.id });

    return {
      token: generateToken(user),
      refreshToken: newSession.token,
      expiresIn: accessTokenTtlSeconds(),
      refreshExpiresAt: newSession.expiresAt
    };
  }

  async logout(refreshToken: string, requestId?: string): Promise<void> {
    const log = createRequestLogger(requestId || '');

    try {
      const session = await refreshTokenService.validateSession(refreshToken);
      await refreshTokenService.revokeSession(session.id);
      log.info('User logged out', { user_id: session.user_id });
    } catch (err) {
      log.warn('Logout with invalid token', { error: (err as Error).message });
    }
  }

  async logoutEverywhere(userId: string, requestId?: string): Promise<void> {
    const log = createRequestLogger(requestId || '');

    await refreshTokenService.revokeAllSessions(userId);
    log.info('User logged out everywhere', { user_id: userId });
  }

  getCurrentUser(token: string): { userId: string; email: string; role: string } {
    return verifyToken(token);
  }
}

export const authService = new AuthService();

export { generateToken, accessTokenTtlSeconds, verifyToken };