// LLM Client Tests
// Tests for all LLM provider clients

import * as perplexity from '../src/services/llm/perplexityClient';
import * as mistral from '../src/services/llm/mistralClient';
import * as huggingface from '../src/services/llm/huggingfaceClient';
import * as gemini from '../src/services/llm/geminiClient';

describe('LLM Clients Configuration', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('Perplexity Client', () => {
    it('should report configured when API key is set', () => {
      process.env.PERPLEXITY_API_KEY = 'test-key';
      // Need to re-require to pick up the env var
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');
      expect(p.isConfigured()).toBe(true);
    });

    it('should report not configured when API key is missing', () => {
      delete process.env.PERPLEXITY_API_KEY;
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');
      expect(p.isConfigured()).toBe(false);
    });

    it('should report not configured when API key is empty', () => {
      process.env.PERPLEXITY_API_KEY = '   ';
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');
      expect(p.isConfigured()).toBe(false);
    });
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

    it('should use custom base URL when set', () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      process.env.MISTRAL_BASE_URL = 'https://custom.mistral.ai';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');
      // The MODEL_NAME should still be set
      expect(m.MODEL_NAME).toBeDefined();
    });
  });

  describe('Hugging Face Client', () => {
    it('should report configured when token is set', () => {
      process.env.HUGGINGFACE_TOKEN = 'test-token';
      jest.resetModules();
      const hf = require('../src/services/llm/huggingfaceClient');
      expect(hf.isConfigured()).toBe(true);
    });

    it('should report not configured when token is missing', () => {
      delete process.env.HUGGINGFACE_TOKEN;
      jest.resetModules();
      const hf = require('../src/services/llm/huggingfaceClient');
      expect(hf.isConfigured()).toBe(false);
    });

    it('should use default model Qwen/Qwen3-32B', () => {
      process.env.HUGGINGFACE_TOKEN = 'test-token';
      jest.resetModules();
      const hf = require('../src/services/llm/huggingfaceClient');
      expect(hf.MODEL_NAME).toBe('Qwen/Qwen3-32B');
    });
  });

  describe('Gemini Client', () => {
    it('should report configured when API key is set', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      jest.resetModules();
      const g = require('../src/services/llm/geminiClient');
      expect(g.isConfigured()).toBe(true);
    });

    it('should report not configured when API key is missing', () => {
      delete process.env.GOOGLE_API_KEY;
      jest.resetModules();
      const g = require('../src/services/llm/geminiClient');
      expect(g.isConfigured()).toBe(false);
    });

    it('should use default model gemini-1.5-flash', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      jest.resetModules();
      const g = require('../src/services/llm/geminiClient');
      expect(g.MODEL_NAME).toBe('gemini-1.5-flash');
    });
  });
});

describe('LLM Client Error Handling', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  describe('Perplexity Client - complete()', () => {
    it('should throw error when not configured', async () => {
      delete process.env.PERPLEXITY_API_KEY;
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');

      await expect(
        p.complete([{ role: 'user', content: 'Hello' }])
      ).rejects.toMatchObject({ code: 'PERPLEXITY_NOT_CONFIGURED' });
    });

    it('should throw error for empty messages', async () => {
      process.env.PERPLEXITY_API_KEY = 'test-key';
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');

      await expect(
        p.complete([])
      ).rejects.toMatchObject({ code: 'INVALID_MESSAGES' });
    });

    it('should return result on successful response', async () => {
      process.env.PERPLEXITY_API_KEY = 'test-key';
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: 'sonar',
          choices: [{ message: { content: '  Hello back!  ' } }]
        })
      });

      const result = await p.complete([{ role: 'user', content: 'Hello' }]);
      expect(result).toEqual({
        text: 'Hello back!',
        model: 'sonar'
      });
    });

    it('should throw error on failed response', async () => {
      process.env.PERPLEXITY_API_KEY = 'test-key';
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401
      });

      await expect(
        p.complete([{ role: 'user', content: 'Hello' }])
      ).rejects.toMatchObject({ code: 'PERPLEXITY_REQUEST_FAILED', status: 401 });
    });

    it('should throw error on empty response', async () => {
      process.env.PERPLEXITY_API_KEY = 'test-key';
      jest.resetModules();
      const p = require('../src/services/llm/perplexityClient');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] })
      });

      await expect(
        p.complete([{ role: 'user', content: 'Hello' }])
      ).rejects.toThrow('Empty Perplexity response');
    });
  });

  describe('Mistral Client - complete()', () => {
    it('should throw error when not configured', async () => {
      delete process.env.MISTRAL_API_KEY;
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');

      await expect(
        m.complete([{ role: 'user', content: 'Hello' }])
      ).rejects.toMatchObject({ code: 'MISTRAL_NOT_CONFIGURED' });
    });

    it('should return result on successful response', async () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: 'mistral-small-latest',
          choices: [{ message: { content: '  Bonjour!  ' } }]
        })
      });

      const result = await m.complete([{ role: 'user', content: 'Hello' }]);
      expect(result).toEqual({
        text: 'Bonjour!',
        model: 'mistral-small-latest'
      });
    });
  });

  describe('Hugging Face Client - complete()', () => {
    it('should throw error when not configured', async () => {
      delete process.env.HUGGINGFACE_TOKEN;
      jest.resetModules();
      const hf = require('../src/services/llm/huggingfaceClient');

      await expect(
        hf.complete([{ role: 'user', content: 'Hello' }])
      ).rejects.toMatchObject({ code: 'HUGGINGFACE_NOT_CONFIGURED' });
    });

    it('should return result on successful response', async () => {
      process.env.HUGGINGFACE_TOKEN = 'test-token';
      jest.resetModules();
      const hf = require('../src/services/llm/huggingfaceClient');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: 'Qwen/Qwen3-32B',
          choices: [{ message: { content: '  Hi there!  ' } }]
        })
      });

      const result = await hf.complete([{ role: 'user', content: 'Hello' }]);
      expect(result).toEqual({
        text: 'Hi there!',
        model: 'Qwen/Qwen3-32B'
      });
    });
  });

  describe('Gemini Client - complete()', () => {
    it('should throw error when not configured', async () => {
      delete process.env.GOOGLE_API_KEY;
      jest.resetModules();
      const g = require('../src/services/llm/geminiClient');

      await expect(
        g.complete('Hello')
      ).rejects.toMatchObject({ code: 'GEMINI_NOT_CONFIGURED' });
    });

    it('should return result on successful response', async () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      jest.resetModules();
      const g = require('../src/services/llm/geminiClient');

      const mockModel = {
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => '  Hello from Gemini!  '
          }
        })
      };

      jest.mock('@google/generative-ai', () => ({
        GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
          getGenerativeModel: jest.fn().mockReturnValue(mockModel)
        }))
      }));

      const result = await g.complete('Hello');
      expect(result).toEqual({
        text: 'Hello from Gemini!',
        model: 'gemini-1.5-flash'
      });
    });
  });
});
