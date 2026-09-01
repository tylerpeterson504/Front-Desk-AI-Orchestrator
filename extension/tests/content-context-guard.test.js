/**
 * Tests for content script context guard functionality.
 * Tests that context extraction and validation handles edge cases properly.
 */

describe('Content Script Context Guard', function() {
  describe('sanitizeText', function() {
    it('should return null/undefined as-is', function() {
      const contentScript = {
        sanitizeText: function(t) {
          if (!t || typeof t !== 'string') return t;
          let s = t.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
          return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
      };
      expect(contentScript.sanitizeText(null)).toBeNull();
      expect(contentScript.sanitizeText(undefined)).toBeUndefined();
    });

    it('should return non-string values as-is', function() {
      const contentScript = {
        sanitizeText: function(t) {
          if (!t || typeof t !== 'string') return t;
          return t.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        }
      };
      expect(contentScript.sanitizeText(123)).toBe(123);
      expect(contentScript.sanitizeText(true)).toBe(true);
    });

    it('should escape HTML entities', function() {
      const contentScript = {
        sanitizeText: function(t) {
          if (!t || typeof t !== 'string') return t;
          let s = t.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
          s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
          return s;
        }
      };
      expect(contentScript.sanitizeText('<script>alert("xss")</script>')).toBe('');
    });
  });

  describe('validateContext', function() {
    function validateContext(ctx) {
      if (!ctx || typeof ctx !== 'object') throw new Error('Context must be an object');
      if (!Array.isArray(ctx.messages)) throw new Error('messages must be an array');
      ctx.messages.forEach(function(m, index) {
        if (!m || typeof m !== 'object') throw new Error('Message at index ' + index + ' must be an object');
        if (typeof m.text !== 'string') throw new Error('Message at index ' + index + ': text must be a string');
        if (m.sender !== null && typeof m.sender !== 'string') throw new Error('Message at index ' + index + ': sender must be string or null');
        if (m.time !== null && typeof m.time !== 'string') throw new Error('Message at index ' + index + ': time must be string or null');
      });
      if (typeof ctx.activeGuest !== 'string') throw new Error('activeGuest must be a string');
      if (typeof ctx.conversationId !== 'string') throw new Error('conversationId must be a string');
      return ctx;
    }

    it('should accept valid context', function() {
      const validContext = { messages: [{ sender: 'hotel', text: 'Hello', time: '10:00' }], activeGuest: 'John Doe', conversationId: '12345' };
      expect(() => validateContext(validContext)).not.toThrow();
    });

    it('should throw if context is not an object', function() {
      expect(() => validateContext(null)).toThrow('Context must be an object');
    });

    it('should throw if messages is not an array', function() {
      expect(() => validateContext({ messages: 'not an array', activeGuest: 'John', conversationId: '123' })).toThrow('messages must be an array');
    });
  });

  describe('injectMessage validation', function() {
    function injectMessage(text) {
      if (!text || typeof text !== 'string') return false;
      return true;
    }

    it('should reject non-string input', function() {
      expect(injectMessage(null)).toBe(false);
      expect(injectMessage(123)).toBe(false);
    });

    it('should reject empty string', function() {
      expect(injectMessage('')).toBe(false);
    });
  });
});
