// Backend route tests (Jest, run from backend/ via `npm test`).
//
// All pg-promise access is mocked so the suites exercise routing, auth
// enforcement, input validation, and user-scoping without a live database.
const fs = require('fs');
const path = require('path');
const request = require('supertest');

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

jest.mock('../src/services/llm', () => ({
  MODEL_NAME: 'test-model',
  draftGuestReply: jest.fn(),
  buildPrompt: jest.requireActual('../src/services/llm').buildPrompt
}));
const { draftGuestReply, buildPrompt } = require('../src/services/llm');

const USER = { id: 7, email: 'agent@example.com', role: 'agent' };

function authHeader(userId = USER.id) {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { id: userId, email: USER.email, role: USER.role },
    process.env.JWT_SECRET || 'dev-secret-change-in-production',
    { expiresIn: '1h' }
  );
  return { Authorization: `Bearer ${token}` };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  // Allow jest to exit: pg-promise pool is never initialized against a real DB
  await new Promise((resolve) => setImmediate(resolve));
});

describe('auth routes', () => {
  describe('POST /api/auth/register', () => {
    it('creates a user and returns a token', async () => {
      db.one.mockResolvedValueOnce({ id: 1, email: 'a@b.c', name: 'A', role: 'agent', created_at: 'now' });
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'a@b.c', password: 'correct-horse-battery', name: 'A' });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.email).toBe('a@b.c');
      expect(db.one).toHaveBeenCalledTimes(1);
    });

    it('400s when fields are missing', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'a@b.c' });
      expect(res.status).toBe(400);
      expect(db.one).not.toHaveBeenCalled();
    });

    it('409s on duplicate email (pg 23505)', async () => {
      db.one.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'dup@b.c', password: 'correct-horse-battery', name: 'D' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already in use');
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in with valid credentials', async () => {
      db.oneOrNone.mockResolvedValueOnce({ id: 1, email: 'a@b.c', password: 'hashed:pw', role: 'agent' });
      const res = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'pw' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.user.id).toBe(1);
    });

    it('401s on unknown email', async () => {
      db.oneOrNone.mockResolvedValueOnce(null);
      const res = await request(app).post('/api/auth/login').send({ email: 'no@b.c', password: 'pw' });
      expect(res.status).toBe(401);
    });

    it('401s on wrong password', async () => {
      db.oneOrNone.mockResolvedValueOnce({ id: 1, email: 'a@b.c', password: 'hashed:other', role: 'agent' });
      const res = await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'pw' });
      expect(res.status).toBe(401);
    });

    it('400s when credentials are missing', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });
  });
});

describe('auth enforcement', () => {
  const protectedPaths = [
    ['get', '/api/properties'],
    ['get', '/api/templates'],
    ['get', '/api/shift-notes'],
    ['get', '/api/audit-logs']
  ];

  it.each(protectedPaths)('%s requires a token', async (method, path) => {
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token with 403', async () => {
    const res = await request(app).get('/api/properties').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(403);
  });
});

describe('properties routes', () => {
  it('lists only the caller\'s properties', async () => {
    db.any.mockResolvedValueOnce([{ id: 1, name: 'P1' }]);
    const res = await request(app).get('/api/properties').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(db.any).toHaveBeenCalledWith(
      'SELECT id, user_id, name, url_pattern, wifi_ssid, checkout_time, tone_guidelines, created_at, updated_at FROM properties WHERE user_id = $1 ORDER BY name',
      [USER.id]
    );
  });

  it('never selects wifi_password in list or get', async () => {
    db.any.mockResolvedValueOnce([]);
    await request(app).get('/api/properties').set(authHeader());
    expect(db.any.mock.calls[0][0]).not.toContain('wifi_password');

    db.oneOrNone.mockResolvedValueOnce(null);
    await request(app).get('/api/properties/1').set(authHeader());
    expect(db.oneOrNone.mock.calls[0][0]).not.toContain('wifi_password');
  });

  it('reveals wifi only via the audit-logged endpoint', async () => {
    db.oneOrNone.mockResolvedValueOnce({ id: 1, name: 'P1', wifi_ssid: 'Guest', wifi_password: 'secret123' });
    const res = await request(app).get('/api/properties/1/wifi').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ssid: 'Guest', password: 'secret123' });
    // Reveal is audit-logged
    expect(db.none).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining([USER.id, 1, 'wifi_password_revealed'])
    );
  });

  it('404s the wifi endpoint on a foreign property', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/properties/99/wifi').set(authHeader());
    expect(res.status).toBe(404);
    expect(db.none).not.toHaveBeenCalled();
  });

  it('404s on a foreign property', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/properties/9').set(authHeader());
    expect(res.status).toBe(404);
  });

  it('creates a property with defaults', async () => {
    db.one.mockResolvedValueOnce({ id: 3, name: 'P3' });
    const res = await request(app)
      .post('/api/properties')
      .set(authHeader())
      .send({ name: 'P3', url_pattern: 'p3' });
    expect(res.status).toBe(201);
    const args = db.one.mock.calls[0][1];
    expect(args[1]).toBe('P3');
    expect(args[5]).toBe('11:00:00');
  });

  it('400s when name is missing on create', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set(authHeader())
      .send({ url_pattern: 'p' });
    expect(res.status).toBe(400);
    expect(db.one).not.toHaveBeenCalled();
  });

  it('400s when url_pattern is missing on update', async () => {
    const res = await request(app)
      .put('/api/properties/1')
      .set(authHeader())
      .send({ name: 'X' });
    expect(res.status).toBe(400);
    expect(db.oneOrNone).not.toHaveBeenCalled();
  });

  it('updates only the owner\'s property', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/properties/4')
      .set(authHeader())
      .send({ name: 'X', url_pattern: 'x' });
    expect(res.status).toBe(404);
  });

  it('deletes and 404s appropriately', async () => {
    db.result.mockResolvedValueOnce({ rowCount: 1 });
    const ok = await request(app).delete('/api/properties/1').set(authHeader());
    expect(ok.status).toBe(204);

    db.result.mockResolvedValueOnce({ rowCount: 0 });
    const missing = await request(app).delete('/api/properties/99').set(authHeader());
    expect(missing.status).toBe(404);
  });
});

describe('templates routes', () => {
  it('filters by category and search', async () => {
    db.any.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/templates')
      .query({ category: 'greeting', search: 'wifi' })
      .set(authHeader());
    expect(res.status).toBe(200);
    const [sql, params] = db.any.mock.calls[0];
    expect(sql).toContain('category = $2');
    expect(sql).toContain('name ILIKE $3');
    expect(sql).toContain('$4 = ANY(tags)');
    expect(params).toEqual([USER.id, 'greeting', '%wifi%', 'wifi']);
  });

  it('tag search uses the raw term so exact tag matches succeed', async () => {
    db.any.mockResolvedValueOnce([]);
    await request(app)
      .get('/api/templates')
      .query({ search: 'wifi' })
      .set(authHeader());
    const [sql, params] = db.any.mock.calls[0];
    expect(sql).toContain('= ANY(tags)');
    // params: [user_id, '%wifi%' (name), 'wifi' (tag)]
    expect(params[1]).toBe('%wifi%');
    expect(params[2]).toBe('wifi');
  });

  it('creates a template defaulting tags to []', async () => {
    db.one.mockResolvedValueOnce({ id: 5, name: 'T' });
    const res = await request(app)
      .post('/api/templates')
      .set(authHeader())
      .send({ name: 'T', category: 'greeting', content: 'Hello' });
    expect(res.status).toBe(201);
    expect(db.one.mock.calls[0][1][4]).toEqual([]);
  });

  it('400s when content is missing on create', async () => {
    const res = await request(app)
      .post('/api/templates')
      .set(authHeader())
      .send({ name: 'T', category: 'greeting' });
    expect(res.status).toBe(400);
    expect(db.one).not.toHaveBeenCalled();
  });

  it('400s when tags is not an array on update', async () => {
    const res = await request(app)
      .put('/api/templates/5')
      .set(authHeader())
      .send({ name: 'T', content: 'x', tags: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(db.oneOrNone).not.toHaveBeenCalled();
  });

  it('404s when updating a foreign template', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/templates/12')
      .set(authHeader())
      .send({ name: 'N', category: 'c', content: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('shift notes routes', () => {
  it('rejects unknown property ownership with 403', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/shift-notes')
      .set(authHeader())
      .send({ property_id: 99, content: 'note' });
    expect(res.status).toBe(403);
  });

  it('rejects empty content with 400', async () => {
    const res = await request(app)
      .post('/api/shift-notes')
      .set(authHeader())
      .send({ property_id: 1, content: '   ' });
    expect(res.status).toBe(400);
  });

  it('creates a shift note for an owned property', async () => {
    db.oneOrNone.mockResolvedValueOnce({ id: 1 });
    db.one.mockResolvedValueOnce({ id: 10, content: 'note' });
    const res = await request(app)
      .post('/api/shift-notes')
      .set(authHeader())
      .send({ property_id: 1, content: '  note  ' });
    expect(res.status).toBe(201);
    expect(db.one.mock.calls[0][1]).toEqual([USER.id, 1, 'note']);
  });

  it('updates an owned note and trims content', async () => {
    db.oneOrNone.mockResolvedValueOnce({ id: 10, content: 'updated' });
    const res = await request(app)
      .put('/api/shift-notes/10')
      .set(authHeader())
      .send({ content: '  updated  ' });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe('updated');
  });

  it('404s when updating a foreign note (no duplicate 404 block)', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/shift-notes/99')
      .set(authHeader())
      .send({ content: 'x' });
    expect(res.status).toBe(404);
  });

  it('deletes only owned notes', async () => {
    db.result.mockResolvedValueOnce({ rowCount: 1 });
    const ok = await request(app).delete('/api/shift-notes/10').set(authHeader());
    expect(ok.status).toBe(204);
  });
});

describe('audit logs routes', () => {
  it('scopes logs to the caller and defaults limit', async () => {
    db.any.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app).get('/api/audit-logs').set(authHeader());
    expect(res.status).toBe(200);
    const [sql, params] = db.any.mock.calls[0];
    expect(sql).toContain('al.user_id = $1');
    expect(params[0]).toBe(USER.id);
    expect(params[1]).toBe(100);
  });

  it('clamps the limit to 500', async () => {
    db.any.mockResolvedValueOnce([]);
    await request(app)
      .get('/api/audit-logs')
      .query({ limit: '100000' })
      .set(authHeader());
    expect(db.any.mock.calls[0][1][1]).toBe(500);
  });
});

describe('copilot route', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/copilot/draft').send({});
    expect(res.status).toBe(401);
  });

  it('403s on a foreign property', async () => {
    db.oneOrNone.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/copilot/draft')
      .set(authHeader())
      .send({ property_id: 99 });
    expect(res.status).toBe(403);
    expect(draftGuestReply).not.toHaveBeenCalled();
  });

  it('drafts with server-resolved templates and returns meta', async () => {
    db.oneOrNone.mockResolvedValueOnce({ id: 1, name: 'P1', checkout_time: '11:00:00', tone_guidelines: 'Pro', wifi_ssid: 'Guest' });
    db.any.mockResolvedValueOnce([{ id: 5, name: 'Checkout', category: 'checkout', content: 'Checkout at 11.' }]);
    draftGuestReply.mockResolvedValueOnce({ text: 'Dear guest, checkout is at 11.', provider: 'test' });

    const res = await request(app)
      .post('/api/copilot/draft')
      .set(authHeader())
      .send({
        property_id: 1,
        tone: 'friendly',
        template_ids: [5, 'bad', 7.5],
        guest_info: { guestName: 'Jane' },
        chat_context: { messages: [{ sender: 'Jane', text: 'checkout?' }] }
      });

    expect(res.status).toBe(200);
    expect(res.body.draft).toContain('checkout');
    expect(res.body.meta.provider).toBe('test');
    expect(res.body.meta.template_count).toBe(1);
    expect(res.body.meta.tone).toBe('friendly');

    // LLM receives server-resolved, sanitized inputs
    const call = draftGuestReply.mock.calls[0][0];
    expect(call.templates).toHaveLength(1);
    expect(call.templates[0].id).toBe(5);
    expect(call.tone).toBe('friendly');
    expect(call.guestInfo).toEqual({ guestName: 'Jane' });
    // property passed to LLM must not contain wifi_password (it never does: SELECT omits it)
    expect(call.property).not.toHaveProperty('wifi_password');
  });

  it('503s when the LLM is not configured', async () => {
    draftGuestReply.mockRejectedValueOnce(Object.assign(new Error('LLM not configured'), { code: 'LLM_NOT_CONFIGURED' }));
    const res = await request(app).post('/api/copilot/draft').set(authHeader()).send({});
    expect(res.status).toBe(503);
  });

  it('500s on other LLM errors', async () => {
    draftGuestReply.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).post('/api/copilot/draft').set(authHeader()).send({});
    expect(res.status).toBe(500);
  });

  describe('buildPrompt hygiene', () => {
    it('never includes a wifi password, even if handed one', () => {
      const prompt = buildPrompt({
        property: { name: 'P', wifi_ssid: 'Guest', wifi_password: 'SHOULD-NOT-APPEAR' },
        guestInfo: { guestName: 'Jane' },
        chatContext: { messages: [{ sender: 'Jane', text: 'hi' }] },
        templates: [{ name: 'T', content: 'Body' }],
        tone: 'professional'
      });
      expect(prompt).not.toContain('SHOULD-NOT-APPEAR');
      expect(prompt).toContain('Guest');
      expect(prompt).toContain('Jane');
    });

    it('handles null context gracefully', () => {
      const prompt = buildPrompt({ property: null, guestInfo: null, chatContext: null, templates: [], tone: 'friendly' });
      expect(prompt).toContain('No reservation data captured');
      expect(prompt).toContain('friendly');
    });
  });
});

describe('Databricks status', () => {
  it('requires auth and reports configuration without exposing credentials', async () => {
    process.env.DATABRICKS_HOST = 'https://workspace.example';
    process.env.DATABRICKS_TOKEN = 'secret-token';
    const res = await request(app).get('/api/databricks/status').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true });
    expect(JSON.stringify(res.body)).not.toContain('secret-token');
    delete process.env.DATABRICKS_HOST;
    delete process.env.DATABRICKS_TOKEN;
  });
});

describe('GitHub status', () => {
  it('requires auth and never exposes the token', async () => {
    process.env.GITHUB_TOKEN = 'secret-token';
    const res = await request(app).get('/api/github/status').set(authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true });
    expect(JSON.stringify(res.body)).not.toContain('secret-token');
    delete process.env.GITHUB_TOKEN;
  });
});

describe('health', () => {
  it('reports ok without auth', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('routing fallbacks', () => {
  it('returns a JSON 404 for unknown /api routes (never the SPA shell)', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body.error).toBe('Not found');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('returns a JSON 404 for unknown /api subpaths with trailing segments', async () => {
    const res = await request(app).get('/api/copilot/unknown-subroute');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('serves the SPA shell for non-API routes when the dashboard build exists', async () => {
    const buildIndex = path.join(__dirname, '../../dashboard/build/index.html');
    if (!fs.existsSync(buildIndex)) {
      // No dashboard build present (e.g. CI without a dashboard build step):
      // the catch-all then falls through to notFound, which is still correct.
      const res = await request(app).get('/some-spa-route');
      expect([200, 404]).toContain(res.status);
      return;
    }
    const res = await request(app).get('/some-spa-route');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
