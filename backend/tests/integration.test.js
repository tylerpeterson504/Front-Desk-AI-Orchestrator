// Integration tests for the Front Desk AI backend.
//
// Tests full workflows that span multiple routes and services.
// The database is mocked, so these exercise the application logic without a live DB.

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

jest.mock('../src/services/llm', () => ({
  MODEL_NAME: 'test-model',
  draftGuestReply: jest.fn().mockResolvedValue('Test draft response'),
  buildPrompt: jest.requireActual('../src/services/llm').buildPrompt
}));

const { db } = require('../src/config/database');
const app = require('../src/index');

const STRONG_PASSWORD = 'correct-horse-battery';

function authHeader(userId = 7, email = 'agent@example.com', role = 'agent') {
  const token = jwt.sign(
    { id: userId, email, role },
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

describe('user registration to draft generation', () => {
  it('complete workflow: register -> login -> create property -> generate draft', async () => {
    // Step 1: Register a new user
    db.one.mockResolvedValueOnce({
      id: 1,
      email: 'new@agent.com',
      name: 'New Agent',
      role: 'agent',
      created_at: 'now'
    });
    db.none.mockResolvedValueOnce(undefined); // refresh token insert

    let res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@agent.com', password: STRONG_PASSWORD, name: 'New Agent' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('new@agent.com');
    const token = res.body.token;

    // Step 2: Login with the new user (simulating token expiration)
    db.oneOrNone.mockResolvedValueOnce({
      id: 1,
      email: 'new@agent.com',
      name: 'New Agent',
      role: 'agent',
      password: `hashed:${STRONG_PASSWORD}`
    });
    db.none.mockResolvedValueOnce(undefined); // new refresh token

    res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'new@agent.com', password: STRONG_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    // Step 3: Create a property
    db.one.mockResolvedValueOnce({
      id: 1,
      name: 'Test Hotel',
      user_id: 1,
      url_pattern: 'test',
      wifi_ssid: null,
      checkout_time: '11:00:00',
      tone_guidelines: null,
      created_at: 'now',
      updated_at: 'now'
    });

    res = await request(app)
      .post('/api/properties')
      .set(authHeader(1, 'new@agent.com'))
      .send({ name: 'Test Hotel', url_pattern: 'test' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(res.body.name).toBe('Test Hotel');

    // Step 4: Create a template
    db.one.mockResolvedValueOnce({
      id: 1,
      name: 'Welcome',
      category: 'greeting',
      content: 'Welcome to our hotel!',
      tags: [],
      user_id: 1
    });

    res = await request(app)
      .post('/api/templates')
      .set(authHeader(1, 'new@agent.com'))
      .send({ name: 'Welcome', category: 'greeting', content: 'Welcome to our hotel!' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);

    // Step 5: Generate a draft
    db.oneOrNone.mockResolvedValueOnce({
      id: 1,
      name: 'Test Hotel',
      checkout_time: '11:00:00',
      tone_guidelines: null,
      wifi_ssid: null
    });
    db.any.mockResolvedValueOnce([
      { id: 1, name: 'Welcome', category: 'greeting', content: 'Welcome to our hotel!' }
    ]);

    res = await request(app)
      .post('/api/copilot/draft')
      .set(authHeader(1, 'new@agent.com'))
      .send({
        property_id: 1,
        template_ids: [1],
        guest_info: { guestName: 'John Doe' },
        chat_context: { messages: [] }
      });

    expect(res.status).toBe(200);
    expect(res.body.draft).toBe('Test draft response');
    expect(res.body.meta.model).toBe('test-model');
  });
});

describe('property management workflow', () => {
  it('create -> read -> update -> delete property', async () => {
    // Create
    db.one.mockResolvedValueOnce({
      id: 1,
      name: 'Grand Hotel',
      user_id: 7,
      url_pattern: 'grand',
      wifi_ssid: null,
      checkout_time: '12:00:00',
      tone_guidelines: null,
      created_at: 'now',
      updated_at: 'now'
    });

    let res = await request(app)
      .post('/api/properties')
      .set(authHeader())
      .send({ name: 'Grand Hotel', url_pattern: 'grand', checkout_time: '12:00:00' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Grand Hotel');

    // Read (list)
    db.any.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Grand Hotel',
        user_id: 7,
        url_pattern: 'grand',
        wifi_ssid: null,
        checkout_time: '12:00:00',
        tone_guidelines: null,
        created_at: 'now',
        updated_at: 'now'
      }
    ]);

    res = await request(app)
      .get('/api/properties')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Grand Hotel');

    // Read (single)
    db.oneOrNone.mockResolvedValueOnce({
      id: 1,
      name: 'Grand Hotel',
      user_id: 7,
      url_pattern: 'grand',
      wifi_ssid: null,
      checkout_time: '12:00:00',
      tone_guidelines: null,
      created_at: 'now',
      updated_at: 'now'
    });

    res = await request(app)
      .get('/api/properties/1')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Grand Hotel');

    // Update
    db.oneOrNone.mockResolvedValueOnce({
      id: 1,
      name: 'Grand Hotel & Spa',
      user_id: 7,
      url_pattern: 'grand',
      wifi_ssid: null,
      checkout_time: '12:00:00',
      tone_guidelines: null,
      created_at: 'now',
      updated_at: 'later'
    });

    res = await request(app)
      .put('/api/properties/1')
      .set(authHeader())
      .send({ name: 'Grand Hotel & Spa', url_pattern: 'grand' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Grand Hotel & Spa');

    // Delete
    db.result.mockResolvedValueOnce({ rowCount: 1 });

    res = await request(app)
      .delete('/api/properties/1')
      .set(authHeader());

    expect(res.status).toBe(204);

    // Verify deletion
    db.oneOrNone.mockResolvedValueOnce(null);

    res = await request(app)
      .get('/api/properties/1')
      .set(authHeader());

    expect(res.status).toBe(404);
  });
});

describe('template management workflow', () => {
  it('create -> list -> filter -> update -> delete template', async () => {
    // Create
    db.one.mockResolvedValueOnce({
      id: 1,
      name: 'Checkout Info',
      category: 'checkout',
      content: 'Checkout is at 11 AM',
      tags: ['checkout', 'info'],
      user_id: 7
    });

    let res = await request(app)
      .post('/api/templates')
      .set(authHeader())
      .send({
        name: 'Checkout Info',
        category: 'checkout',
        content: 'Checkout is at 11 AM',
        tags: ['checkout', 'info']
      });

    expect(res.status).toBe(201);
    expect(res.body.tags).toEqual(['checkout', 'info']);

    // List all
    db.any.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Checkout Info',
        category: 'checkout',
        content: 'Checkout is at 11 AM',
        tags: ['checkout', 'info'],
        user_id: 7
      }
    ]);

    res = await request(app)
      .get('/api/templates')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    // Filter by category
    db.any.mockResolvedValueOnce([]);

    res = await request(app)
      .get('/api/templates')
      .query({ category: 'checkout' })
      .set(authHeader());

    expect(res.status).toBe(200);

    // Update
    db.oneOrNone.mockResolvedValueOnce({
      id: 1,
      name: 'Checkout Info Updated',
      category: 'checkout',
      content: 'Checkout is at 11 AM',
      tags: ['checkout', 'info', 'updated'],
      user_id: 7
    });

    res = await request(app)
      .put('/api/templates/1')
      .set(authHeader())
      .send({
        name: 'Checkout Info Updated',
        category: 'checkout',
        content: 'Checkout is at 11 AM',
        tags: ['checkout', 'info', 'updated']
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Checkout Info Updated');

    // Delete
    db.result.mockResolvedValueOnce({ rowCount: 1 });

    res = await request(app)
      .delete('/api/templates/1')
      .set(authHeader());

    expect(res.status).toBe(204);
  });
});

describe('shift notes workflow', () => {
  it('create -> list -> delete shift note', async () => {
    // First, create a property to attach the note to
    db.one.mockResolvedValueOnce({
      id: 1,
      name: 'Test Hotel',
      user_id: 7,
      url_pattern: 'test',
      wifi_ssid: null,
      checkout_time: '11:00:00',
      tone_guidelines: null,
      created_at: 'now',
      updated_at: 'now'
    });

    let res = await request(app)
      .post('/api/properties')
      .set(authHeader())
      .send({ name: 'Test Hotel', url_pattern: 'test' });

    expect(res.status).toBe(201);

    // Now create a shift note
    db.oneOrNone.mockResolvedValueOnce({ id: 1 }); // property check
    db.one.mockResolvedValueOnce({
      id: 1,
      property_id: 1,
      user_id: 7,
      content: 'VIP guest in room 201',
      created_at: 'now'
    });

    res = await request(app)
      .post('/api/shift-notes')
      .set(authHeader())
      .send({ property_id: 1, content: 'VIP guest in room 201' });

    expect(res.status).toBe(201);
    expect(res.body.content).toBe('VIP guest in room 201');

    // List shift notes
    db.any.mockResolvedValueOnce([
      {
        id: 1,
        property_id: 1,
        user_id: 7,
        content: 'VIP guest in room 201',
        created_at: 'now'
      }
    ]);

    res = await request(app)
      .get('/api/shift-notes')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    // Delete
    db.result.mockResolvedValueOnce({ rowCount: 1 });

    res = await request(app)
      .delete('/api/shift-notes/1')
      .set(authHeader());

    expect(res.status).toBe(204);
  });
});

describe('cross-route data isolation', () => {
  it('user can only access their own properties', async () => {
    // User 7 tries to access property owned by user 8
    db.oneOrNone.mockResolvedValueOnce(null); // property not found for user 7

    const res = await request(app)
      .get('/api/properties/1')
      .set(authHeader()); // user 7

    expect(res.status).toBe(404);
  });

  it('user can only update their own templates', async () => {
    // User 7 tries to update template owned by user 8
    db.oneOrNone.mockResolvedValueOnce(null); // template not found for user 7

    const res = await request(app)
      .put('/api/templates/1')
      .set(authHeader()) // user 7
      .send({ name: 'Updated', category: 'greeting', content: 'test' });

    expect(res.status).toBe(404);
  });

  it('audit logs are scoped to the user', async () => {
    db.any.mockResolvedValueOnce([
      { id: 1, user_id: 7, action: 'some_action', details: {} }
    ]);

    const res = await request(app)
      .get('/api/audit-logs')
      .set(authHeader()); // user 7

    expect(res.status).toBe(200);
    // Verify the query was scoped to user 7
    const [sql, params] = db.any.mock.calls[0];
    expect(sql).toContain('user_id = $1');
    expect(params[0]).toBe(7);
  });
});
