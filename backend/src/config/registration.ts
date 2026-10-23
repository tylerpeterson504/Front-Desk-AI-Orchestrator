import crypto from 'crypto';
import { config } from './index';
import { Request } from 'express';
import { AppError } from '../lib/errors';

export function getMode(): 'open' | 'invite' | 'closed' {
  return config.REGISTRATION_MODE as 'open' | 'invite' | 'closed';
}

function tokenMatches(supplied: unknown, expected: string): boolean {
  if (typeof supplied !== 'string') {
    return false;
  }
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export function assertRegistrationAllowed(req: Request): void {
  const mode = getMode();

  if (mode === 'closed') {
    throw new AppError(403, 'AUTHORIZATION_ERROR', 'Registration is currently closed');
  }

  if (mode === 'invite') {
    const expectedToken = config.REGISTRATION_INVITE_TOKEN;
    const inviteToken = req.headers['x-invite-token'] || req.body.invite_token;
    if (!expectedToken || !tokenMatches(inviteToken, expectedToken)) {
      throw new AppError(403, 'AUTHORIZATION_ERROR', 'Invalid or missing invite token');
    }
  }
}
