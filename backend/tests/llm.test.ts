// LLM Client Tests (Mistral-only)
import * as mistral from '../src/services/llm/mistralClient';
import { getClientWithFallback } from '../src/services/llm/providerFactory';
import { LLMRequestError } from '../src/services/llm/types';

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
      expect(m.mistralClient).toBeDefined();
      expect(m.mistralClient.isConfigured()).toBe(true);
    });
  });

  describe('Fallback chain', () => {
    const messages = [{ role: 'user' as const, content: 'Hello' }];
    const reply = { text: 'Hi there', model: 'mistral-small-latest', provider: 'mistral' as const };
    let complete: jest.SpyInstance;

    beforeEach(() => {
      process.env.MISTRAL_API_KEY = 'test-key';
      complete = jest.spyOn(mistral.MistralClient.prototype, 'complete');
    });

    it('calls a configured provider once when it fails', async () => {
      complete.mockRejectedValue(new Error('network down'));
      await expect(getClientWithFallback().complete(messages)).rejects.toThrow('network down');
      expect(complete).toHaveBeenCalledTimes(1);
    });

    it('does not retry a client error', async () => {
      complete.mockRejectedValue(new LLMRequestError('mistral', 'bad request', 400));
      await expect(getClientWithFallback().complete(messages)).rejects.toThrow('bad request');
      expect(complete).toHaveBeenCalledTimes(1);
    });

    it('retries a server error once and then succeeds', async () => {
      complete
        .mockRejectedValueOnce(new LLMRequestError('mistral', 'upstream error', 503))
        .mockResolvedValueOnce(reply);
      await expect(getClientWithFallback().complete(messages)).resolves.toEqual(reply);
      expect(complete).toHaveBeenCalledTimes(2);
    });

    it('gives up after one retry of a server error', async () => {
      complete.mockRejectedValue(new LLMRequestError('mistral', 'upstream error', 500));
      await expect(getClientWithFallback().complete(messages)).rejects.toThrow('upstream error');
      expect(complete).toHaveBeenCalledTimes(2);
    });

    it('retries a timeout once', async () => {
      const timeout = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      complete.mockRejectedValueOnce(timeout).mockResolvedValueOnce(reply);
      await expect(getClientWithFallback().complete(messages)).resolves.toEqual(reply);
      expect(complete).toHaveBeenCalledTimes(2);
    });

    it('throws when no provider is configured', () => {
      delete process.env.MISTRAL_API_KEY;
      expect(() => getClientWithFallback()).toThrow('No LLM providers configured');
    });
  });
});
