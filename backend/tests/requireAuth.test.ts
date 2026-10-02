jest.mock('../src/services/authService', () => ({
  authService: {
    getCurrentUser: jest.fn()
  }
}));

import { requireAuth, requireAdmin } from '../src/middleware/requireAuth';
import { authService } from '../src/services/authService';

const mockedGetCurrentUser = authService.getCurrentUser as jest.Mock;

function mockRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  } as any;
}

describe('requireAuth', () => {
  beforeEach(() => {
    mockedGetCurrentUser.mockReset();
  });

  it('rejects requests without a Bearer token', () => {
    const req: any = { headers: {}, requestId: 'req-1' };
    const res = mockRes();
    requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTHENTICATION_ERROR', requestId: 'req-1' })
    );
  });

  it('rejects requests with an empty Bearer token', () => {
    const req: any = { headers: { authorization: 'Bearer ' }, requestId: 'req-2' };
    const res = mockRes();
    requireAuth(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('attaches the authenticated user to req.auth', () => {
    mockedGetCurrentUser.mockReturnValue({ userId: 'u1', email: 'a@b.c', role: 'admin' });
    const next = jest.fn();
    const req: any = { headers: { authorization: 'Bearer tok' }, requestId: 'req-3' };
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toEqual({ userId: 'u1', email: 'a@b.c', role: 'admin' });
  });

  it('forwards invalid tokens to the error handler', () => {
    mockedGetCurrentUser.mockImplementation(() => {
      throw new Error('Invalid token');
    });
    const next = jest.fn();
    requireAuth({ headers: { authorization: 'Bearer bad' }, requestId: 'req-4' } as any, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('requireAdmin', () => {
  it('allows admins', () => {
    const next = jest.fn();
    requireAdmin({ auth: { userId: 'u1', role: 'admin' }, requestId: 'r' } as any, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects non-admins with 403', () => {
    const res = mockRes();
    requireAdmin({ auth: { userId: 'u2', role: 'agent' }, requestId: 'r' } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTHORIZATION_ERROR' })
    );
  });

  it('defends in depth when mounted without requireAuth', () => {
    const res = mockRes();
    requireAdmin({ requestId: 'r' } as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
