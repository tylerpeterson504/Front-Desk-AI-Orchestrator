import { assertRegistrationAllowed } from '../src/config/registration';
import { config } from '../src/config';
import { AppError } from '../src/lib/errors';

const INVITE_TOKEN = 'registration-invite-token-0123456789abcdef';

function requestWith(inviteToken?: string, body: Record<string, unknown> = {}): any {
  return {
    headers: inviteToken === undefined ? {} : { 'x-invite-token': inviteToken },
    body,
  };
}

function rejectionFor(req: any): AppError {
  try {
    assertRegistrationAllowed(req);
  } catch (error) {
    return error as AppError;
  }
  throw new Error('registration was allowed');
}

describe('assertRegistrationAllowed', () => {
  const original = {
    mode: config.REGISTRATION_MODE,
    token: config.REGISTRATION_INVITE_TOKEN,
  };

  afterEach(() => {
    config.REGISTRATION_MODE = original.mode;
    config.REGISTRATION_INVITE_TOKEN = original.token;
  });

  describe('invite mode', () => {
    beforeEach(() => {
      config.REGISTRATION_MODE = 'invite';
    });

    it('rejects registration when no invite token is configured', () => {
      config.REGISTRATION_INVITE_TOKEN = undefined;

      expect(rejectionFor(requestWith())).toMatchObject({
        statusCode: 403,
        code: 'AUTHORIZATION_ERROR',
        message: 'Invalid or missing invite token',
      });
    });

    it('rejects a supplied token when no invite token is configured', () => {
      config.REGISTRATION_INVITE_TOKEN = undefined;

      expect(() => assertRegistrationAllowed(requestWith(INVITE_TOKEN))).toThrow(AppError);
    });

    it('rejects registration when the configured token is empty', () => {
      config.REGISTRATION_INVITE_TOKEN = '';

      expect(() => assertRegistrationAllowed(requestWith(''))).toThrow(AppError);
    });

    it('rejects registration without a token when one is configured', () => {
      config.REGISTRATION_INVITE_TOKEN = INVITE_TOKEN;

      expect(rejectionFor(requestWith())).toMatchObject({
        statusCode: 403,
        code: 'AUTHORIZATION_ERROR',
        message: 'Invalid or missing invite token',
      });
    });

    it('rejects a wrong token of the same length', () => {
      config.REGISTRATION_INVITE_TOKEN = INVITE_TOKEN;

      expect(() =>
        assertRegistrationAllowed(requestWith('x'.repeat(INVITE_TOKEN.length)))
      ).toThrow(AppError);
    });

    it('rejects a wrong token of a different length', () => {
      config.REGISTRATION_INVITE_TOKEN = INVITE_TOKEN;

      expect(() =>
        assertRegistrationAllowed(requestWith(INVITE_TOKEN.slice(0, -1)))
      ).toThrow(AppError);
    });

    it('accepts the configured token sent in the invite header', () => {
      config.REGISTRATION_INVITE_TOKEN = INVITE_TOKEN;

      expect(() => assertRegistrationAllowed(requestWith(INVITE_TOKEN))).not.toThrow();
    });

    it('accepts the configured token sent in the request body', () => {
      config.REGISTRATION_INVITE_TOKEN = INVITE_TOKEN;

      expect(() =>
        assertRegistrationAllowed(requestWith(undefined, { invite_token: INVITE_TOKEN }))
      ).not.toThrow();
    });
  });

  describe('closed mode', () => {
    it('rejects every registration, even with the configured token', () => {
      config.REGISTRATION_MODE = 'closed';
      config.REGISTRATION_INVITE_TOKEN = INVITE_TOKEN;

      expect(rejectionFor(requestWith(INVITE_TOKEN))).toMatchObject({
        statusCode: 403,
        code: 'AUTHORIZATION_ERROR',
        message: 'Registration is currently closed',
      });
    });
  });
});
