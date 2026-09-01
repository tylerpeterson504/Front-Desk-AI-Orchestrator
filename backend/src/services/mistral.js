// Mistral AI chat completions client.
// Uses the OpenAI-compatible endpoint at api.mistral.ai — no SDK dependency needed.

const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_NAME = process.env.MISTRAL_MODEL || 'mistral-small-latest';
const BASE_URL = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai';

function isConfigured() {
  return Boolean(String(process.env.MISTRAL_API_KEY || '').trim());
}

async function complete(messages, options = {}) {
  if (!isConfigured()) {
    const error = new Error('Mistral is not configured');
    error.code = 'MISTRAL_NOT_CONFIGURED';
    throw error;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    const error = new Error('Messages are required');
    error.code = 'INVALID_MESSAGES';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
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
      const error = new Error(`Mistral request failed with status ${response.status}`);
      error.code = 'MISTRAL_REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) {
      throw new Error('Empty Mistral response');
    }
    return { text: String(text).trim(), model: payload.model || options.model || MODEL_NAME };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { complete, isConfigured, MODEL_NAME };
