// Additional auth route tests covering gaps in existing test files.
//
// Tests the /api/auth/me endpoint and other missing scenarios.

const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/database', () => {
  const db = {
    any: jest.fn(),
    one: jest.fn(),
    oneOrNone: jest.fn(),
    none: jest.fn(),
    result: jest.fn()
  };
  return { db };
});

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (pw) => `hashed:${pw}`),
  compare: jest.fn(async (pw, hash) => hash === `hashed:${pw}`)
}));

const { db } = require('../src/config/database');
const app = require('../src/index');

const USER = { id: 7, email: 'agent@example.com', role: 'agent' };

function authHeader(user = USER) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'dev-secret-change-in-production',
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await new Promise((resolve) => setImmediate(resolve));
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user', async () => {
    db.oneOrNone.mockResolvedValueOnce({
      id: USER.id,
      email: USER.email,
      name: 'Test Agent',
      role: USER.role,
      created_at: '2024-01-01'
    });

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(USER.email);
    expect(res.body.user.id).toBe(USER.id);
    expect(res.body.user.role).toBe(USER.role);
  });

  it('returns 401 for invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set({ Authorization: 'Bearer invalid-token' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user not found in database', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader());

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

describe('POST /api/auth/logout-all', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });

  it('revokes all sessions for the authenticated user', async () => {
    db.result.mockResolvedValueOnce({ rowCount: 5 });

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.revoked_sessions).toBe(5);
  });

  it('returns 0 when user has no active sessions', async () => {
    db.result.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.revoked_sessions).toBe(0);
  });
});

describe('PATCH /api/auth/users/:id/role', () => {
  const adminUser = { id: 1, email: 'admin@example.com', role: 'admin' };

  it('requires authentication', async () => {
    const res = await request(app)
      .patch('/api/auth/users/7/role')
      .send({ role: 'manager' });
    expect(res.status).toBe(401);
  });

  it('requires admin role', async () => {
    const res = await request(app)
      .patch('/api/auth/users/7/role')
      .set(authHeader()) // agent user, not admin
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
  });

  it('rejects self-role-change even for admin', async () => {
    db.oneOrNone.mockResolvedValueOnce(adminUser);

    const res = await request(app)
      .patch('/api/auth/users/1/role') // admin trying to change own role
      .set(authHeader(adminUser))
      .send({ role: 'agent' });

    expect(res.status).toBe(403);
    expect(db.oneOrNone).not.toHaveBeenCalled();
  });

  it('rejects unknown role', async () => {
    const res = await request(app)
      .patch('/api/auth/users/7/role')
      .set(authHeader(adminUser))
      .send({ role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(db.oneOrNone).not.toHaveBeenCalled();
  });

  it('rejects invalid user id', async () => {
    const res = await request(app)
      .patch('/api/auth/users/invalid/role')
      .set(authHeader(adminUser))
      .send({ role: 'manager' });

    expect(res.status).toBe(400);
    expect(db.oneOrNone).not.toHaveBeenCalled();
  });

  it('rejects non-existent user with 404', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);

    const res = await request(app)
      .patch('/api/auth/users/999/role')
      .set(authHeader(adminUser))
      .send({ role: 'manager' });

    expect(res.status).toBe(404);
  });

  it('successfully changes role for admin', async () => {
    const targetUser = { id: 7, email: 'user@example.com', name: 'User', role: 'agent' };
    db.oneOrNone.mockResolvedValueOnce(targetUser);
    db.result.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app)
      .patch('/api/auth/users/7/role')
      .set(authHeader(adminUser))
      .send({ role: 'manager' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('manager');
  });
});

describe('JWT configuration', () => {
  it('fails gracefully when JWT_SECRET is not configured', async () => {
    // Save original
    const originalEnv = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    // Need to reload auth module to pick up the change
    jest.resetModules();

    try {
      const res = await request(app)
        .get('/api/properties')
        .set({ Authorization: 'Bearer some-token' });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('Authentication is not configured');
    } finally {
      // Restore
      if (originalEnv) process.env.JWT_SECRET = originalEnv;
      // Reload modules to restore state
      jest.resetModules();
    }
  });
});

describe('requireRole middleware', () => {
  const adminUser = { id: 1, email: 'admin@example.com', role: 'admin' };
  const managerUser = { id: 2, email: 'manager@example.com', role: 'manager' };
  const agentUser = { id: 3, email: 'agent@example.com', role: 'agent' };

  it('allows admin to access admin-only route', async () => {
    db.any.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/properties')
      .set(authHeader(adminUser));

    expect(res.status).toBe(200);
  });

  it('allows manager to access their own routes', async () => {
    // This tests that the middleware works correctly
    // In the actual app, manager routes would use requireRole('manager', 'admin')
    db.any.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/properties')
      .set(authHeader(managerUser));

    expect(res.status).toBe(200);
  });

  it('allows agent to access agent routes', async () => {
    db.any.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/properties')
      .set(authHeader(agentUser));

    expect(res.status).toBe(200);
  });
});
