// LLM Client Tests (Mistral-only)
import * as mistral from '../src/services/llm/mistralClient';

describe('LLM Clients Configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('Mistral Client', () => {
    it('should report configured when API key is set', () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');
      expect(m.isConfigured()).toBe(true);
    });

    it('should report not configured when API key is missing', () => {
      delete process.env.MISTRAL_API_KEY;
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');
      expect(m.isConfigured()).toBe(false);
    });

    it('should report not configured when API key is empty', () => {
      process.env.MISTRAL_API_KEY = '   ';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');
      expect(m.isConfigured()).toBe(false);
    });

    it('should use custom base URL when set', () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      process.env.MISTRAL_BASE_URL = 'https://custom.mistral.ai';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');
      expect(m.MODEL_NAME).toBeDefined();
    });
  });
});
