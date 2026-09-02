const huggingface = require('../src/services/huggingface');

describe('Hugging Face Inference client', () => {
  const originalKey = process.env.HUGGINGFACE_TOKEN;
  const originalBase = process.env.HUGGINGFACE_BASE_URL;
  const originalModel = process.env.HUGGINGFACE_MODEL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalKey === undefined) delete process.env.HUGGINGFACE_TOKEN;
    else process.env.HUGGINGFACE_TOKEN = originalKey;
    if (originalBase === undefined) delete process.env.HUGGINGFACE_BASE_URL;
    else process.env.HUGGINGFACE_BASE_URL = originalBase;
    if (originalModel === undefined) delete process.env.HUGGINGFACE_MODEL;
    else process.env.HUGGINGFACE_MODEL = originalModel;
    jest.resetModules();
  });

  test('reports configuration status without leaking the token', () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    const client = require('../src/services/huggingface');
    expect(client.isConfigured()).toBe(true);
    expect(JSON.stringify({ configured: client.isConfigured(), model: client.MODEL_NAME })).not.toContain('test-hf-token');
  });

  test('defaults to Qwen/Qwen3-32B', () => {
    delete process.env.HUGGINGFACE_MODEL;
    const client = require('../src/services/huggingface');
    expect(client.MODEL_NAME).toBe('Qwen/Qwen3-32B');
  });

  test('returns validated chat completion text', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ model: 'Qwen/Qwen3-32B', choices: [{ message: { content: '  Welcome to the hotel.  ' } }] })
    });
    const client = require('../src/services/huggingface');
    const result = await client.complete([{ role: 'user', content: 'Welcome message' }]);

    expect(result).toEqual({ text: 'Welcome to the hotel.', model: 'Qwen/Qwen3-32B' });
    expect(fetch).toHaveBeenCalledWith(
      'https://router.huggingface.co/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-hf-token' })
      })
    );
  });

  test('rejects an empty completion', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) });
    const client = require('../src/services/huggingface');
    await expect(client.complete([{ role: 'user', content: 'Hi' }])).rejects.toThrow('Empty Hugging Face response');
  });

  test('surfaces HTTP errors with status', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    const client = require('../src/services/huggingface');
    await expect(client.complete([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({
      code: 'HUGGINGFACE_REQUEST_FAILED',
      status: 503
    });
  });

  test('returns a controlled error when not configured', async () => {
    delete process.env.HUGGINGFACE_TOKEN;
    const client = require('../src/services/huggingface');
    await expect(client.complete([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({ code: 'HUGGINGFACE_NOT_CONFIGURED' });
  });

  test('rejects empty message lists', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    const client = require('../src/services/huggingface');
    await expect(client.complete([])).rejects.toMatchObject({ code: 'INVALID_MESSAGES' });
  });

  test('disables Qwen3 thinking mode by default', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ model: 'Qwen/Qwen3-32B', choices: [{ message: { content: 'Hi there' } }] })
    });
    const client = require('../src/services/huggingface');
    await client.complete([{ role: 'user', content: 'Hi' }]);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    // vLLM stacks ignore chat_template_kwargs — the /no_think soft switch must
    // be injected as a system message.
    expect(body.messages[0]).toEqual({ role: 'system', content: '/no_think' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  test('appends /no_think to an existing system message instead of adding one', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ model: 'Qwen/Qwen3-32B', choices: [{ message: { content: 'Hi there' } }] })
    });
    const client = require('../src/services/huggingface');
    await client.complete([
      { role: 'system', content: 'You are a hotel front-desk assistant.' },
      { role: 'user', content: 'Hi' }
    ]);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('hotel front-desk assistant');
    expect(body.messages[0].content).toContain('/no_think');
    expect(body.messages).toHaveLength(2);
  });

  test('allows opting back into thinking mode', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ model: 'Qwen/Qwen3-32B', choices: [{ message: { content: 'Hi there' } }] })
    });
    const client = require('../src/services/huggingface');
    await client.complete([{ role: 'user', content: 'Hi' }], { enableThinking: true });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true });
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Hi' });
  });

  test('falls back to reasoning_content when content is null (thinking channel)', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'Qwen/Qwen3-32B',
        choices: [{ message: { content: null, reasoning_content: 'The guest asked for a welcome.\n\nWelcome!' } }]
      })
    });
    const client = require('../src/services/huggingface');
    const result = await client.complete([{ role: 'user', content: 'Hi' }]);
    expect(result.text).toBe('The guest asked for a welcome.\n\nWelcome!');
  });

  test('strips residual <think> blocks from content', async () => {
    process.env.HUGGINGFACE_TOKEN = 'test-hf-token';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: 'Qwen/Qwen3-32B',
        choices: [{ message: { content: '<think>Let me draft this.</think>\n\nWelcome to the hotel!' } }]
      })
    });
    const client = require('../src/services/huggingface');
    const result = await client.complete([{ role: 'user', content: 'Hi' }]);
    expect(result.text).toBe('Welcome to the hotel!');
  });
});
