import crypto from 'crypto';
import { getRepository } from '../config/database';
import { RefreshToken } from '../entities/RefreshToken';
import { User } from '../entities/User';
import { AppError, NotFoundError, AuthenticationError } from '../lib/errors';
import { config } from '../config';

export interface Session {
  id: number;
  token: string;
  user_id: string;
  expiresAt: Date;
}

export interface SessionOptions {
  client?: string | null;
}

const TOKEN_LENGTH = 64;
const DEFAULT_TTL_DAYS = 30;

export class RefreshTokenService {
  private refreshTokenRepository = getRepository<RefreshToken>(RefreshToken);

  async issueSession(user: User, options: SessionOptions = {}): Promise<Session> {
    const token = crypto.randomBytes(TOKEN_LENGTH).toString('base64url');
    const ttlDays = parseInt(config.REFRESH_TOKEN_TTL_DAYS?.toString() || '30', 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    const refreshToken = this.refreshTokenRepository.create({
      token,
      user_id: user.id,
      expires_at: expiresAt,
      is_revoked: false,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return {
      id: refreshToken.id,
      token: refreshToken.token,
      user_id: refreshToken.user_id,
      expiresAt: refreshToken.expires_at,
    };
  }

  async validateSession(token: string): Promise<Session> {
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token, is_revoked: false },
    });

    if (!refreshToken) {
      throw new AuthenticationError('Invalid refresh token');
    }

    if (refreshToken.expires_at < new Date()) {
      throw new AuthenticationError('Refresh token expired');
    }

    return {
      id: refreshToken.id,
      token: refreshToken.token,
      user_id: refreshToken.user_id,
      expiresAt: refreshToken.expires_at,
    };
  }

  async revokeSession(sessionId: number): Promise<void> {
    await this.refreshTokenRepository.update(sessionId, { is_revoked: true });
  }

  async revokeSessionByToken(token: string): Promise<void> {
    await this.refreshTokenRepository.update({ token }, { is_revoked: true });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.refreshTokenRepository.update({ user_id: userId }, { is_revoked: true });
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expires_at: new Date(),
    });
    return result.affected || 0;
  }
}

export const refreshTokenService = new RefreshTokenService();
