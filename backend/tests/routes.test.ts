// Integration tests for backend routes - SIMPLIFIED
import app from '../src/index';
import request from 'supertest';
import { getRepository } from '../src/config/database';
import { User } from '../src/entities/User';
import { Property } from '../src/entities/Property';
import jsonwebtoken from 'jsonwebtoken';
import { createMockRepository, createMockUser, createMockProperty } from './utils';

jest.mock('../src/config/database', () => ({
  getRepository: jest.fn((entity: any) => createMockRepository())
}));

jest.mock('../src/config', () => ({
  config: {
    JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
    JWT_TTL: '15m'
  }
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
  compare: jest.fn().mockResolvedValue(true)
}));

describe('Backend Routes - Basic Tests', () => {
  let testUser: User;
  let testProperty: Property;
  let authToken: string;

  beforeAll(() => {
    testUser = createMockUser();
    testProperty = createMockProperty();
    authToken = jsonwebtoken.sign(
      { userId: testUser.id, email: testUser.email, role: testUser.role },
      'test-secret-key-at-least-32-characters-long',
      { expiresIn: '15m' }
    );
  });

  describe('Health Check', () => {
    it('should return OK', async () => {
      const response = await request(app).get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('Auth Routes', () => {
    it('should register a user', async () => {
      const mockUserRepo = createMockRepository<User>();
      mockUserRepo.findOne.mockResolvedValue(null);
      mockUserRepo.create.mockReturnValue(testUser);
      mockUserRepo.save.mockResolvedValue(testUser);
      (getRepository as jest.Mock).mockReturnValueOnce(mockUserRepo);

      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', password: 'password123', name: 'New' })
        .expect(201);
      expect(response.body.token).toBeDefined();
    });

    it('should login a user', async () => {
      const mockUserRepo = createMockRepository<User>();
      mockUserRepo.findOne.mockResolvedValue(testUser);
      (getRepository as jest.Mock).mockReturnValueOnce(mockUserRepo);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'test' })
        .expect(200);
      expect(response.body.token).toBeDefined();
    });
  });
});
