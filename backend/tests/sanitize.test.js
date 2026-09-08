// Unit tests for the sanitization middleware.
//
// Tests prototype pollution protection and input sanitization.

const {
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
  trimObjectStrings,
  trimBodyStrings,
  removeFields,
  removeBodyFields,
  escapeHtml,
  escapeBodyHtml
} = require('../src/middleware/sanitize');

describe('sanitizeObject', () => {
  it('returns null for null input', () => {
    expect(sanitizeObject(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(sanitizeObject(undefined)).toBeUndefined();
  });

  it('returns primitive values unchanged', () => {
    expect(sanitizeObject('hello')).toBe('hello');
    expect(sanitizeObject(123)).toBe(123);
    expect(sanitizeObject(true)).toBe(true);
    expect(sanitizeObject(false)).toBe(false);
  });

  it('removes __proto__ from object', () => {
    const obj = { a: 1, __proto__: { malicious: true } };
    const result = sanitizeObject(obj);
    expect(result.__proto__).toBeUndefined();
    expect(result.a).toBe(1);
  });

  it('removes constructor from object', () => {
    const obj = { a: 1, constructor: { malicious: true } };
    const result = sanitizeObject(obj);
    expect(result.constructor).toBeUndefined();
    expect(result.a).toBe(1);
  });

  it('removes prototype from object', () => {
    const obj = { a: 1, prototype: { malicious: true } };
    const result = sanitizeObject(obj);
    expect(result.prototype).toBeUndefined();
    expect(result.a).toBe(1);
  });

  it('recursively sanitizes nested objects', () => {
    const obj = {
      a: 1,
      nested: {
        b: 2,
        __proto__: { malicious: true }
      }
    };
    const result = sanitizeObject(obj);
    expect(result.nested.__proto__).toBeUndefined();
    expect(result.nested.b).toBe(2);
  });

  it('recursively sanitizes arrays', () => {
    const obj = {
      a: 1,
      arr: [
        { b: 2 },
        { __proto__: { malicious: true }, c: 3 }
      ]
    };
    const result = sanitizeObject(obj);
    expect(result.arr[0].b).toBe(2);
    expect(result.arr[1].__proto__).toBeUndefined();
    expect(result.arr[1].c).toBe(3);
  });

  it('handles deep nesting', () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            __proto__: { malicious: true },
            value: 'deep'
          }
        }
      }
    };
    const result = sanitizeObject(obj);
    expect(result.level1.level2.level3.__proto__).toBeUndefined();
    expect(result.level1.level2.level3.value).toBe('deep');
  });
});

describe('trimObjectStrings', () => {
  it('returns null for null input', () => {
    expect(trimObjectStrings(null)).toBeNull();
  });

  it('returns undefined for undefined input', () => {
    expect(trimObjectStrings(undefined)).toBeUndefined();
  });

  it('trims string values', () => {
    const obj = { a: ' hello ', b: 'world  ' };
    const result = trimObjectStrings(obj);
    expect(result.a).toBe('hello');
    expect(result.b).toBe('world');
  });

  it('leaves non-string values unchanged', () => {
    const obj = { a: 123, b: true, c: null };
    const result = trimObjectStrings(obj);
    expect(result.a).toBe(123);
    expect(result.b).toBe(true);
    expect(result.c).toBe(null);
  });

  it('recursively trims nested objects', () => {
    const obj = {
      a: ' hello ',
      nested: {
        b: ' world ',
        c: 123
      }
    };
    const result = trimObjectStrings(obj);
    expect(result.a).toBe('hello');
    expect(result.nested.b).toBe('world');
    expect(result.nested.c).toBe(123);
  });

  it('recursively trims arrays', () => {
    const obj = {
      arr: [' a ', ' b ', 123]
    };
    const result = trimObjectStrings(obj);
    expect(result.arr[0]).toBe('a');
    expect(result.arr[1]).toBe('b');
    expect(result.arr[2]).toBe(123);
  });
});

describe('removeFields', () => {
  it('returns value unchanged for non-objects', () => {
    expect(removeFields('string', ['a'])).toBe('string');
    expect(removeFields(123, ['a'])).toBe(123);
    expect(removeFields(null, ['a'])).toBe(null);
    expect(removeFields(undefined, ['a'])).toBe(undefined);
  });

  it('removes specified fields', () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = removeFields(obj, ['b']);
    expect(result.a).toBe(1);
    expect(result.b).toBeUndefined();
    expect(result.c).toBe(3);
  });

  it('removes multiple fields', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 };
    const result = removeFields(obj, ['b', 'd']);
    expect(result.a).toBe(1);
    expect(result.b).toBeUndefined();
    expect(result.c).toBe(3);
    expect(result.d).toBeUndefined();
  });

  it('recursively removes fields from nested objects', () => {
    const obj = {
      a: 1,
      nested: {
        b: 2,
        secret: 'private'
      }
    };
    const result = removeFields(obj, ['secret']);
    expect(result.nested.secret).toBeUndefined();
    expect(result.nested.b).toBe(2);
  });

  it('recursively removes fields from arrays', () => {
    const obj = {
      arr: [
        { a: 1, secret: 'private1' },
        { b: 2, secret: 'private2' }
      ]
    };
    const result = removeFields(obj, ['secret']);
    expect(result.arr[0].secret).toBeUndefined();
    expect(result.arr[1].secret).toBeUndefined();
    expect(result.arr[0].a).toBe(1);
    expect(result.arr[1].b).toBe(2);
  });
});

describe('escapeHtml', () => {
  it('returns value unchanged for non-strings', () => {
    expect(escapeHtml(123)).toBe(123);
    expect(escapeHtml(null)).toBe(null);
    expect(escapeHtml(undefined)).toBe(undefined);
  });

  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("'single'")).toBe('&#x27;single&#x27;');
  });

  it('escapes multiple special characters', () => {
    const input = '<div class="test" id=\'example\'>&</div>';
    const expected = '&lt;div class=&quot;test&quot; id=&#x27;example&#x27;&amp;&gt;&lt;/div&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
    expect(escapeHtml('12345')).toBe('12345');
  });
});

describe('sanitizeBody middleware', () => {
  it('sanitizes request body', () => {
    const mockReq = {
      body: { a: 1, __proto__: { malicious: true } }
    };
    const mockRes = {};
    const next = jest.fn();

    sanitizeBody(mockReq, mockRes, next);

    expect(mockReq.body.__proto__).toBeUndefined();
    expect(mockReq.body.a).toBe(1);
    expect(next).toHaveBeenCalled();
  });

  it('handles missing body', () => {
    const mockReq = {};
    const mockRes = {};
    const next = jest.fn();

    sanitizeBody(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('sanitizeQuery middleware', () => {
  it('sanitizes request query', () => {
    const mockReq = {
      query: { a: 1, __proto__: { malicious: true } }
    };
    const mockRes = {};
    const next = jest.fn();

    sanitizeQuery(mockReq, mockRes, next);

    expect(mockReq.query.__proto__).toBeUndefined();
    expect(mockReq.query.a).toBe(1);
    expect(next).toHaveBeenCalled();
  });

  it('handles missing query', () => {
    const mockReq = {};
    const mockRes = {};
    const next = jest.fn();

    sanitizeQuery(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('trimBodyStrings middleware', () => {
  it('trims string values in body', () => {
    const mockReq = {
      body: { a: ' hello ', b: 'world  ' }
    };
    const mockRes = {};
    const next = jest.fn();

    trimBodyStrings(mockReq, mockRes, next);

    expect(mockReq.body.a).toBe('hello');
    expect(mockReq.body.b).toBe('world');
    expect(next).toHaveBeenCalled();
  });

  it('handles missing body', () => {
    const mockReq = {};
    const mockRes = {};
    const next = jest.fn();

    trimBodyStrings(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('removeBodyFields middleware', () => {
  it('removes specified fields from body', () => {
    const mockReq = {
      body: { a: 1, secret: 'private', b: 2 }
    };
    const mockRes = {};
    const next = jest.fn();

    const middleware = removeBodyFields(['secret']);
    middleware(mockReq, mockRes, next);

    expect(mockReq.body.a).toBe(1);
    expect(mockReq.body.secret).toBeUndefined();
    expect(mockReq.body.b).toBe(2);
    expect(next).toHaveBeenCalled();
  });

  it('handles missing body', () => {
    const mockReq = {};
    const mockRes = {};
    const next = jest.fn();

    const middleware = removeBodyFields(['secret']);
    middleware(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('escapeBodyHtml middleware', () => {
  it('escapes HTML in body strings', () => {
    const mockReq = {
      body: { a: '<script>alert(1)</script>' }
    };
    const mockRes = {};
    const next = jest.fn();

    escapeBodyHtml(mockReq, mockRes, next);

    expect(mockReq.body.a).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(next).toHaveBeenCalled();
  });

  it('handles missing body', () => {
    const mockReq = {};
    const mockRes = {};
    const next = jest.fn();

    escapeBodyHtml(mockReq, mockRes, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('prototype pollution protection', () => {
  it('prevents __proto__ pollution in nested objects', () => {
    const malicious = JSON.parse('{"a":{"__proto__":{"polluted":true}}}');
    const result = sanitizeObject(malicious);
    
    // Verify __proto__ was removed
    expect(result.a.__proto__).toBeUndefined();
    
    // Verify the object is not polluted
    const test = {};
    Object.assign(test, result);
    expect(test.polluted).toBeUndefined();
  });

  it('prevents constructor pollution', () => {
    const malicious = JSON.parse('{"constructor":{"polluted":true}}');
    const result = sanitizeObject(malicious);
    
    expect(result.constructor).toBeUndefined();
  });

  it('handles array prototype pollution', () => {
    const malicious = JSON.parse('{"a":[{"__proto__":{"polluted":true}}]}');
    const result = sanitizeObject(malicious);
    
    expect(result.a[0].__proto__).toBeUndefined();
  });
});
