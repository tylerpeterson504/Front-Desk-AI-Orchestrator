const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = 'https://ai-gateway.neon.tech/v1';
const MODEL_NAME = process.env.OPENAI_MODEL || 'openai/gpt-4o-mini';

function isConfigured() {
  return Boolean(String(process.env.OPENAI_API_KEY || '').trim());
}

async function complete(messages, options = {}) {
  if (!isConfigured()) {
    const error = new Error('OpenAI-compatible AI Gateway is not configured');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    const error = new Error('Messages are required');
    error.code = 'INVALID_MESSAGES';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const baseUrl = String(process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || MODEL_NAME,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens || 500
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(`AI Gateway request failed with status ${response.status}`);
      error.code = 'OPENAI_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) throw new Error('Empty AI Gateway response');
    return { text: String(text).trim(), model: payload.model || options.model || MODEL_NAME };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { complete, isConfigured, MODEL_NAME };
