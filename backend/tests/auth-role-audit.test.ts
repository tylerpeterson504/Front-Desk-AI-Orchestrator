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

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

// Invoke the route's middleware chain directly, with the real requireAuth and
// requireAdmin guards in place, to verify the audit behavior end to end. The
// requestId layer is skipped so tests control the correlation ID themselves.
const roleRoute = router.stack.find(
  layer => layer.route?.path === '/users/:id/role'
)?.route;
if (!roleRoute || roleRoute.stack.length === 0) {
  throw new Error('Role update handler is not registered');
}
const chain = roleRoute.stack
  .map(layer => layer.handle as Handler)
  .filter(handler => handler.name !== 'requestId');

/** Runs the role route's guards and handler, resolving once the route settles. */
function runRoleRoute(req: Request, res: Response, done: NextFunction): Promise<void> {
  return new Promise<void>(resolve => {
    let index = 0;
    let failed = false;
    let pending: Promise<unknown> | undefined;
    const step = (err?: unknown): void => {
      if (err !== undefined) {
        failed = true;
        done(err);
        resolve();
        return;
      }
      if (index >= chain.length) {
        resolve();
        return;
      }
      const result = chain[index++](req, res, step);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        pending = result as Promise<unknown>;
      }
    };
    step();
    if (pending) {
      pending.then(() => { if (!failed) resolve(); });
    } else if (!failed) {
      resolve();
    }
  });
}

describe('PATCH /api/auth/users/:id/role audit logging', () => {
  const actor = { userId: 'admin-actor', email: 'admin@example.com', role: 'admin' };
  const target = createMockUser({ id: 'target-user', role: 'agent' });
  let req: Request;
  let res: Response;
  let next: jest.Mock;

  const makeRequest = (overrides: Partial<Request> = {}): Request =>
    ({
      headers: { authorization: 'Bearer admin-token' },
      params: { id: target.id },
      body: { role: 'agent' },
      requestId: 'request-correlation-id',
      ...overrides
    } as Request);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(authService.getCurrentUser).mockReturnValue({ ...actor });
    jest.mocked(userService.setUserRole).mockResolvedValue({ ...target });
    req = makeRequest();
    res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    } as unknown as Response;
    next = jest.fn();
  });

  it.each(['admin', 'agent'] as const)(
    'audits a successful update to %s with separate actor, target, and request IDs',
    async role => {
      req.body = { role };
      jest.mocked(userService.setUserRole).mockResolvedValue({ ...target, role });

      await runRoleRoute(req, res, next);

      expect(authService.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(authService.getCurrentUser).toHaveBeenCalledWith('admin-token');
      expect(userService.setUserRole).toHaveBeenCalledTimes(1);
      expect(userService.setUserRole).toHaveBeenCalledWith(target.id, role);
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
    (req.headers as Record<string, string>)['x-user-id'] = 'forged-header-actor';
    (req.headers as Record<string, string>)['x-request-id'] = 'forged-header-request';

    await runRoleRoute(req, res, next);

    expect(logger.info).toHaveBeenCalledWith('user role updated', {
      user_id: target.id,
      new_role: 'agent',
      updated_by: actor.userId,
      request_id: req.requestId
    });
  });

  it('keeps the acting admin in the audit entry when demoting their own account', async () => {
    req.params.id = actor.userId;
    jest.mocked(userService.setUserRole).mockResolvedValue({ ...target, id: actor.userId });

    await runRoleRoute(req, res, next);

    expect(userService.setUserRole).toHaveBeenCalledWith(actor.userId, 'agent');
    expect(logger.info).toHaveBeenCalledWith('user role updated', {
      user_id: actor.userId,
      new_role: 'agent',
      updated_by: actor.userId,
      request_id: req.requestId
    });
  });

  it('uses the authenticated actor and correlation ID of each request', async () => {
    await runRoleRoute(req, res, next);
    jest.mocked(authService.getCurrentUser).mockReturnValue({ ...actor, userId: 'second-admin' });

    await runRoleRoute(makeRequest({ requestId: 'second-request' }), res, next);

    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenNthCalledWith(1, 'user role updated', {
      user_id: target.id,
      new_role: 'agent',
      updated_by: actor.userId,
      request_id: 'request-correlation-id'
    });
    expect(logger.info).toHaveBeenNthCalledWith(2, 'user role updated', {
      user_id: target.id,
      new_role: 'agent',
      updated_by: 'second-admin',
      request_id: 'second-request'
    });
  });

  it('waits for the role update to succeed before emitting a success audit entry', async () => {
    let resolveUpdate!: (user: Awaited<ReturnType<typeof userService.setUserRole>>) => void;
    jest.mocked(userService.setUserRole).mockReturnValue(new Promise(resolve => { resolveUpdate = resolve; }));

    const pending = runRoleRoute(req, res, next);

    expect(userService.setUserRole).toHaveBeenCalledTimes(1);
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

      await runRoleRoute(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication required', code: 'AUTHENTICATION_ERROR', requestId: req.requestId
      });
      expect(authService.getCurrentUser).not.toHaveBeenCalled();
      expect(userService.setUserRole).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('does not audit or update a role when token verification fails', async () => {
    const error = new AuthenticationError('Invalid token');
    jest.mocked(authService.getCurrentUser).mockImplementation(() => { throw error; });

    await runRoleRoute(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(userService.setUserRole).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('does not audit or update a role for an authenticated agent', async () => {
    jest.mocked(authService.getCurrentUser).mockReturnValue({ ...actor, role: 'agent' });

    await runRoleRoute(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Admin access required', code: 'AUTHORIZATION_ERROR', requestId: req.requestId
    });
    expect(userService.setUserRole).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', 'owner', 'Admin', 1, ['admin'], { role: 'admin' }].map(role => [role]))(
    'does not audit or persist invalid role %p',
    async role => {
      req.body = { role };

      await runRoleRoute(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid role', code: 'VALIDATION_ERROR', requestId: req.requestId
      });
      expect(userService.setUserRole).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  );

  it.each([
    { reason: 'a missing user', error: new NotFoundError('User', 'target-user') },
    { reason: 'a persistence failure', error: new Error('Unable to save role') }
  ])('forwards $reason without emitting a success audit entry', async ({ error }) => {
    jest.mocked(userService.setUserRole).mockRejectedValue(error);

    await runRoleRoute(req, res, next);

    expect(userService.setUserRole).toHaveBeenCalledWith(target.id, 'agent');
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(error);
    expect(logger.info).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
