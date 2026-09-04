// Hugging Face Inference client.
// Uses the OpenAI-compatible chat completions endpoint at router.huggingface.co,
// so no SDK dependency is needed - same shape as the Mistral client.
//
// The default model is Qwen/Qwen3-32B, matching the public Space demo
// (hf-space/) so the dashboard copilot and the Space behave the same way.

const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_NAME = process.env.HUGGINGFACE_MODEL || 'Qwen/Qwen3-32B';
const BASE_URL = process.env.HUGGINGFACE_BASE_URL || 'https://router.huggingface.co';

import type { LLMResult, LLMOptions } from './perplexityClient';

export function isConfigured(): boolean {
  return Boolean(String(process.env.HUGGINGFACE_TOKEN || '').trim());
}

export async function complete(messages: Array<{ role: string; content: string }>, options: LLMOptions = {}): Promise<LLMResult> {
  if (!isConfigured()) {
    const error = new Error('Hugging Face is not configured');
    error.code = 'HUGGINGFACE_NOT_CONFIGURED';
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
        Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
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
      const error = new Error(`Hugging Face request failed with status ${response.status}`);
      (error as any).code = 'HUGGINGFACE_REQUEST_FAILED';
      (error as any).status = response.status;
      throw error;
    }
    const payload = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) {
      throw new Error('Empty Hugging Face response');
    }
    return { text: String(text).trim(), model: payload.model || options.model || MODEL_NAME };
  } finally {
    clearTimeout(timeout);
  }
}

export { MODEL_NAME };
