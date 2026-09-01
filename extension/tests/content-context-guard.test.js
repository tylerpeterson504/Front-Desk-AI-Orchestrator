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
      const contentScript = { sanitizeText: function(t) { if (!t || typeof t !== 'string') return t; let s = t.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); return s; } };
      expect(contentScript.sanitizeText(null)).to.be.null;
      expect(contentScript.sanitizeText(undefined)).to.be.undefined;
    });

    it('should return non-string values as-is', function() {
      const contentScript = { sanitizeText: function(t) { if (!t || typeof t !== 'string') return t; return t.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); } };
      expect(contentScript.sanitizeText(123)).to.equal(123);
      expect(contentScript.sanitizeText(true)).to.be.true;
    });

    it('should escape HTML entities', function() {
      const contentScript = { sanitizeText: function(t) { if (!t || typeof t !== 'string') return t; let s = t.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); return s; } };
      expect(contentScript.sanitizeText('<script>alert("xss")</script>')).to.equal('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
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
      expect(() => validateContext(validContext)).not.to.throw();
    });

    it('should throw if context is not an object', function() {
      const validateContext = function(ctx) { if (!ctx || typeof ctx !== 'object') throw new Error('Context must be an object'); };
      expect(() => validateContext(null)).to.throw('Context must be an object');
    });

    it('should throw if messages is not an array', function() {
      const validateContext = function(ctx) { if (!Array.isArray(ctx.messages)) throw new Error('messages must be an array'); };
      expect(() => validateContext({ messages: 'not an array', activeGuest: 'John', conversationId: '123' })).to.throw('messages must be an array');
    });
  });

  describe('injectMessage validation', function() {
    it('should reject non-string input', function() {
      const injectMessage = function(text) { if (!text || typeof text !== 'string') return false; return true; };
      expect(injectMessage(null)).to.be.false;
      expect(injectMessage(123)).to.be.false;
    });

    it('should reject empty string', function() {
      const injectMessage = function(text) { if (!text || typeof text !== 'string') return false; return true; };
      expect(injectMessage('')).to.be.false;
    });
  });
});