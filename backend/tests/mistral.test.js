describe('Mistral AI client', () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  const originalBase = process.env.MISTRAL_BASE_URL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.MISTRAL_API_KEY;
    else process.env.MISTRAL_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.MISTRAL_BASE_URL;
    else process.env.MISTRAL_BASE_URL = originalBase;
    jest.resetModules();
  });

  test('reports configuration status', () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    const client = require('../src/services/mistral');
    expect(client.isConfigured()).toBe(true);
    expect(JSON.stringify({ configured: client.isConfigured() })).not.toContain('test-mistral-key');
  });

  test('returns validated chat completion text', async () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ model: 'mistral-small-latest', choices: [{ message: { content: '  Welcome to the hotel.  ' } }] })
    });
    const client = require('../src/services/mistral');
    const result = await client.complete([{ role: 'user', content: 'Welcome message' }]);

    expect(result).toEqual({ text: 'Welcome to the hotel.', model: 'mistral-small-latest' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-mistral-key' })
      })
    );
  });

  test('rejects an empty completion', async () => {
    process.env.MISTRAL_API_KEY = 'test-mistral-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    const client = require('../src/services/mistral');
    await expect(client.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Empty Mistral response');
  });

  test('returns a controlled error when not configured', async () => {
    delete process.env.MISTRAL_API_KEY;
    const client = require('../src/services/mistral');
    await expect(client.complete([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({ code: 'MISTRAL_NOT_CONFIGURED' });
  });
});
