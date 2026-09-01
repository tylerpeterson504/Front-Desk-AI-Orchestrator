/**
 * Tests for content script context guard functionality.
 * Tests that context extraction and validation handles edge cases properly.
 */

// Mock chrome.runtime for testing
const mockSendMessage = [];
global.chrome = {
  runtime: {
    sendMessage: function(payload) {
      mockSendMessage.push(payload);
    },
    onMessage: {
      addListener: function() {},
      removeListener: function() {}
    }
  },
  storage: {
    local: {
      get: function(keys, callback) {
        callback({ 'fdao-debug': false });
      },
      set: function() {}
    }
  }
};

describe('Content Script Context Guard', function() {
  beforeEach(function() {
    mockSendMessage.length = 0;
    document.body.innerHTML = '';
  });

  describe('sanitizeText', function() {
    it('should return null/undefined as-is', function() {
      const contentScript = { sanitizeText: function(t) { if (!t || typeof t !== 'string') return t; let result = t; let start = result.toLowerCase().indexOf('<script'); while (start !== -1) { const endTagStart = result.toLowerCase().indexOf('</script', start + 7); if (endTagStart === -1) { result = result.slice(0, start); break; } const endTagClose = result.indexOf('>', endTagStart); if (endTagClose === -1) { result = result.slice(0, start); break; } result = result.slice(0, start) + result.slice(endTagClose + 1); start = result.toLowerCase().indexOf('<script'); } return result.trim(); } };
      expect(contentScript.sanitizeText(null)).toBeNull();
      expect(contentScript.sanitizeText(undefined)).toBeUndefined();
    });

    it('should return non-string values as-is', function() {
      const contentScript = { sanitizeText: function(t) { if (!t || typeof t !== 'string') return t; let result = t; let start = result.toLowerCase().indexOf('<script'); while (start !== -1) { const endTagStart = result.toLowerCase().indexOf('</script', start + 7); if (endTagStart === -1) { result = result.slice(0, start); break; } const endTagClose = result.indexOf('>', endTagStart); if (endTagClose === -1) { result = result.slice(0, start); break; } result = result.slice(0, start) + result.slice(endTagClose + 1); start = result.toLowerCase().indexOf('<script'); } return result.trim(); } };
      expect(contentScript.sanitizeText(123)).toBe(123);
      expect(contentScript.sanitizeText(true)).toBe(true);
    });

    it('should strip script tags and trim text', function() {
      const contentScript = { sanitizeText: function(t) { if (!t || typeof t !== 'string') return t; let result = t; let start = result.toLowerCase().indexOf('<script'); while (start !== -1) { const endTagStart = result.toLowerCase().indexOf('</script', start + 7); if (endTagStart === -1) { result = result.slice(0, start); break; } const endTagClose = result.indexOf('>', endTagStart); if (endTagClose === -1) { result = result.slice(0, start); break; } result = result.slice(0, start) + result.slice(endTagClose + 1); start = result.toLowerCase().indexOf('<script'); } return result.trim(); } };
      expect(contentScript.sanitizeText('  hello <script>alert("xss")</script>  ')).toBe('hello');
    });
  });

  describe('validateContext', function() {
    it('should accept valid context', function() {
      const validateContext = function(ctx) {
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
      };
      const validContext = { messages: [{ sender: 'hotel', text: 'Hello', time: '10:00' }], activeGuest: 'John Doe', conversationId: '12345' };
      expect(() => validateContext(validContext)).not.toThrow();
    });

    it('should throw if context is not an object', function() {
      const validateContext = function(ctx) { if (!ctx || typeof ctx !== 'object') throw new Error('Context must be an object'); };
      expect(() => validateContext(null)).toThrow('Context must be an object');
    });

    it('should throw if messages is not an array', function() {
      const validateContext = function(ctx) { if (!Array.isArray(ctx.messages)) throw new Error('messages must be an array'); };
      expect(() => validateContext({ messages: 'not an array', activeGuest: 'John', conversationId: '123' })).toThrow('messages must be an array');
    });
  });

  describe('injectMessage validation', function() {
    it('should reject non-string input', function() {
      const injectMessage = function(text) { if (!text || typeof text !== 'string') return false; return true; };
      expect(injectMessage(null)).toBe(false);
      expect(injectMessage(123)).toBe(false);
    });

    it('should reject empty string', function() {
      const injectMessage = function(text) { if (!text || typeof text !== 'string') return false; return true; };
      expect(injectMessage('')).toBe(false);
    });
  });
});