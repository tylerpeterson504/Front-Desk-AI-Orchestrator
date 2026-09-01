describe('OpenAI-compatible AI Gateway client', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalBase = process.env.OPENAI_BASE_URL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.OPENAI_BASE_URL;
    else process.env.OPENAI_BASE_URL = originalBase;
    jest.resetModules();
  });

  test('reports configuration without exposing the key', () => {
    process.env.OPENAI_API_KEY = 'test-gateway-key';
    const client = require('../src/services/openai');
    expect(client.isConfigured()).toBe(true);
    expect(JSON.stringify({ configured: client.isConfigured() })).not.toContain('test-gateway-key');
  });

  test('returns validated chat completion text', async () => {
    process.env.OPENAI_API_KEY = 'test-gateway-key';
    process.env.OPENAI_BASE_URL = 'https://gateway.example/v1';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ model: 'test-model', choices: [{ message: { content: '  Hello, guest.  ' } }] })
    });
    const client = require('../src/services/openai');
    const result = await client.complete([{ role: 'user', content: 'Say hello' }]);

    expect(result).toEqual({ text: 'Hello, guest.', model: 'test-model' });
    expect(fetch).toHaveBeenCalledWith(
      'https://gateway.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-gateway-key' })
      })
    );
  });

  test('rejects an empty completion', async () => {
    process.env.OPENAI_API_KEY = 'test-gateway-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    const client = require('../src/services/openai');
    await expect(client.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Empty AI Gateway response');
  });

  test('returns a controlled error when not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const client = require('../src/services/openai');
    await expect(client.complete([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({ code: 'OPENAI_NOT_CONFIGURED' });
  });
});
