// Perplexity AI chat completions client.
// Uses the OpenAI-compatible endpoint at api.perplexity.ai - no SDK dependency needed.

const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_NAME = process.env.PERPLEXITY_MODEL || 'sonar';

export interface LLMResult {
  text: string;
  model: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export function isConfigured(): boolean {
  return Boolean(String(process.env.PERPLEXITY_API_KEY || '').trim());
}

export async function complete(messages: Array<{ role: string; content: string }>, options: LLMOptions = {}): Promise<LLMResult> {
  if (!isConfigured()) {
    const error = new Error('Perplexity is not configured');
    error.code = 'PERPLEXITY_NOT_CONFIGURED';
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
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
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
      const error = new Error(`Perplexity request failed with status ${response.status}`);
      (error as any).code = 'PERPLEXITY_REQUEST_FAILED';
      (error as any).status = response.status;
      throw error;
    }
    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) {
      throw new Error('Empty Perplexity response');
    }
    return { text: String(text).trim(), model: payload.model || options.model || MODEL_NAME };
  } finally {
    clearTimeout(timeout);
  }
}

export { MODEL_NAME };
