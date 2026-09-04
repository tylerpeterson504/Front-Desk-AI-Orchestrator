import { config, Config } from './index';
import { Request } from 'express';
import { AppError } from '../lib/errors';

export function getMode(): 'open' | 'invite' | 'closed' {
  return (config as Config).REGISTRATION_MODE;
}

export function assertRegistrationAllowed(req: Request): void {
  const mode = getMode();

  if (mode === 'closed') {
    throw new AppError(403, 'AUTHORIZATION_ERROR', 'Registration is currently closed');
  }

  if (mode === 'invite') {
    const inviteToken = req.headers['x-invite-token'] ?? req.body.invite_token;
    if (inviteToken !== (config as Config).REGISTRATION_INVITE_TOKEN) {
      throw new AppError(403, 'AUTHORIZATION_ERROR', 'Invalid or missing invite token');
    }
  }
}
