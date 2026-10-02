// Mistral AI chat completions client.
// Uses the OpenAI-compatible endpoint at api.mistral.ai - no SDK dependency needed.
// Implements the LLMClient interface for multi-provider support.

import { MistralError } from '../../lib/errors';
import { BaseLLMClient } from './baseClient';
import {
  LLMOptions,
  LLMResult,
  LLMMessage,
  LLMProvider,
  PROVIDER_CONFIGS
} from './types';

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Mistral-specific LLM client
 */
export class MistralClient extends BaseLLMClient {
  readonly provider: LLMProvider = 'mistral';

  constructor() {
    super(PROVIDER_CONFIGS.mistral);
  }

  protected getDefaultBaseUrl(): string {
    return process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai';
  }

  async complete(messages: LLMMessage[], options: LLMOptions = {}): Promise<LLMResult> {
    this.validateConfigured();
    
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new MistralError('Messages are required', 'INVALID_MESSAGES');
    }

    const mergedOptions = this.getMergedOptions(options);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), mergedOptions.timeoutMs);
    
    try {
      const response = await fetch(`${this.buildUrl('/v1/chat/completions')}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: mergedOptions.model,
          messages,
          temperature: mergedOptions.temperature,
          max_tokens: mergedOptions.maxTokens
        }),
        signal: controller.signal
      });
      
      const payload = await this.handleResponse<{
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
      }>(response, '/v1/chat/completions');
      
      const text = payload?.choices?.[0]?.message?.content;
      if (!text || !String(text).trim()) {
        throw new Error('Empty Mistral response');
      }
      
      return {
        text: String(text).trim(),
        model: payload.model || mergedOptions.model,
        provider: this.provider
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async listModels(): Promise<string[]> {
    // Mistral doesn't have a standard models endpoint in their OpenAI-compatible API
    // Return the configured model for now
    return [this.config.model];
  }
}

// Singleton instance
const mistralClient = new MistralClient();

// Legacy exports for backwards compatibility
export function isConfigured(): boolean {
  return mistralClient.isConfigured();
}

export async function complete(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<{ text: string; model: string }> {
  const result = await mistralClient.complete(messages, options);
  return { text: result.text, model: result.model };
}

export { mistralClient };
