// Mistral AI chat completions client.
// Uses the OpenAI-compatible endpoint at api.mistral.ai - no SDK dependency needed.

import { MistralError } from '../../lib/errors';

const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_NAME = process.env.MISTRAL_MODEL || 'mistral-medium';
const BASE_URL = process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai';

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMResult {
  text: string;
  model: string;
}

export function isConfigured(): boolean {
  return Boolean(String(process.env.MISTRAL_API_KEY || '').trim());
}

export async function complete(messages: Array<{ role: string; content: string }>, options: LLMOptions = {}): Promise<LLMResult> {
  if (!isConfigured()) {
    throw new MistralError('Mistral is not configured', 'MISTRAL_NOT_CONFIGURED');
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new MistralError('Messages are required', 'INVALID_MESSAGES');
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
      throw new MistralError(
        `Mistral request failed with status ${response.status}`,
        'MISTRAL_REQUEST_FAILED',
        response.status
      );
    }
    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) {
      throw new Error('Empty Mistral response');
    }
    return { text: String(text).trim(), model: payload.model || options.model || MODEL_NAME };
  } finally {
    clearTimeout(timeout);
  }
}

export { MODEL_NAME };
