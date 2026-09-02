import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  DatabaseError
} from '../src/lib/errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an error with all properties', () => {
      const error = new AppError(400, 'TEST_ERROR', 'Test message', { field: 'test' }, 'req-123');
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.details).toEqual({ field: 'test' });
      expect(error.requestId).toBe('req-123');
      expect(error.name).toBe('AppError');
    });

    it('should set default requestId to undefined', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Internal error');
      
      expect(error.requestId).toBeUndefined();
    });

    it('should capture stack trace', () => {
      const error = new AppError(500, 'INTERNAL_ERROR', 'Internal error');
      
      expect(error.stack).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create a validation error with status 400', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
      expect(error.details).toEqual({ field: 'email' });
    });

    it('should create a validation error without details', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
      expect(error.details).toBeUndefined();
    });
  });

  describe('AuthenticationError', () => {
    it('should create an authentication error with status 401', () => {
      const error = new AuthenticationError();
      
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Authentication failed');
    });

    it('should accept custom message', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.message).toBe('Invalid credentials');
    });
  });

  describe('AuthorizationError', () => {
    it('should create an authorization error with status 403', () => {
      const error = new AuthorizationError();
      
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.message).toBe('Access denied');
    });

    it('should accept custom message', () => {
      const error = new AuthorizationError('Insufficient permissions');
      
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.message).toBe('Insufficient permissions');
    });
  });

  describe('NotFoundError', () => {
    it('should create a not found error with status 404', () => {
      const error = new NotFoundError('User', 123);
      
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found: 123');
    });

    it('should handle string IDs', () => {
      const error = new NotFoundError('Property', 'abc-123');
      
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Property not found: abc-123');
    });
  });

  describe('RateLimitError', () => {
    it('should create a rate limit error with status 429', () => {
      const error = new RateLimitError();
      
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.message).toBe('Too many requests');
    });

    it('should accept custom message', () => {
      const error = new RateLimitError('Rate limit exceeded');
      
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.message).toBe('Rate limit exceeded');
    });
  });

  describe('DatabaseError', () => {
    it('should create a database error with status 500', () => {
      const error = new DatabaseError('Connection failed', 'Database unavailable');
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.message).toBe('Database unavailable');
    });

    it('should use internal message as fallback', () => {
      const error = new DatabaseError('Connection failed');
      
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.message).toBe('Connection failed');
    });
  });

  describe('Error inheritance', () => {
    it('should be instance of Error', () => {
      const error = new AppError(400, 'TEST_ERROR', 'Test');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });

    it('should have ValidationError as instance of AppError', () => {
      const error = new ValidationError('Test');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should have AuthenticationError as instance of AppError', () => {
      const error = new AuthenticationError();
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(AuthenticationError);
    });
  });
});
