// Unit tests for the shared validation module.
//
// Tests all validation utilities to ensure consistent behavior across the application.

const {
  requireString,
  optionalString,
  optionalStringOrEmpty,
  requirePositiveInteger,
  requireNonNegativeInteger,
  requireOneOf,
  requireArray,
  requireBoolean,
  requireObject,
  requireTime,
  requireEmail
} = require('../src/lib/validation');

// Helper to expect an httpError with specific properties
function expectValidationError(fn, status, message) {
  try {
    fn();
    fail('Expected validation error to be thrown');
  } catch (error) {
    expect(error.status).toBe(status);
    expect(error.message).toBe(message);
    expect(error.expose).toBe(true); // 4xx errors are exposed
  }
}

describe('requireString', () => {
  it.each([
    ['valid string', 'hello', 'hello'],
    ['string with spaces', ' hello world ', 'hello world'],
    ['empty string after trim', '   ', null],
    ['max length string', 'a'.repeat(255), 'a'.repeat(255)],
    ['custom max length', 'a'.repeat(100), 'a'.repeat(100), 100]
  ])('handles %s', (description, input, expected, maxLength) => {
    const result = requireString(input, 'test', maxLength ? { maxLength } : {});
    expect(result).toBe(expected);
  });

  it.each([
    [null, 'test is required'],
    [undefined, 'test is required'],
    [123, 'test is required'],
    ['', 'test is required'],
    ['   ', 'test is required']
  ])('rejects %s', (input) => {
    expectValidationError(
      () => requireString(input, 'test'),
      400,
      'test is required'
    );
  });

  it('rejects strings exceeding max length', () => {
    expectValidationError(
      () => requireString('a'.repeat(256), 'test', { maxLength: 255 }),
      400,
      'test must be at most 255 characters'
    );
  });
});

describe('optionalString', () => {
  it.each([
    ['null', null, null],
    ['undefined', undefined, null],
    ['empty string', '', null],
    ['whitespace only', '   ', null],
    ['valid string', 'hello', 'hello'],
    ['string with spaces', ' hello ', 'hello'],
    ['max length string', 'a'.repeat(255), 'a'.repeat(255)]
  ])('handles %s', (description, input, expected) => {
    const result = optionalString(input, 'test');
    expect(result).toBe(expected);
  });

  it('rejects non-string types', () => {
    expectValidationError(
      () => optionalString(123, 'test'),
      400,
      'test must be a string'
    );
  });

  it('rejects strings exceeding max length', () => {
    expectValidationError(
      () => optionalString('a'.repeat(256), 'test', { maxLength: 255 }),
      400,
      'test must be at most 255 characters'
    );
  });
});

describe('optionalStringOrEmpty', () => {
  it.each([
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['empty string', '', ''],
    ['whitespace only', '   ', ''],
    ['valid string', 'hello', 'hello'],
    ['string with spaces', ' hello ', 'hello']
  ])('handles %s', (description, input, expected) => {
    const result = optionalStringOrEmpty(input, 'test');
    expect(result).toBe(expected);
  });

  it('rejects non-string types', () => {
    expectValidationError(
      () => optionalStringOrEmpty(123, 'test'),
      400,
      'test must be a string'
    );
  });

  it('rejects strings exceeding max length', () => {
    expectValidationError(
      () => optionalStringOrEmpty('a'.repeat(256), 'test', { maxLength: 255 }),
      400,
      'test must be at most 255 characters'
    );
  });
});

describe('requirePositiveInteger', () => {
  it.each([
    [1, 1],
    [100, 100],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ['5', 5],
    ['100', 100]
  ])('accepts %s', (input, expected) => {
    expect(requirePositiveInteger(input, 'test')).toBe(expected);
  });

  it.each([
    [0, 'test must be a positive integer'],
    [-1, 'test must be a positive integer'],
    [-100, 'test must be a positive integer'],
    [1.5, 'test must be a positive integer'],
    ['abc', 'test must be a positive integer'],
    [null, 'test must be a positive integer'],
    [undefined, 'test must be a positive integer'],
    ['', 'test must be a positive integer']
  ])('rejects %s', (input) => {
    expectValidationError(
      () => requirePositiveInteger(input, 'test'),
      400,
      'test must be a positive integer'
    );
  });
});

describe('requireNonNegativeInteger', () => {
  it.each([
    [0, 0],
    [1, 1],
    [100, 100],
    ['0', 0],
    ['5', 5]
  ])('accepts %s', (input, expected) => {
    expect(requireNonNegativeInteger(input, 'test')).toBe(expected);
  });

  it.each([
    [-1, 'test must be a non-negative integer'],
    [-100, 'test must be a non-negative integer'],
    [1.5, 'test must be a non-negative integer'],
    ['abc', 'test must be a non-negative integer']
  ])('rejects %s', (input) => {
    expectValidationError(
      () => requireNonNegativeInteger(input, 'test'),
      400,
      'test must be a non-negative integer'
    );
  });
});

describe('requireOneOf', () => {
  const allowed = ['admin', 'manager', 'agent'];

  it.each([
    ['admin', 'admin'],
    ['manager', 'manager'],
    ['agent', 'agent']
  ])('accepts %s', (input) => {
    expect(requireOneOf(input, 'role', allowed)).toBe(input);
  });

  it('rejects unknown value', () => {
    expectValidationError(
      () => requireOneOf('superadmin', 'role', allowed),
      400,
      'role must be one of: admin, manager, agent'
    );
  });

  it('rejects null', () => {
    expectValidationError(
      () => requireOneOf(null, 'role', allowed),
      400,
      'role must be one of: admin, manager, agent'
    );
  });
});

describe('requireArray', () => {
  it.each([
    [[], []],
    [[1, 2, 3], [1, 2, 3]],
    [['a', 'b'], ['a', 'b']]
  ])('accepts %s', (input, expected) => {
    expect(requireArray(input, 'test')).toEqual(expected);
  });

  it('accepts array with custom max length', () => {
    const arr = [1, 2, 3];
    expect(requireArray(arr, 'test', { maxLength: 5 })).toEqual(arr);
  });

  it('rejects non-array', () => {
    expectValidationError(
      () => requireArray('not an array', 'test'),
      400,
      'test must be an array'
    );
  });

  it('rejects array exceeding max length', () => {
    expectValidationError(
      () => requireArray([1, 2, 3, 4, 5, 6], 'test', { maxLength: 5 }),
      400,
      'test must have at most 5 items'
    );
  });

  it('validates array items when itemValidator provided', () => {
    const validator = (val, field) => {
      if (typeof val !== 'string') {
        throw { status: 400, message: `${field} must be a string`, expose: true };
      }
    };

    expectValidationError(
      () => requireArray([1, 2, 3], 'test', { itemValidator: validator }),
      400,
      'test[0] must be a string'
    );
  });
});

describe('requireBoolean', () => {
  it.each([
    [true, true],
    [false, false]
  ])('accepts %s', (input, expected) => {
    expect(requireBoolean(input, 'test')).toBe(expected);
  });

  it.each([
    [1, 'test must be a boolean'],
    [0, 'test must be a boolean'],
    ['true', 'test must be a boolean'],
    [null, 'test must be a boolean'],
    [undefined, 'test must be a boolean']
  ])('rejects %s', (input) => {
    expectValidationError(
      () => requireBoolean(input, 'test'),
      400,
      'test must be a boolean'
    );
  });
});

describe('requireObject', () => {
  it.each([
    [{}, {}],
    [{ a: 1 }, { a: 1 }],
    [{ nested: { a: 1 } }, { nested: { a: 1 } }]
  ])('accepts %s', (input, expected) => {
    expect(requireObject(input, 'test')).toEqual(expected);
  });

  it.each([
    [null, 'test must be an object'],
    [undefined, 'test must be an object'],
    [123, 'test must be an object'],
    ['string', 'test must be an object'],
    [[], 'test must be an object']
  ])('rejects %s', (input) => {
    expectValidationError(
      () => requireObject(input, 'test'),
      400,
      'test must be an object'
    );
  });
});

describe('requireTime', () => {
  it.each([
    ['11:00:00', '11:00:00'],
    ['11:00', '11:00:00'],
    ['23:59:59', '23:59:59'],
    ['00:00:00', '00:00:00'],
    ['12:30:45', '12:30:45']
  ])('accepts %s', (input, expected) => {
    expect(requireTime(input, 'test')).toBe(expected);
  });

  it('uses fallback for null/undefined/empty', () => {
    expect(requireTime(null, 'test', '12:00:00')).toBe('12:00:00');
    expect(requireTime(undefined, 'test', '12:00:00')).toBe('12:00:00');
    expect(requireTime('', 'test', '12:00:00')).toBe('12:00:00');
  });

  it.each([
    ['24:00:00', 'test must be HH:MM or HH:MM:SS (24-hour)'],
    ['12:60:00', 'test must be HH:MM or HH:MM:SS (24-hour)'],
    ['12:00:60', 'test must be HH:MM or HH:MM:SS (24-hour)'],
    ['invalid', 'test must be HH:MM or HH:MM:SS (24-hour)'],
    ['12:00:00:00', 'test must be HH:MM or HH:MM:SS (24-hour)'],
    [123, 'test must be HH:MM or HH:MM:SS (24-hour)']
  ])('rejects %s', (input) => {
    expectValidationError(
      () => requireTime(input, 'test'),
      400,
      'test must be HH:MM or HH:MM:SS (24-hour)'
    );
  });

  it('trims whitespace', () => {
    expect(requireTime(' 11:00 ', 'test')).toBe('11:00:00');
  });
});

describe('requireEmail', () => {
  it.each([
    ['simple@test.com', 'simple@test.com'],
    ['user.name@domain.co.uk', 'user.name@domain.co.uk'],
    ['user+tag@example.com', 'user+tag@example.com'],
    ['  user@example.com  ', 'user@example.com'],
    ['UPPER@EXAMPLE.COM', 'upper@example.com']
  ])('accepts %s', (input, expected) => {
    expect(requireEmail(input, 'email')).toBe(expected);
  });

  it.each([
    [null, 'email is required'],
    [undefined, 'email is required'],
    ['', 'email is required'],
    ['   ', 'email is required'],
    ['not-an-email', 'email must be a valid email address'],
    ['@missing-local.com', 'email must be a valid email address'],
    ['local@', 'email must be a valid email address'],
    ['local@domain', 'email must be a valid email address'],
    ['local@.com', 'email must be a valid email address'],
    ['local domain@test.com', 'email must be a valid email address'],
    ['local@domain with spaces.com', 'email must be a valid email address']
  ])('rejects %s', (input) => {
    expectValidationError(
      () => requireEmail(input, 'email'),
      400,
      'email must be a valid email address'
    );
  });

  it('rejects emails exceeding max length', () => {
    const longLocal = 'a'.repeat(255);
    expectValidationError(
      () => requireEmail(`${longLocal}@test.com`, 'email'),
      400,
      'email must be a valid email address'
    );
  });

  it('normalizes email to lowercase', () => {
    expect(requireEmail('UPPER@EXAMPLE.COM', 'email')).toBe('upper@example.com');
  });
});
