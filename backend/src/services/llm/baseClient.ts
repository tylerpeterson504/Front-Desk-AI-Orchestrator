/**
 * Base LLM Client Implementation
 * Provides common functionality for all LLM providers
 */

import {
  LLMClient,
  LLMModelConfig,
  LLMOptions,
  LLMResult,
  LLMMessage,
  LLMProvider,
  LLMConfigurationError,
  LLMRateLimitError,
  LLMRequestError
} from './types';

/**
 * Base LLM Client with common functionality
 * Subclasses should implement provider-specific logic
 */
export abstract class BaseLLMClient implements LLMClient {
  abstract readonly provider: LLMProvider;
  protected config: LLMModelConfig;

  constructor(config: LLMModelConfig) {
    this.config = config;
  }

  /**
   * Check if the provider is configured
   */
  isConfigured(): boolean {
    const apiKey = process.env[this.config.apiKeyEnvVar];
    return Boolean(apiKey && String(apiKey).trim());
  }

  /**
   * Validate that the provider is configured
   */
  protected validateConfigured(): void {
    if (!this.isConfigured()) {
      throw new LLMConfigurationError(this.provider);
    }
  }

  /**
   * Get provider configuration
   */
  getConfig(): LLMModelConfig {
    return this.config;
  }

  /**
   * Build request URL
   */
  protected buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || this.getDefaultBaseUrl();
    return `${baseUrl}${endpoint}`;
  }

  /**
   * Get default base URL for the provider
   */
  protected abstract getDefaultBaseUrl(): string;

  /**
   * Get headers for the request
   */
  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKeyEnvVar && process.env[this.config.apiKeyEnvVar]) {
      // Most providers use Bearer token
      headers.Authorization = `Bearer ${process.env[this.config.apiKeyEnvVar]}`;
    }

    return headers;
  }

  /**
   * Get default options merged with provided options
   */
  protected getMergedOptions(options?: LLMOptions): Required<LLMOptions> {
    return {
      model: options?.model || this.config.model,
      temperature: options?.temperature ?? this.config.defaultTemperature ?? 0.7,
      maxTokens: options?.maxTokens ?? this.config.defaultMaxTokens ?? 500,
      timeoutMs: options?.timeoutMs ?? this.config.defaultTimeoutMs ?? 30000,
      provider: options?.provider || this.provider
    };
  }

  /**
   * Handle fetch response and errors
   */
  protected async handleResponse<T>(
    response: Response,
    endpoint: string
  ): Promise<T> {
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const message = errorBody || `Request failed with status ${response.status}`;
      throw new LLMRequestError(this.provider, message, response.status);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Create timeout promise
   */
  protected createTimeout(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Complete using messages API (must be implemented by subclasses)
   */
  abstract complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResult>;

  /**
   * Complete using text API (optional, fallback to messages API)
   */
  async completeText(prompt: string, options?: LLMOptions): Promise<LLMResult> {
    // Default implementation: convert text prompt to user message
    return this.complete([{ role: 'user', content: prompt }], options);
  }

  /**
   * List available models (must be implemented by subclasses)
   */
  abstract listModels(): Promise<string[]>;
}
