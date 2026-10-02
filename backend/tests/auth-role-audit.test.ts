import type { NextFunction, Request, Response } from 'express';
import router from '../src/routes/auth';
import { authService } from '../src/services/authService';
import { userService } from '../src/services/userService';
import { AuthenticationError, NotFoundError } from '../src/lib/errors';
import logger from '../src/lib/logger';
import { createMockUser } from './utils';

jest.mock('../src/services/authService', () => ({
  authService: { getCurrentUser: jest.fn() }
}));
jest.mock('../src/services/userService', () => ({
  userService: { setUserRole: jest.fn() }
}));
jest.mock('../src/config', () => ({ config: {} }));
jest.mock('../src/lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn() }
}));

type RoleHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Invoke the registered handler directly to isolate its audit behavior from
// request-ID generation, HTTP transport, and the application error handler.
const roleRoute = router.stack.find(
  layer => layer.route?.path === '/users/:id/role'
)?.route;
if (!roleRoute || roleRoute.stack.length === 0) {
  throw new Error('Role update handler is not registered');
}
const updateRole = roleRoute.stack[roleRoute.stack.length - 1].handle as RoleHandler;
const getCurrentUser = jest.mocked(authService.getCurrentUser);
const setUserRole = jest.mocked(userService.setUserRole);

describe('PATCH /api/auth/users/:id/role audit logging', () => {
  const actor = { userId: 'admin-actor', email: 'admin@example.com', role: 'admin' };
  const target = createMockUser({ id: 'target-user', role: 'agent' });
  let req: Request;
  let res: Response;
  let next: jest.Mock;

  beforeEach(() => {
    jest.resetAllMocks();
    getCurrentUser.mockReturnValue({ ...actor });
    setUserRole.mockResolvedValue({ ...target });
    req = {
      headers: { authorization: 'Bearer admin-token' },
      params: { id: target.id },
      body: { role: 'agent' },
      requestId: 'request-correlation-id'
    } as unknown as Request;
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as unknown as Response;
    next = jest.fn();
  });

  it.each(['admin', 'agent'] as const)(
    'audits a successful update to %s with separate actor, target, and request IDs',
    async role => {
      req.body = { role };
      setUserRole.mockResolvedValue({ ...target, role });

      await updateRole(req, res, next);

      expect(getCurrentUser).toHaveBeenCalledTimes(1);
      expect(getCurrentUser).toHaveBeenCalledWith('admin-token');
      expect(setUserRole).toHaveBeenCalledTimes(1);
      expect(setUserRole).toHaveBeenCalledWith(target.id, role);
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('user role updated', {
        user_id: target.id,
        new_role: role,
        updated_by: actor.userId,
        request_id: req.requestId
      });
      expect(res.json).toHaveBeenCalledWith({
        id: target.id,
        email: target.email,
        name: target.name,
        role
      });
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('ignores client-supplied audit identities in the body and headers', async () => {
    req.body = {
      role: 'agent',
      userId: 'forged-actor',
      updated_by: 'forged-updater',
      request_id: 'forged-request'
    };
    req.headers['x-user-id'] = 'forged-header-actor';
    req.headers['x-request-id'] = 'forged-header-request';

    await updateRole(req, res, next);

    expect(logger.info).toHaveBeenCalledWith('user role updated', {
      user_id: target.id,
      new_role: 'agent',
      updated_by: actor.userId,
      request_id: req.requestId
    });
  });

  it('keeps the acting admin in the audit entry when demoting their own account', async () => {
    req.params.id = actor.userId;
    setUserRole.mockResolvedValue({ ...target, id: actor.userId });

    await updateRole(req, res, next);

    expect(setUserRole).toHaveBeenCalledWith(actor.userId, 'agent');
    expect(logger.info).toHaveBeenCalledWith('user role updated', {
      user_id: actor.userId,
      new_role: 'agent',
      updated_by: actor.userId,
      request_id: req.requestId
    });
  });

  it('uses the authenticated actor and correlation ID of each request', async () => {
    await updateRole(req, res, next);
    getCurrentUser.mockReturnValue({ ...actor, userId: 'second-admin' });

    await updateRole({ ...req, requestId: 'second-request' } as Request, res, next);

    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenNthCalledWith(1, 'user role updated', {
      user_id: target.id, new_role: 'agent',
      updated_by: actor.userId, request_id: 'request-correlation-id'
    });
    expect(logger.info).toHaveBeenNthCalledWith(2, 'user role updated', {
      user_id: target.id, new_role: 'agent',
      updated_by: 'second-admin', request_id: 'second-request'
    });
  });

  it('waits for the role update to succeed before emitting a success audit entry', async () => {
    let resolveUpdate!: (user: Awaited<ReturnType<typeof userService.setUserRole>>) => void;
    setUserRole.mockReturnValue(new Promise(resolve => { resolveUpdate = resolve; }));

    const pending = updateRole(req, res, next);

    expect(setUserRole).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();

    resolveUpdate({ ...target });
    await pending;

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'Basic credentials', 'bearer admin-token'])(
    'does not audit or update a role for authorization header %p',
    async authorization => {
      req.headers.authorization = authorization;

      await updateRole(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required', code: 'AUTHENTICATION_ERROR', requestId: req.requestId
      });
      expect(getCurrentUser).not.toHaveBeenCalled();
      expect(setUserRole).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('does not audit or update a role when token verification fails', async () => {
    const error = new AuthenticationError('Invalid token');
    getCurrentUser.mockImplementation(() => { throw error; });

    await updateRole(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(setUserRole).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('does not audit or update a role for an authenticated agent', async () => {
    getCurrentUser.mockReturnValue({ ...actor, role: 'agent' });

    await updateRole(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Admin access required', code: 'AUTHORIZATION_ERROR', requestId: req.requestId
    });
    expect(setUserRole).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 'owner', 'Admin', 1, ['admin'], { role: 'admin' }].map(role => [role]))(
    'does not audit or persist invalid role %p',
    async role => {
      req.body = { role };

      await updateRole(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid role', code: 'VALIDATION_ERROR', requestId: req.requestId
      });
      expect(setUserRole).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  );

  it.each([
    { reason: 'a missing user', error: new NotFoundError('User', 'target-user') },
    { reason: 'a persistence failure', error: new Error('Unable to save role') }
  ])('forwards $reason without emitting a success audit entry', async ({ error }) => {
    setUserRole.mockRejectedValue(error);

    await updateRole(req, res, next);

    expect(setUserRole).toHaveBeenCalledWith(target.id, 'agent');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(error);
    expect(logger.info).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
