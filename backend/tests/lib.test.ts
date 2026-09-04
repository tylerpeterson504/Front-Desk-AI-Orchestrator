// Tests for backend/src/lib utilities
// Focused tests for error handling and data utilities without overloading

import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  NetworkError,
  ExternalServiceError,
  ConfigurationError,
  SecurityError,
  InternalServerError,
  ErrorSeverity,
  ErrorCategory,
  createErrorContext,
  classifyError,
  wrapError,
  getUserFriendlyMessage,
  detectError,
  recoverFromError,
  retryWithBackoff
} from '../src/lib/errors';

import {
  validate,
  safeValidate,
  sanitize,
  isObject,
  isPlainObject,
  isNonEmptyObject,
  isNonEmptyString,
  isEmail,
  isUrl,
  deepClone,
  deepMerge,
  pick,
  omit,
  getNestedValue,
  setNestedValue,
  groupBy,
  createLookup,
  chunkArray,
  uniqueBy
} from '../src/lib/dataUtils';

import {
  ok,
  err,
  fromPromise,
  fromTry,
  collect,
  collectAll,
  partition,
  toObject,
  fromObject
} from '../src/lib/result';

import {
  createPipeline,
  commonSchemas
} from '../src/lib/validation';

import { z } from 'zod';

describe('Error Handling', () => {
  describe('Error Classes', () => {
    it('should create AppError with all properties', () => {
      const context = {
        requestId: 'test-123',
        timestamp: new Date(),
        path: '/api/test',
        method: 'GET'
      };

      const error = new AppError(400, 'TEST_ERROR', 'Test message', {
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.VALIDATION,
        context,
        isOperational: true
      });

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.context).toEqual(context);
      expect(error.isOperational).toBe(true);
    });

    it('should create ValidationError', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.category).toBe(ErrorCategory.VALIDATION);
    });

    it('should create AuthorizationError with details', () => {
      const error = new AuthorizationError('Access denied', {
        requiredRole: 'admin',
        userRole: 'agent',
        resource: 'properties',
        action: 'delete'
      });

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.requiredRole).toBe('admin');
      expect(error.userRole).toBe('agent');
    });

    it('should create NotFoundError', () => {
      const error = new NotFoundError('Property', 123);
      expect(error.statusCode).toBe(404);
      expect(error.resourceType).toBe('Property');
      expect(error.resourceId).toBe(123);
    });

    it('should create DatabaseError with internal message', () => {
      const error = new DatabaseError('Connection refused', 'Database unavailable');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.internalMessage).toBe('Connection refused');
      expect(error.message).toBe('Database unavailable');
    });
  });

  describe('Error Utilities', () => {
    it('should classify AppError correctly', () => {
      const error = new ValidationError('test');
      const classified = classifyError(error);
      expect(classified.severity).toBe(ErrorSeverity.LOW);
      expect(classified.category).toBe(ErrorCategory.VALIDATION);
      expect(classified.isOperational).toBe(true);
    });

    it('should classify unknown errors as internal', () => {
      const error = new Error('Unknown error');
      const classified = classifyError(error);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.category).toBe(ErrorCategory.INTERNAL);
      expect(classified.isOperational).toBe(false);
    });

    it('should wrap error with context', () => {
      const originalError = new Error('Original error');
      const context = { requestId: 'test-123' };
      const wrapped = wrapError(originalError, context as any);

      expect(wrapped).toBeInstanceOf(InternalServerError);
      expect(wrapped.context).toEqual(context);
    });

    it('should get user-friendly message for operational errors', () => {
      const error = new ValidationError('Invalid email');
      expect(getUserFriendlyMessage(error)).toBe('Invalid email');
    });

    it('should get generic message for non-operational errors', () => {
      const error = new DatabaseError('Connection failed');
      expect(getUserFriendlyMessage(error)).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should detect error from string', () => {
      const error = detectError('Something went wrong');
      expect(error).toBeInstanceOf(InternalServerError);
      expect(error?.message).toBe('Something went wrong');
    });

    it('should detect error from Error object', () => {
      const error = detectError(new Error('Test error'));
      expect(error).toBeInstanceOf(InternalServerError);
    });

    it('should detect error from object with message', () => {
      const error = detectError({ message: 'Error message' });
      expect(error).toBeInstanceOf(InternalServerError);
      expect(error?.message).toBe('Error message');
    });

    it('should return null for non-errors', () => {
      expect(detectError(null)).toBeNull();
      expect(detectError(undefined)).toBeNull();
      expect(detectError('')).toBeNull();
    });
  });

  describe('Error Recovery', () => {
    it('should recover from error with retry', async () => {
      let attemptCount = 0;
      const result = await recoverFromError(
        async () => {
          attemptCount++;
          if (attemptCount < 3) throw new NetworkError('Temporary error');
          return Promise.resolve('success');
        },
        { retryAfter: 10, maxRetries: 5 }
      );

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    it('should use fallback when all retries fail', async () => {
      const result = await recoverFromError(
        async () => { throw new Error('Permanent error'); },
        { maxRetries: 2, fallback: async () => Promise.resolve('fallback') }
      );

      expect(result).toBe('fallback');
    });

    it('should retry with exponential backoff', async () => {
      const startTime = Date.now();
      let attemptCount = 0;

      await retryWithBackoff(
        async () => {
          attemptCount++;
          if (attemptCount < 3) throw new Error('Retry');
          return Promise.resolve('success');
        },
        { baseDelay: 50, maxRetries: 5 }
      );

      const elapsed = Date.now() - startTime;
      expect(attemptCount).toBe(3);
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });
});

describe('Data Utilities', () => {
  describe('Validation', () => {
    it('should validate with Zod schema', () => {
      const schema = z.object({ name: z.string().min(1) });
      const result = validate({ name: 'test' }, schema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('should fail validation', () => {
      const schema = z.object({ name: z.string().min(1) });
      const result = validate({ name: '' }, schema);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });

    it('should safe validate without throwing', () => {
      const schema = z.object({ name: z.string() });
      const result = safeValidate({ name: 'test' }, schema);
      expect(result).toEqual({ name: 'test' });
    });

    it('should return null for invalid data', () => {
      const schema = z.object({ name: z.string() });
      const result = safeValidate({ name: 123 }, schema);
      expect(result).toBeNull();
    });
  });

  describe('Sanitization', () => {
    it('should sanitize strings', () => {
      const result = sanitize({
        name: '  test  ',
        description: 'test\n\tvalue'
      });

      expect(result.name).toBe('test');
      expect(result.description).toBe('test value');
    });

    it('should limit string length', () => {
      const longString = 'a'.repeat(100);
      const result = sanitize({ value: longString }, { maxStringLength: 10 });
      expect(result.value.length).toBe(10);
    });

    it('should remove blocked keys', () => {
      const result = sanitize(
        { name: 'test', password: 'secret', apiKey: 'key123' },
        { blockedKeys: ['password', 'apiKey'] }
      );

      expect(result.name).toBe('test');
      expect((result as any).password).toBeUndefined();
      expect((result as any).apiKey).toBeUndefined();
    });

    it('should only include allowed keys', () => {
      const result = sanitize(
        { name: 'test', age: 25, email: 'test@example.com' },
        { allowedKeys: ['name', 'age'] }
      );

      expect((result as any).name).toBe('test');
      expect((result as any).age).toBe(25);
      expect((result as any).email).toBeUndefined();
    });
  });

  describe('Type Guards', () => {
    it('should check isObject', () => {
      expect(isObject({})).toBe(true);
      expect(isObject(null)).toBe(false);
      expect(isObject([])).toBe(false);
      expect(isObject('string')).toBe(false);
    });

    it('should check isPlainObject', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject([])).toBe(false);
    });

    it('should check isNonEmptyObject', () => {
      expect(isNonEmptyObject({ a: 1 })).toBe(true);
      expect(isNonEmptyObject({})).toBe(false);
    });

    it('should check isNonEmptyString', () => {
      expect(isNonEmptyString('test')).toBe(true);
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
    });

    it('should check isEmail', () => {
      expect(isEmail('test@example.com')).toBe(true);
      expect(isEmail('invalid')).toBe(false);
    });

    it('should check isUrl', () => {
      expect(isUrl('https://example.com')).toBe(true);
      expect(isUrl('invalid')).toBe(false);
    });
  });

  describe('Object Manipulation', () => {
    it('should deep clone objects', () => {
      const obj = { a: { b: { c: 1 } } };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect((cloned as any).a).not.toBe((obj as any).a);
    });

    it('should deep merge objects', () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { b: { d: 3 }, e: 4 };
      const merged = deepMerge(obj1, obj2);
      expect(merged).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
    });

    it('should pick keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const picked = pick(obj, ['a', 'c']);
      expect(picked).toEqual({ a: 1, c: 3 });
    });

    it('should omit keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const omitted = omit(obj, ['b']);
      expect(omitted).toEqual({ a: 1, c: 3 });
    });

    it('should get nested value', () => {
      const obj = { a: { b: { c: 123 } } };
      expect(getNestedValue(obj as any, 'a.b.c')).toBe(123);
      expect(getNestedValue(obj as any, 'a.x.y', 'default')).toBe('default');
    });

    it('should set nested value', () => {
      const obj: any = { a: { b: {} } };
      setNestedValue(obj, 'a.b.c', 456);
      expect(obj.a.b.c).toBe(456);
    });
  });

  describe('Array Utilities', () => {
    it('should group by key', () => {
      const items = [
        { id: '1', category: 'A' },
        { id: '2', category: 'B' },
        { id: '3', category: 'A' }
      ];
      const grouped = groupBy(items, 'category');
      expect(grouped.A).toHaveLength(2);
      expect(grouped.B).toHaveLength(1);
    });

    it('should create lookup', () => {
      const items = [
        { id: '1', name: 'first' },
        { id: '2', name: 'second' }
      ];
      const lookup = createLookup(items, 'id');
      expect(lookup['1']?.name).toBe('first');
      expect(lookup['2']?.name).toBe('second');
    });

    it('should chunk array', () => {
      const array = [1, 2, 3, 4, 5];
      const chunked = chunkArray(array, 2);
      expect(chunked).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should unique by key', () => {
      const items = [
        { id: '1', name: 'first' },
        { id: '2', name: 'second' },
        { id: '1', name: 'duplicate' }
      ];
      const unique = uniqueBy(items, 'id');
      expect(unique).toHaveLength(2);
      expect(unique[0]?.name).toBe('first');
    });
  });
});

describe('Result Type', () => {
  describe('Constructors', () => {
    it('should create Ok result', () => {
      const result = ok('success');
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
      expect(result.unwrap()).toBe('success');
    });

    it('should create Err result', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(result.isOk()).toBe(false);
      expect(result.isErr()).toBe(true);
      expect(() => result.unwrap()).toThrow();
    });
  });

  describe('Conversions', () => {
    it('should convert to object', () => {
      const okResult = ok('data');
      const okObj = toObject(okResult);
      expect(okObj.success).toBe(true);
      expect(okObj.data).toBe('data');

      const errResult = err(new Error('error'));
      const errObj = toObject(errResult);
      expect(errObj.success).toBe(false);
      expect(errObj.error).toBeDefined();
    });

    it('should convert from object', () => {
      const obj = { success: true, data: 'test' };
      const result = fromObject(obj);
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('test');
    });
  });

  describe('Promise Interop', () => {
    it('should wrap promise with fromPromise', async () => {
      const result = await fromPromise(Promise.resolve('success'));
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('success');
    });

    it('should handle promise rejection', async () => {
      const result = await fromPromise(Promise.reject(new Error('error')));
      expect(result.isErr()).toBe(true);
    });

    it('should wrap function with fromTry', () => {
      const result = fromTry(() => 'success');
      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe('success');
    });

    it('should handle function error', () => {
      const result = fromTry(() => { throw new Error('error'); });
      expect(result.isErr()).toBe(true);
    });
  });

  describe('Array Operations', () => {
    it('should collect all successful results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const collected = collect(results);
      expect(collected.isOk()).toBe(true);
      expect(collected.unwrap()).toEqual([1, 2, 3]);
    });

    it('should return first error in collect', () => {
      const error = new Error('test');
      const results = [ok(1), err(error), ok(3)];
      const collected = collect(results);
      expect(collected.isErr()).toBe(true);
    });

    it('should collect all errors', () => {
      const error1 = new Error('error1');
      const error2 = new Error('error2');
      const results = [ok(1), err(error1), err(error2)];
      const collected = collectAll(results);
      expect(collected.isErr()).toBe(true);
      if (collected.isErr()) {
        expect(collected.error).toHaveLength(2);
      }
    });

    it('should partition results', () => {
      const error = new Error('error');
      const results = [ok(1), err(error), ok(2)];
      const { ok: okResults, err: errResults } = partition(results);
      expect(okResults).toEqual([1, 2]);
      expect(errResults).toHaveLength(1);
    });
  });

  describe('Chaining', () => {
    it('should map successful result', () => {
      const result = ok(5);
      const mapped = result.map(x => x * 2);
      expect(mapped.isOk()).toBe(true);
      expect(mapped.unwrap()).toBe(10);
    });

    it('should flatMap successful result', () => {
      const result = ok(5);
      const mapped = result.flatMap(x => ok(x * 2));
      expect(mapped.isOk()).toBe(true);
      expect(mapped.unwrap()).toBe(10);
    });

    it('should map error result', () => {
      const error = new Error('original');
      const result = err(error);
      const mapped = result.mapErr(e => new Error(`Wrapped: ${(e as Error).message}`));
      expect(mapped.isErr()).toBe(true);
    });
  });

  describe('Fallbacks', () => {
    it('should unwrap with default', () => {
      const error = new Error('error');
      const result = err(error);
      expect(result.unwrapOr('default')).toBe('default');
    });

    it('should unwrap or else', () => {
      const error = new Error('error');
      const result = err(error);
      expect(result.unwrapOrElse(() => 'computed')).toBe('computed');
    });
  });
});

describe('Validation Pipeline', () => {
  it('should validate with pipeline', () => {
    const pipeline = createPipeline<string>()
      .required('Field is required')
      .type('string')
      .length({ min: 3, max: 10 });

    const result = pipeline.validate('test');
    expect(result.success).toBe(true);
    expect(result.data).toBe('test');
  });

  it('should fail validation', () => {
    const pipeline = createPipeline<string>()
      .required('Field is required')
      .length({ min: 5 });

    const result = pipeline.validate('');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('REQUIRED_ERROR');
  });

  it('should chain validators', () => {
    const pipeline = createPipeline<any>()
      .addSchema(z.object({ name: z.string().min(1) }), 'name')
      .addCustom(
        (value: any) => value.age !== undefined && value.age >= 0,
        'Age must be non-negative',
        'age'
      );

    const validResult = pipeline.validate({ name: 'test', age: 25 });
    expect(validResult.success).toBe(true);

    const invalidResult = pipeline.validate({ name: '', age: -5 });
    expect(invalidResult.success).toBe(false);
  });

  it('should use conditional validation', () => {
    const pipeline = createPipeline<any>()
      .required('Type is required', 'type')
      .when(
        (data: any) => data.type === 'email',
        (value: any) => {
          const validation = validate(value.value, z.string().email());
          return validation as any;
        },
        'value'
      );

    const result1 = pipeline.validate({ type: 'email', value: 'test@example.com' });
    expect(result1.success).toBe(true);

    const result2 = pipeline.validate({ type: 'email', value: 'invalid' });
    expect(result2.success).toBe(false);
  });

  it('should use common schemas', () => {
    const result = validate(
      { email: 'test@example.com', password: 'password123', name: 'Test User' },
      commonSchemas.userCreate
    );
    expect(result.success).toBe(true);
  });
});
