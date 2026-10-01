// @ts-nocheck
// Integration tests for backend routes - SIMPLIFIED
import request from 'supertest';
import { getRepository } from '../src/config/database';
import { User } from '../src/entities/User';
import { Property } from '../src/entities/Property';
import { RefreshToken } from '../src/entities/RefreshToken';
import { createMockRepository, createMockUser, createMockProperty } from './utils';

// Create a test user for the auth tests
const testUser = createMockUser({ email: 'test@example.com', password_hash: 'hashed-password', name: 'Test User' });

// Helper to create a fresh app with mocks for each test
async function createTestApp(userRepoMock?: any, propertyRepoMock?: any, authServiceMock?: any) {
  // Clear and reset all mocks
  jest.clearAllMocks();
  jest.resetModules();
  
  // Set up default mocks
  const defaultUserRepo = createMockRepository<User>();
  const defaultPropertyRepo = createMockRepository<Property>();
  
  // Apply custom mocks if provided
  const userRepo = userRepoMock || defaultUserRepo;
  const propertyRepo = propertyRepoMock || defaultPropertyRepo;
  
  // Mock database
  const refreshTokenRepo = createMockRepository<RefreshToken>();
  refreshTokenRepo.create.mockImplementation((data: any) => ({ ...data, id: 1 }));
  refreshTokenRepo.save.mockImplementation(async (entity: any) => entity);

  // Mock database. jest.resetModules() re-imports entities for the app, so
  // identity comparison against this file's imports would never match;
  // dispatch by entity class name instead.
  jest.doMock('../src/config/database', () => ({
    getRepository: jest.fn((entity: any) => {
      const name = entity?.name;
      if (name === 'User') return userRepo;
      if (name === 'Property') return propertyRepo;
      if (name === 'RefreshToken') return refreshTokenRepo;
      return createMockRepository();
    })
  }));

  if (authServiceMock) {
    jest.doMock('../src/services/authService', () => ({ authService: authServiceMock }));
  } else {
    jest.dontMock('../src/services/authService');
  }
  
  // Mock config
  jest.doMock('../src/config', () => ({
    config: {
      JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
      JWT_TTL: '15m',
      BCRYPT_ROUNDS: '10'
    }
  }));
  
  // Mock bcrypt
  jest.doMock('bcrypt', () => ({
    hash: jest.fn().mockResolvedValue('hashed-password'),
    compare: jest.fn().mockResolvedValue(true)
  }));
  
  // Mock jsonwebtoken
  jest.doMock('jsonwebtoken', () => ({
    sign: jest.fn(() => 'test-token'),
    verify: jest.fn(() => ({ userId: testUser.id, email: testUser.email, role: testUser.role }))
  }));
  
  // Import and return app
  const module = await import('../src/index');
  return { app: module.default, userRepo, propertyRepo };
}

describe('Backend Routes - Basic Tests', () => {
  describe('Health Check', () => {
    it('should return OK', async () => {
      const { app } = await createTestApp();
      const response = await request(app).get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('Auth Routes', () => {
    it('should register a user', async () => {
      const userRepo = createMockRepository<User>();
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockReturnValue(testUser);
      userRepo.save.mockResolvedValue(testUser);
      
      const { app } = await createTestApp(userRepo);
      
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'password123456', name: 'New User' })
        .expect(201);
      expect(response.body.token).toBeDefined();
    });

    it('should login a user', async () => {
      const userRepo = createMockRepository<User>();
      userRepo.findOne.mockResolvedValue(testUser);
      
      const { app } = await createTestApp(userRepo);
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123456' })
        .expect(200);
      expect(response.body.token).toBeDefined();
    });

    it('sets an HttpOnly refresh cookie without returning the token to the dashboard', async () => {
      const login = jest.fn().mockResolvedValue({
        token: 'access', refresh_token: 'refresh', expires_in: 900,
        refresh_expires_at: new Date(Date.now() + 3600000), user: { id: 'test-user-id' }
      });
      const { app } = await createTestApp(undefined, undefined, { login });
      const response = await request(app).post('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('X-Refresh-Token-Transport', 'cookie')
        .send({ email: 'test@example.com', password: 'password123456' }).expect(200);

      expect(response.body.token).toBe('access');
      expect(response.body).not.toHaveProperty('refresh_token');
      expect(response.headers['set-cookie'][0]).toMatch(/^refresh_token=refresh;.*HttpOnly; Secure;.*SameSite=None/);
      expect(response.headers['access-control-allow-credentials']).toBe('true');

      const preflight = await request(app).options('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'x-refresh-token-transport,content-type').expect(204);
      expect(preflight.headers['access-control-allow-headers']).toContain('x-refresh-token-transport');
    });

    it('keeps JSON login credentials available to extension clients', async () => {
      const login = jest.fn().mockResolvedValue({
        token: 'access', refresh_token: 'extension-refresh', expires_in: 900,
        refresh_expires_at: new Date(Date.now() + 3600000), user: { id: 'test-user-id' }
      });
      const { app } = await createTestApp(undefined, undefined, { login });
      const response = await request(app).post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123456' }).expect(200);
      expect(response.body.refresh_token).toBe('extension-refresh');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('rotates and revokes refresh cookies without accepting a body token in cookie mode', async () => {
      const refresh = jest.fn().mockResolvedValue({
        token: 'new-access', refreshToken: 'new-refresh', expiresIn: 900,
        refreshExpiresAt: new Date(Date.now() + 3600000)
      });
      const logout = jest.fn().mockResolvedValue(undefined);
      const { app } = await createTestApp(undefined, undefined, { refresh, logout });
      const header = { 'X-Refresh-Token-Transport': 'cookie' };

      await request(app).post('/api/auth/refresh').set(header).send({ refresh_token: 'body-secret' }).expect(400);
      expect(refresh).not.toHaveBeenCalled();

      const response = await request(app).post('/api/auth/refresh').set(header)
        .set('Cookie', 'refresh_token=old-refresh').send({}).expect(200);
      expect(refresh).toHaveBeenCalledWith('old-refresh', expect.any(String));
      expect(response.body).not.toHaveProperty('refresh_token');
      expect(response.headers['set-cookie'][0]).toContain('refresh_token=new-refresh');

      const loggedOut = await request(app).post('/api/auth/logout').set(header)
        .set('Cookie', 'refresh_token=new-refresh').send({}).expect(200);
      expect(logout).toHaveBeenCalledWith('new-refresh', expect.any(String));
      expect(loggedOut.headers['set-cookie'][0]).toMatch(/^refresh_token=;.*HttpOnly; Secure;.*SameSite=None/);
    });

    it('keeps body-based refresh available for extension clients', async () => {
      const refresh = jest.fn().mockResolvedValue({
        token: 'new-access', refreshToken: 'new-refresh', expiresIn: 900,
        refreshExpiresAt: new Date(Date.now() + 3600000)
      });
      const { app } = await createTestApp(undefined, undefined, { refresh });
      const response = await request(app).post('/api/auth/refresh')
        .send({ refresh_token: 'extension-refresh' }).expect(200);
      expect(response.body.refresh_token).toBe('new-refresh');
      expect(refresh).toHaveBeenCalledWith('extension-refresh', expect.any(String));
    });
  });
});
