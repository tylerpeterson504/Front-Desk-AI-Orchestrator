// Mistral AI service for guest response drafting.
//
// Uses Mistral's API to generate hotel front-desk assistant responses.
// API keys are read server-side only and are never shipped to the extension or dashboard.

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MODEL = 'mistral-small-latest';

function isConfigured() {
  return Boolean(String(process.env.MISTRAL_API_KEY || '').trim());
}

function getModel() {
  return process.env.MISTRAL_MODEL || DEFAULT_MODEL;
}

async function complete(messages, options = {}) {
  if (!isConfigured()) {
    const error = new Error('Mistral AI is not configured');
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
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: getModel(),
        messages,
        temperature: options.temperature ?? 0.7,
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

    return { text: String(text).trim(), model: payload.model || getModel() };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { complete, isConfigured, getModel, DEFAULT_MODEL };
