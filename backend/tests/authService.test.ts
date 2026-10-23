import { authService } from '../src/services/authService';
import { refreshTokenService } from '../src/services/refreshTokenService';
import { userService } from '../src/services/userService';
import { createMockUser } from './utils';

jest.mock('../src/config', () => ({
  config: {
    JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
    JWT_TTL: '15m'
  }
}));

jest.mock('../src/lib/logger', () => ({
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

jest.mock('../src/services/refreshTokenService', () => ({
  refreshTokenService: {
    issueSession: jest.fn(),
    validateSession: jest.fn(),
    shortenSession: jest.fn(),
    revokeSession: jest.fn()
  }
}));

jest.mock('../src/services/userService', () => ({
  userService: {
    findById: jest.fn()
  }
}));

const sessions = refreshTokenService as unknown as Record<
  'issueSession' | 'validateSession' | 'shortenSession' | 'revokeSession',
  jest.Mock
>;
const users = userService as unknown as { findById: jest.Mock };

describe('authService refresh and logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('refresh', () => {
    it('shortens the presented session to the grace window after issuing a replacement', async () => {
      sessions.validateSession.mockResolvedValue({
        id: 11,
        token: 'presented',
        user_id: 'user-1',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      users.findById.mockResolvedValue(createMockUser({ id: 'user-1' }));
      sessions.issueSession.mockResolvedValue({
        id: 12,
        token: 'replacement',
        user_id: 'user-1',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      const tokens = await authService.refresh('presented');

      expect(tokens.refreshToken).toBe('replacement');
      expect(sessions.shortenSession).toHaveBeenCalledWith(11, 60 * 1000);
      expect(sessions.shortenSession.mock.invocationCallOrder[0]).toBeGreaterThan(
        sessions.issueSession.mock.invocationCallOrder[0]
      );
    });
  });

  describe('logout', () => {
    it('revokes the presented session immediately', async () => {
      sessions.validateSession.mockResolvedValue({
        id: 11,
        token: 'presented',
        user_id: 'user-1',
        expiresAt: new Date(Date.now() + 60 * 1000)
      });

      await authService.logout('presented');

      expect(sessions.revokeSession).toHaveBeenCalledWith(11);
    });
  });
});
