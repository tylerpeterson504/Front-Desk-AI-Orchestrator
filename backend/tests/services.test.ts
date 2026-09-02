import bcrypt from 'bcrypt';
import { getRepository } from '../src/config/database';
import { User } from '../src/entities/User';
import { userService } from '../src/services/userService';
import { authService, generateToken, accessTokenTtlSeconds, verifyToken } from '../src/services/authService';
import { NotFoundError, ConflictError, AuthenticationError, AppError } from '../src/lib/errors';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true)
}));

// Mock database
jest.mock('../src/config/database', () => ({
  getRepository: jest.fn(() => ({
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn()
  }))
}));

// Mock config
jest.mock('../src/config', () => ({
  config: {
    JWT_SECRET: 'test-secret-key-at-least-32-characters-long',
    JWT_TTL: '15m',
    BCRYPT_ROUNDS: '12'
  }
}));

// Mock logger
jest.mock('../src/lib/logger', () => ({
  createRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }))
}));

// Mock refresh token service
jest.mock('../src/services/refreshTokenService', () => ({
  refreshTokenService: {
    issueSession: jest.fn().mockResolvedValue({
      token: 'refresh_token',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }),
    validateSession: jest.fn().mockResolvedValue({
      id: 'session_id',
      user_id: 'user_id',
      token: 'refresh_token'
    }),
    revokeSession: jest.fn().mockResolvedValue(undefined),
    revokeAllSessions: jest.fn().mockResolvedValue(undefined)
  }
}));

describe('Service Layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UserService', () => {
    describe('createUser', () => {
      it('should create a user with valid data', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockReturnValue({ id: '1', email: 'test@example.com' }),
          save: jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' })
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const user = await userService.createUser({
          email: 'test@example.com',
          password: 'password12345678',
          name: 'Test User'
        });

        expect(mockRepo.findOne).toHaveBeenCalled();
        expect(mockRepo.create).toHaveBeenCalled();
        expect(mockRepo.save).toHaveBeenCalled();
        expect(user.id).toBe('1');
      });

      it('should throw ValidationError for missing required fields', async () => {
        await expect(
          userService.createUser({ email: '', password: '', name: '' })
        ).rejects.toThrow(AppError);
      });

      it('should throw ConflictError for duplicate email', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' }),
          create: jest.fn(),
          save: jest.fn()
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        await expect(
          userService.createUser({
            email: 'test@example.com',
            password: 'password12345678',
            name: 'Test User'
          })
        ).rejects.toThrow(ConflictError);
      });

      it('should throw ValidationError for short password', async () => {
        await expect(
          userService.createUser({
            email: 'test@example.com',
            password: 'short',
            name: 'Test User'
          })
        ).rejects.toThrow(AppError);
      });
    });

    describe('findByEmail', () => {
      it('should find user by email', async () => {
        const mockUser = { id: '1', email: 'test@example.com', name: 'Test' };
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(mockUser)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const user = await userService.findByEmail('test@example.com');

        expect(mockRepo.findOne).toHaveBeenCalledWith({
          where: { email: 'test@example.com' }
        });
        expect(user).toEqual(mockUser);
      });

      it('should return null for non-existent email', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const user = await userService.findByEmail('nonexistent@example.com');

        expect(user).toBeNull();
      });
    });

    describe('findById', () => {
      it('should find user by ID', async () => {
        const mockUser = { id: '1', email: 'test@example.com' };
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(mockUser)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const user = await userService.findById('1');

        expect(mockRepo.findOne).toHaveBeenCalledWith({
          where: { id: '1' }
        });
        expect(user).toEqual(mockUser);
      });

      it('should return null for non-existent ID', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const user = await userService.findById('999');

        expect(user).toBeNull();
      });
    });

    describe('updateUser', () => {
      it('should update user', async () => {
        const mockUser = { id: '1', email: 'test@example.com', name: 'Test' };
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(mockUser),
          find: jest.fn().mockResolvedValue([]),
          save: jest.fn().mockResolvedValue(mockUser)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const updatedUser = await userService.updateUser('1', {
          name: 'Updated Name'
        });

        expect(mockUser.name).toBe('Updated Name');
        expect(mockRepo.save).toHaveBeenCalled();
      });

      it('should throw NotFoundError for non-existent user', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        await expect(
          userService.updateUser('999', { name: 'Updated Name' })
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('deleteUser', () => {
      it('should delete user', async () => {
        const mockUser = { id: '1' };
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(mockUser),
          remove: jest.fn().mockResolvedValue(undefined)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        await userService.deleteUser('1');

        expect(mockRepo.remove).toHaveBeenCalled();
      });

      it('should throw NotFoundError for non-existent user', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        await expect(
          userService.deleteUser('999')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('validatePassword', () => {
      it('should validate password', async () => {
        const user = { password_hash: 'hashed_password' } as User;
        const isValid = await userService.validatePassword(user, 'password123');

        expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
        expect(isValid).toBe(true);
      });

      it('should return false for invalid password', async () => {
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        const user = { password_hash: 'hashed_password' } as User;
        const isValid = await userService.validatePassword(user, 'wrong_password');

        expect(isValid).toBe(false);
      });
    });
  });

  describe('AuthService', () => {
    describe('generateToken', () => {
      it('should generate a JWT token', () => {
        const user = { id: '1', email: 'test@example.com', role: 'agent' as const } as User;
        const token = generateToken(user);

        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      });
    });

    describe('accessTokenTtlSeconds', () => {
      it('should parse minutes', () => {
        const ttl = accessTokenTtlSeconds();
        expect(ttl).toBe(15 * 60); // 15 minutes
      });
    });

    describe('verifyToken', () => {
      it('should verify a valid token', () => {
        const user = { id: '1', email: 'test@example.com', role: 'agent' as const } as User;
        const token = generateToken(user);
        const decoded = verifyToken(token);

        expect(decoded.userId).toBe('1');
        expect(decoded.email).toBe('test@example.com');
        expect(decoded.role).toBe('agent');
      });

      it('should throw AuthenticationError for invalid token', () => {
        expect(() => verifyToken('invalid.token.here')).toThrow(AuthenticationError);
      });
    });

    describe('register', () => {
      it('should register a new user', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockReturnValue({ id: '1', email: 'test@example.com' }),
          save: jest.fn().mockResolvedValue({ id: '1', email: 'test@example.com' })
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const result = await authService.register({
          email: 'test@example.com',
          password: 'password12345678',
          name: 'Test User'
        });

        expect(result.token).toBeDefined();
        expect(result.refresh_token).toBeDefined();
        expect(result.expires_in).toBeDefined();
        expect(result.user.email).toBe('test@example.com');
      });
    });

    describe('login', () => {
      it('should login with valid credentials', async () => {
        const mockUser = { 
          id: '1', 
          email: 'test@example.com', 
          password_hash: 'hashed_password' 
        } as User;
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(mockUser)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const result = await authService.login({
          email: 'test@example.com',
          password: 'password12345678'
        });

        expect(result.token).toBeDefined();
        expect(result.user.email).toBe('test@example.com');
      });

      it('should throw AuthenticationError for invalid email', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        await expect(
          authService.login({
            email: 'nonexistent@example.com',
            password: 'password12345678'
          })
        ).rejects.toThrow(AuthenticationError);
      });

      it('should throw AuthenticationError for invalid password', async () => {
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        const mockUser = { 
          id: '1', 
          email: 'test@example.com', 
          password_hash: 'hashed_password' 
        } as User;
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(mockUser)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        await expect(
          authService.login({
            email: 'test@example.com',
            password: 'wrong_password'
          })
        ).rejects.toThrow(AuthenticationError);
      });
    });

    describe('refresh', () => {
      it('should refresh token', async () => {
        const mockUser = { id: '1', email: 'test@example.com', role: 'agent' as const } as User;
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(mockUser)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        const result = await authService.refresh('valid_refresh_token');

        expect(result.token).toBeDefined();
        expect(result.refreshToken).toBeDefined();
      });

      it('should throw NotFoundError for non-existent user', async () => {
        const mockRepo = {
          findOne: jest.fn().mockResolvedValue(null)
        };
        (getRepository as jest.Mock).mockReturnValue(mockRepo);

        await expect(
          authService.refresh('valid_refresh_token')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('logout', () => {
      it('should logout successfully', async () => {
        await authService.logout('valid_refresh_token');
        // Should not throw
      });
    });

    describe('getCurrentUser', () => {
      it('should return decoded user from token', () => {
        const user = { id: '1', email: 'test@example.com', role: 'agent' as const } as User;
        const token = generateToken(user);
        const decoded = authService.getCurrentUser(token);

        expect(decoded.userId).toBe('1');
        expect(decoded.email).toBe('test@example.com');
        expect(decoded.role).toBe('agent');
      });

      it('should throw AuthenticationError for invalid token', () => {
        expect(() => authService.getCurrentUser('invalid.token')).toThrow(AuthenticationError);
      });
    });
  });
});
