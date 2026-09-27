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

    it('should reject chat completions when not configured', async () => {
      delete process.env.MISTRAL_API_KEY;
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');

      await expect(m.complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
        code: 'MISTRAL_NOT_CONFIGURED'
      });
    });

    it('should reject chat completions with no messages', async () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');

      await expect(m.complete([])).rejects.toMatchObject({
        code: 'INVALID_MESSAGES'
      });
    });

    it('should call the Mistral chat completions API and return trimmed text', async () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      delete process.env.MISTRAL_BASE_URL;
      delete process.env.MISTRAL_MODEL;
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: 'mistral-medium-3-5',
          choices: [{ message: { content: '  Hello there  ' } }]
        })
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await m.complete([
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'say hi' }
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer test-key' });
      expect(JSON.parse(String(init.body))).toMatchObject({
        model: 'mistral-medium-3-5',
        messages: [
          { role: 'system', content: 'be brief' },
          { role: 'user', content: 'say hi' }
        ]
      });
      expect(result).toEqual({ text: 'Hello there', model: 'mistral-medium-3-5' });
    });

    it('should surface non-OK API responses as request failures', async () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429
      }) as unknown as typeof fetch;

      await expect(m.complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
        code: 'MISTRAL_REQUEST_FAILED',
        status: 429
      });
    });

    it('should reject empty completions', async () => {
      process.env.MISTRAL_API_KEY = 'test-key';
      jest.resetModules();
      const m = require('../src/services/llm/mistralClient');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '   ' } }] })
      }) as unknown as typeof fetch;

      await expect(m.complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(
        'Empty Mistral response'
      );
    });
  });
});
