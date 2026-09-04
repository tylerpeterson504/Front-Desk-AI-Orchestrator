// Integration tests for backend routes
// Tests API endpoints with supertest

import app from '../src/index';
import request from 'supertest';
import { getRepository } from '../src/config/database';
import { User } from '../src/entities/User';
import { Property } from '../src/entities/Property';
import { Template } from '../src/entities/Template';
import { RefreshToken } from '../src/entities/RefreshToken';
import bcrypt from 'bcrypt';
import jsonwebtoken from 'jsonwebtoken';

// Mock database
jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => {
    const mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    return mockRepo;
  }),
  dataSource: {
    getRepository: jest.fn()
  }
}));

// Mock config
jest.mock('../src/config', () => ({
  config: {
    JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
    JWT_TTL: '15m',
    PORT: 3001,
    NODE_ENV: 'test',
    CORS_ORIGIN: '*'
  }
}));

// Mock logger
jest.mock('../src/lib/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock LLM clients
jest.mock('../src/services/llm/perplexityClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

jest.mock('../src/services/llm/mistralClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

jest.mock('../src/services/llm/huggingfaceClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

jest.mock('../src/services/llm/geminiClient', () => ({
  isConfigured: jest.fn(() => false),
  complete: jest.fn()
}));

describe('Backend Routes', () => {
  let testUser: User;
  let testProperty: Property;
  let testTemplate: Template;
  let authToken: string;

  beforeAll(async () => {
    // Create test user
    const hashedPassword = await bcrypt.hash('testpassword', 12);
    testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      password_hash: hashedPassword,
      name: 'Test User',
      role: 'agent',
      property_id: 1,
      created_at: new Date(),
      updated_at: new Date()
    } as User;

    testProperty = {
      id: 1,
      name: 'Test Hotel',
      address: '123 Test St',
      checkout_time: '11:00 AM',
      wifi_ssid: 'TestWiFi',
      wifi_password: '',
      tone_guidelines: 'Friendly',
      user_id: 'test-user-id',
      created_at: new Date(),
      updated_at: new Date()
    } as Property;

    testTemplate = {
      id: 1,
      name: 'Welcome Template',
      content: 'Welcome to our hotel!',
      property_id: 1,
      user_id: 'test-user-id',
      is_global: false,
      created_at: new Date(),
      updated_at: new Date()
    } as Template;

    // Generate auth token
    authToken = jsonwebtoken.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      'test-secret-key-at-least-32-characters-long',
      { expiresIn: '15m' }
    );
  });

  describe('Health Check', () => {
    it('should return OK status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('Auth Routes', () => {
    describe('POST /api/auth/register', () => {
      it('should register a new user', async () => {
        const mockUserRepo = getRepository(User);
        mockUserRepo.findOne.mockResolvedValue(null);
        mockUserRepo.create.mockReturnValue(testUser);
        mockUserRepo.save.mockResolvedValue(testUser);

        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'newuser@example.com',
            password: 'password123',
            name: 'New User'
          })
          .expect(201);

        expect(response.body.token).toBeDefined();
        expect(response.body.user.email).toBe('newuser@example.com');
      });

      it('should reject duplicate email', async () => {
        const mockUserRepo = getRepository(User);
        mockUserRepo.findOne.mockResolvedValue(testUser);

        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password: 'password123',
            name: 'Test User'
          })
          .expect(409);

        expect(response.body.error).toContain('already exists');
      });

      it('should reject invalid email', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'invalid-email',
            password: 'password123',
            name: 'Test User'
          })
          .expect(400);

        expect(response.body.error).toBeDefined();
      });

      it('should reject weak password', async () => {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password: '123',
            name: 'Test User'
          })
          .expect(400);

        expect(response.body.error).toBeDefined();
      });
    });

    describe('POST /api/auth/login', () => {
      it('should login with valid credentials', async () => {
        const mockUserRepo = getRepository(User);
        mockUserRepo.findOne.mockResolvedValue(testUser);

        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'testpassword'
          })
          .expect(200);

        expect(response.body.token).toBeDefined();
        expect(response.body.user.email).toBe('test@example.com');
      });

      it('should reject invalid credentials', async () => {
        const mockUserRepo = getRepository(User);
        mockUserRepo.findOne.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'wrong@example.com',
            password: 'wrongpassword'
          })
          .expect(401);

        expect(response.body.error).toContain('Invalid');
      });
    });

    describe('POST /api/auth/refresh', () => {
      it('should refresh access token', async () => {
        const mockRefreshTokenRepo = getRepository(RefreshToken);
        const refreshToken = {
          id: 1,
          token: 'valid-refresh-token',
          user_id: testUser.id,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          is_revoked: false
        } as RefreshToken;

        mockRefreshTokenRepo.findOne.mockResolvedValue(refreshToken);
        mockRefreshTokenRepo.update.mockResolvedValue({ affected: 1 });

        const response = await request(app)
          .post('/api/auth/refresh')
          .send({
            refresh_token: 'valid-refresh-token'
          })
          .expect(200);

        expect(response.body.token).toBeDefined();
        expect(response.body.refresh_token).toBeDefined();
      });

      it('should reject invalid refresh token', async () => {
        const mockRefreshTokenRepo = getRepository(RefreshToken);
        mockRefreshTokenRepo.findOne.mockResolvedValue(null);

        const response = await request(app)
          .post('/api/auth/refresh')
          .send({
            refresh_token: 'invalid-refresh-token'
          })
          .expect(401);

        expect(response.body.error).toContain('Invalid');
      });
    });

    describe('POST /api/auth/logout', () => {
      it('should logout user', async () => {
        const mockRefreshTokenRepo = getRepository(RefreshToken);
        const refreshToken = {
          id: 1,
          token: 'valid-refresh-token',
          user_id: testUser.id
        } as RefreshToken;

        mockRefreshTokenRepo.findOne.mockResolvedValue(refreshToken);
        mockRefreshTokenRepo.update.mockResolvedValue({ affected: 1 });

        const response = await request(app)
          .post('/api/auth/logout')
          .send({
            refresh_token: 'valid-refresh-token'
          })
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Properties Routes', () => {
    describe('GET /api/properties', () => {
      it('should return list of properties for authenticated user', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.find.mockResolvedValue([testProperty]);

        const response = await request(app)
          .get('/api/properties')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });

      it('should reject unauthenticated requests', async () => {
        const response = await request(app)
          .get('/api/properties')
          .expect(401);

        expect(response.body.error).toContain('Unauthorized');
      });
    });

    describe('POST /api/properties', () => {
      it('should create a new property', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.create.mockReturnValue(testProperty);
        mockPropertyRepo.save.mockResolvedValue(testProperty);

        const response = await request(app)
          .post('/api/properties')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'New Hotel',
            address: '456 New St',
            checkout_time: '12:00 PM'
          })
          .expect(201);

        expect(response.body.id).toBeDefined();
        expect(response.body.name).toBe('New Hotel');
      });

      it('should reject invalid property data', async () => {
        const response = await request(app)
          .post('/api/properties')
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .expect(400);

        expect(response.body.error).toBeDefined();
      });
    });

    describe('GET /api/properties/:id', () => {
      it('should return a property by ID', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.findOne.mockResolvedValue(testProperty);

        const response = await request(app)
          .get('/api/properties/1')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.id).toBe(1);
        expect(response.body.name).toBe('Test Hotel');
      });

      it('should return 404 for non-existent property', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.findOne.mockResolvedValue(null);

        const response = await request(app)
          .get('/api/properties/999')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);

        expect(response.body.error).toContain('Not found');
      });
    });

    describe('PUT /api/properties/:id', () => {
      it('should update a property', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.findOne.mockResolvedValue(testProperty);
        mockPropertyRepo.save.mockResolvedValue({
          ...testProperty,
          name: 'Updated Hotel'
        });

        const response = await request(app)
          .put('/api/properties/1')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Updated Hotel'
          })
          .expect(200);

        expect(response.body.name).toBe('Updated Hotel');
      });
    });

    describe('DELETE /api/properties/:id', () => {
      it('should delete a property', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.findOne.mockResolvedValue(testProperty);
        mockPropertyRepo.delete.mockResolvedValue({ affected: 1 });

        const response = await request(app)
          .delete('/api/properties/1')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Templates Routes', () => {
    describe('GET /api/templates', () => {
      it('should return list of templates', async () => {
        const mockTemplateRepo = getRepository(Template);
        mockTemplateRepo.find.mockResolvedValue([testTemplate]);

        const response = await request(app)
          .get('/api/templates')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('POST /api/templates', () => {
      it('should create a new template', async () => {
        const mockTemplateRepo = getRepository(Template);
        mockTemplateRepo.create.mockReturnValue(testTemplate);
        mockTemplateRepo.save.mockResolvedValue(testTemplate);

        const response = await request(app)
          .post('/api/templates')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'New Template',
            content: 'Welcome to our hotel!'
          })
          .expect(201);

        expect(response.body.id).toBeDefined();
        expect(response.body.name).toBe('New Template');
      });
    });
  });

  describe('Shift Notes Routes', () => {
    describe('GET /api/shift-notes', () => {
      it('should return list of shift notes', async () => {
        const mockShiftNoteRepo = {
          find: jest.fn().mockResolvedValue([
            {
              id: 1,
              content: 'Test note',
              user_id: testUser.id,
              property_id: 1,
              shift_date: new Date(),
              created_at: new Date(),
              updated_at: new Date()
            }
          ])
        };

        jest.spyOn(require('../src/config/database'), 'getRepository').mockReturnValueOnce(mockShiftNoteRepo);

        const response = await request(app)
          .get('/api/shift-notes')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });
  });

  describe('Audit Logs Routes', () => {
    describe('GET /api/audit-logs', () => {
      it('should return paginated audit logs', async () => {
        const mockAuditLogRepo = {
          findAndCount: jest.fn().mockResolvedValue([
            [
              {
                id: 1,
                user_id: testUser.id,
                action: 'CREATE_PROPERTY',
                resource: 'properties',
                resource_id: '1',
                metadata: {},
                ip_address: '127.0.0.1',
                user_agent: 'test',
                created_at: new Date()
              }
            ],
            1
          ])
        };

        jest.spyOn(require('../src/config/database'), 'getRepository').mockReturnValueOnce(mockAuditLogRepo);

        const response = await request(app)
          .get('/api/audit-logs?page=1&limit=10')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.data).toBeDefined();
        expect(response.body.total).toBeDefined();
      });
    });
  });

  describe('Copilot Routes', () => {
    describe('POST /api/copilot/draft', () => {
      it('should generate a draft response', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.findOne.mockResolvedValue(testProperty);

        const mockTemplateRepo = getRepository(Template);
        mockTemplateRepo.find.mockResolvedValue([testTemplate]);

        // Mock LLM to return a response
        jest.resetModules();
        jest.doMock('../src/services/llm/geminiClient', () => ({
          isConfigured: jest.fn(() => true),
          complete: jest.fn().mockResolvedValue({
            text: 'Hello! Thank you for choosing our hotel.',
            model: 'gemini-1.5-flash'
          })
        }));

        const response = await request(app)
          .post('/api/copilot/draft')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            property_id: 1,
            tone: 'friendly',
            template_ids: [1],
            guest_info: {
              guestName: 'John Doe',
              roomNumber: '101'
            },
            chat_context: {
              messages: [
                { sender: 'Guest', text: 'Hello' }
              ]
            }
          })
          .expect(200);

        expect(response.body.draft).toBeDefined();
        expect(response.body.meta.provider).toBe('gemini');
      });

      it('should reject unauthenticated requests', async () => {
        const response = await request(app)
          .post('/api/copilot/draft')
          .send({
            property_id: 1
          })
          .expect(401);

        expect(response.body.error).toContain('Unauthorized');
      });

      it('should handle missing LLM configuration', async () => {
        const mockPropertyRepo = getRepository(Property);
        mockPropertyRepo.findOne.mockResolvedValue(testProperty);

        const mockTemplateRepo = getRepository(Template);
        mockTemplateRepo.find.mockResolvedValue([]);

        // No LLM configured
        jest.resetModules();
        jest.doMock('../src/services/llm/perplexityClient', () => ({
          isConfigured: jest.fn(() => false)
        }));
        jest.doMock('../src/services/llm/mistralClient', () => ({
          isConfigured: jest.fn(() => false)
        }));
        jest.doMock('../src/services/llm/huggingfaceClient', () => ({
          isConfigured: jest.fn(() => false)
        }));
        jest.doMock('../src/services/llm/geminiClient', () => ({
          isConfigured: jest.fn(() => false)
        }));

        const response = await request(app)
          .post('/api/copilot/draft')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            property_id: 1
          })
          .expect(500);

        expect(response.body.error).toContain('LLM not configured');
      });
    });
  });

  describe('Databricks Routes', () => {
    describe('GET /api/databricks/status', () => {
      it('should return configuration status', async () => {
        const response = await request(app)
          .get('/api/databricks/status')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.configured).toBeDefined();
      });
    });
  });

  describe('GitHub Routes', () => {
    describe('GET /api/github/status', () => {
      it('should return configuration status', async () => {
        const response = await request(app)
          .get('/api/github/status')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.configured).toBeDefined();
      });
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404);

      expect(response.body.error).toContain('Not found');
    });
  });

  describe('Error Handler', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body.error).toContain('Malformed JSON');
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid',
          password: '123'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });
});
