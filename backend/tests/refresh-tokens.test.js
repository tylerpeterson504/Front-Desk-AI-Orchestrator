// Refresh-token session tests: rotation, reuse detection, revocation.
//
// The database is mocked, so these assert the logic and the SQL intent (which
// row is updated, with which reason) rather than Postgres behavior.

const request = require('supertest');
const crypto = require('crypto');
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
const refreshTokens = require('../src/services/refreshTokens');

const USER = { id: 42, email: 'agent@example.com', name: 'Agent', role: 'agent' };
const STRONG_PASSWORD = 'correct-horse-battery';

function hourFromNow(hours = 24) {
  return new Date(Date.now() + hours * 3600 * 1000);
}

// The raw token a client would hold; the store only ever sees its hash.
function storedRow(overrides = {}) {
  return {
    id: 1,
    user_id: USER.id,
    family_id: '2b0f4c4e-0000-4000-8000-000000000000',
    expires_at: hourFromNow(24),
    revoked_at: null,
    rotated_at: null,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  db.none.mockResolvedValue(undefined);
  db.result.mockResolvedValue({ rowCount: 0 });
});

describe('login issues a session', () => {
  it('returns a short-lived access token plus a refresh token', async () => {
    db.oneOrNone.mockResolvedValueOnce({ ...USER, password: `hashed:${STRONG_PASSWORD}` });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.expires_in).toBe(900); // 15 minutes, not 12 hours
    expect(res.body.user).toEqual(USER);
    // The refresh token is not the access token, and is not a JWT.
    expect(res.body.refresh_token).not.toBe(res.body.token);
    expect(res.body.refresh_token).not.toContain('.');

    // Only a hash is persisted.
    const [, params] = db.none.mock.calls[0];
    expect(params[1]).toBe(refreshTokens.hashToken(res.body.refresh_token));
    expect(params[1]).not.toBe(res.body.refresh_token);
    expect(params[1]).toHaveLength(64);
  });

  it('never returns the stored password', async () => {
    db.oneOrNone.mockResolvedValueOnce({ ...USER, password: `hashed:${STRONG_PASSWORD}` });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: STRONG_PASSWORD });

    expect(JSON.stringify(res.body)).not.toContain('hashed:');
    expect(res.body.user.password).toBeUndefined();
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the token and mints a new access token', async () => {
    db.oneOrNone
      .mockResolvedValueOnce(storedRow()) // token lookup
      .mockResolvedValueOnce(USER); // user re-read

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: 'whatever-the-client-holds' });

    expect(res.status).toBe(200);
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.refresh_token).not.toBe('whatever-the-client-holds');
    expect(jwt.decode(res.body.token)).toMatchObject({ id: USER.id, role: USER.role });

    // The presented token is retired in the same request that issues its
    // successor: single use.
    const retire = db.none.mock.calls.find(([sql]) => sql.includes('rotated_at = NOW()'));
    expect(retire).toBeTruthy();
    expect(retire[0]).toContain("revoked_reason = 'rotated'");
    expect(retire[1]).toEqual([1]);
  });

  it('picks up a role change on refresh', async () => {
    db.oneOrNone
      .mockResolvedValueOnce(storedRow())
      .mockResolvedValueOnce({ ...USER, role: 'manager' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: 'held' });

    expect(res.status).toBe(200);
    expect(jwt.decode(res.body.token).role).toBe('manager');
  });

  it('revokes the whole family when a rotated token is replayed', async () => {
    const family = storedRow({ rotated_at: new Date(), revoked_at: new Date() });
    db.oneOrNone.mockResolvedValueOnce(family);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: 'a-stolen-copy' });

    expect(res.status).toBe(401);
    const revoke = db.none.mock.calls.find(([sql]) => sql.includes('family_id = $1'));
    expect(revoke[1]).toEqual([family.family_id, 'reuse_detected']);
    // No successor was minted.
    expect(db.none.mock.calls.some(([sql]) => sql.includes('INSERT INTO refresh_tokens'))).toBe(false);
  });

  it('rejects an expired refresh token without rotating', async () => {
    db.oneOrNone.mockResolvedValueOnce(storedRow({ expires_at: new Date(Date.now() - 1000) }));

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'stale' });

    expect(res.status).toBe(401);
    expect(db.none.mock.calls.some(([sql]) => sql.includes('INSERT INTO refresh_tokens'))).toBe(false);
  });

  it('rejects an unknown token', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'nope' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid refresh token');
  });

  it('requires a token in the body', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('rejects the session when the user has been deleted', async () => {
    db.oneOrNone
      .mockResolvedValueOnce(storedRow())
      .mockResolvedValueOnce(null); // user gone

    const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'held' });

    expect(res.status).toBe(401);
    const revoke = db.none.mock.calls.find(([sql]) => sql.includes('family_id = $1'));
    expect(revoke[1][1]).toBe('user_missing');
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the family behind the presented token', async () => {
    db.oneOrNone.mockResolvedValueOnce({ family_id: 'fam-1' });

    const res = await request(app).post('/api/auth/logout').send({ refresh_token: 'held' });

    expect(res.status).toBe(204);
    const revoke = db.none.mock.calls.find(([sql]) => sql.includes('family_id = $1'));
    expect(revoke[1]).toEqual(['fam-1', 'logout']);
  });

  it('is idempotent and does not confirm whether a token existed', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);

    const res = await request(app).post('/api/auth/logout').send({ refresh_token: 'unknown' });

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('tolerates a missing token', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(204);
  });
});

describe('POST /api/auth/logout-all', () => {
  function authHeader(user = USER) {
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'dev-secret-change-in-production'
    );
    return `Bearer ${token}`;
  }

  it('revokes every live session for the caller', async () => {
    db.result.mockResolvedValueOnce({ rowCount: 3 });

    const res = await request(app)
      .post('/api/auth/logout-all')
      .set('Authorization', authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked_sessions: 3 });
    const [sql, params] = db.result.mock.calls[0];
    expect(sql).toContain('revoked_at IS NULL');
    expect(params).toEqual([USER.id, 'logout_all']);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/logout-all');
    expect(res.status).toBe(401);
  });
});

describe('rate limiting', () => {
  // The brute-force limiter allows 20 requests per 15 minutes per IP. Refresh
  // must not draw on that budget: a shared front-desk IP with 15-minute access
  // tokens would burn through it on legitimate refreshes and log everyone out.
  it('does not count refresh calls against the credential limiter', async () => {
    db.oneOrNone.mockResolvedValue(null);

    const statuses = [];
    for (let i = 0; i < 30; i += 1) {
      const res = await request(app).post('/api/auth/refresh').send({ refresh_token: 'x' });
      statuses.push(res.status);
    }

    expect(statuses.every((status) => status === 401)).toBe(true);
    expect(statuses).not.toContain(429);
  });
});

describe('a role change ends existing sessions', () => {
  it('revokes the target user sessions so the old role cannot be refreshed', async () => {
    const admin = { id: 1, email: 'admin@example.com', role: 'admin' };
    const token = jwt.sign(admin, process.env.JWT_SECRET || 'dev-secret-change-in-production');

    db.oneOrNone.mockResolvedValueOnce({ ...USER, role: 'manager' });
    db.result.mockResolvedValueOnce({ rowCount: 2 });

    const res = await request(app)
      .patch(`/api/auth/users/${USER.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'manager' });

    expect(res.status).toBe(200);
    const [, params] = db.result.mock.calls[0];
    expect(params).toEqual([USER.id, 'role_changed']);
  });
});

describe('refresh token store', () => {
  it('hashes with SHA-256 and never stores the raw value', async () => {
    const raw = 'a-raw-token';
    expect(refreshTokens.hashToken(raw)).toBe(
      crypto.createHash('sha256').update(raw).digest('hex')
    );
  });

  it('clamps a nonsense TTL to the default', () => {
    const original = process.env.REFRESH_TOKEN_TTL_DAYS;
    try {
      for (const bad of ['0', '-5', 'forever', '9999', '']) {
        process.env.REFRESH_TOKEN_TTL_DAYS = bad;
        expect(refreshTokens.ttlDays()).toBe(30);
      }
      process.env.REFRESH_TOKEN_TTL_DAYS = '7';
      expect(refreshTokens.ttlDays()).toBe(7);
    } finally {
      if (original === undefined) delete process.env.REFRESH_TOKEN_TTL_DAYS;
      else process.env.REFRESH_TOKEN_TTL_DAYS = original;
    }
  });

  it('issues unique tokens per session', async () => {
    const first = await refreshTokens.issueSession(USER);
    const second = await refreshTokens.issueSession(USER);
    expect(first.token).not.toBe(second.token);
    // Distinct families: two logins are two independent sessions.
    expect(db.none.mock.calls[0][1][2]).not.toBe(db.none.mock.calls[1][1][2]);
  });

  it('deletes expired rows without touching live ones', async () => {
    db.result.mockResolvedValueOnce({ rowCount: 11 });
    await expect(refreshTokens.deleteExpired()).resolves.toBe(11);
    expect(db.result.mock.calls[0][0]).toContain('expires_at < NOW()');
  });
});
