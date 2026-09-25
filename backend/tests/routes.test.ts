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
async function createTestApp(userRepoMock?: any, propertyRepoMock?: any) {
  // Reset the module registry so each test gets a fresh app with fresh mocks.
  // Note: per-test mock implementations are passed in as arguments and applied
  // below, so they must NOT be cleared here.
  jest.resetModules();
  
  // Set up default mocks
  const defaultUserRepo = createMockRepository<User>();
  const defaultPropertyRepo = createMockRepository<Property>();
  const defaultRefreshTokenRepo = createMockRepository<RefreshToken>();
  defaultRefreshTokenRepo.create.mockImplementation((data: any) => ({ ...data }));
  defaultRefreshTokenRepo.save.mockImplementation(async (data: any) => ({ id: 1, ...data }));
  
  // Apply custom mocks if provided
  const userRepo = userRepoMock || defaultUserRepo;
  const propertyRepo = propertyRepoMock || defaultPropertyRepo;
  
  // Mock database. Entities are matched by name (not class identity) because
  // jest.resetModules() gives the freshly imported app a different module
  // registry than the classes imported at the top of this test file.
  jest.doMock('../src/config/database', () => ({
    getRepository: jest.fn((entity: any) => {
      if (entity?.name === 'User') return userRepo;
      if (entity?.name === 'Property') return propertyRepo;
      if (entity?.name === 'RefreshToken') return defaultRefreshTokenRepo;
      return createMockRepository();
    })
  }));
  
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
  });
});
