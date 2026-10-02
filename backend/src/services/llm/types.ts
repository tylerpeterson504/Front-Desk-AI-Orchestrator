/**
 * LLM Provider Types and Interfaces
 * Abstract interface for multiple LLM provider support
 */

/**
 * LLM Provider names
 */
export type LLMProvider = 'mistral' | 'openai' | 'anthropic' | 'google' | 'local';

/**
 * LLM Model configuration
 */
export interface LLMModelConfig {
  /** Provider name */
  provider: LLMProvider;
  /** Model ID/name */
  model: string;
  /** API base URL (optional, for custom endpoints) */
  baseUrl?: string;
  /** API key environment variable name */
  apiKeyEnvVar: string;
  /** Default temperature */
  defaultTemperature?: number;
  /** Default max tokens */
  defaultMaxTokens?: number;
  /** Default timeout in ms */
  defaultTimeoutMs?: number;
}

/**
 * LLM Options for completion requests
 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  provider?: LLMProvider;
}

/**
 * LLM Result from completion
 */
export interface LLMResult {
  text: string;
  model: string;
  provider: LLMProvider;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Message for chat completion
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Abstract LLM Client Interface
 * All LLM providers must implement this interface
 */
export interface LLMClient {
  /**
   * Provider name
   */
  readonly provider: LLMProvider;

  /**
   * Check if the provider is configured (has API key)
   */
  isConfigured(): boolean;

  /**
   * Generate a completion using the messages API
   */
  complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResult>;

  /**
   * Generate a completion using the text API (legacy)
   */
  completeText(prompt: string, options?: LLMOptions): Promise<LLMResult>;

  /**
   * Get the list of available models
   */
  listModels(): Promise<string[]>;

  /**
   * Get provider-specific configuration
   */
  getConfig(): LLMModelConfig;
}

/**
 * LLM Provider Factory
 * Creates and manages LLM client instances
 */
export interface LLMProviderFactory {
  /**
   * Get a client for a specific provider
   */
  getClient(provider: LLMProvider): LLMClient;

  /**
   * Get the default client (based on configuration)
   */
  getDefaultClient(): LLMClient;

  /**
   * Get all configured providers
   */
  getConfiguredProviders(): LLMProvider[];

  /**
   * Check if any provider is configured
   */
  hasAnyConfigured(): boolean;

  /**
   * Get client with fallback chain
   */
  getClientWithFallback(providers?: LLMProvider[]): LLMClient;
}

/**
 * LLM Error types
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider?: LLMProvider,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMConfigurationError extends LLMError {
  constructor(provider: LLMProvider, message: string = 'Provider not configured') {
    super(message, 'LLM_NOT_CONFIGURED', provider);
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(provider: LLMProvider, message: string = 'Rate limit exceeded') {
    super(message, 'LLM_RATE_LIMIT', provider, 429);
  }
}

export class LLMRequestError extends LLMError {
  constructor(
    provider: LLMProvider,
    message: string,
    statusCode: number
  ) {
    super(message, 'LLM_REQUEST_FAILED', provider, statusCode);
  }
}

/**
 * Provider configuration map
 */
export const PROVIDER_CONFIGS: Record<LLMProvider, LLMModelConfig> = {
  mistral: {
    provider: 'mistral',
    model: 'mistral-medium',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    defaultTemperature: 0.2,
    defaultMaxTokens: 500,
    defaultTimeoutMs: 30000
  },
  openai: {
    provider: 'openai',
    model: 'gpt-4',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultTemperature: 0.7,
    defaultMaxTokens: 1000,
    defaultTimeoutMs: 60000
  },
  anthropic: {
    provider: 'anthropic',
    model: 'claude-3-sonnet-20240229',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    defaultTemperature: 0.7,
    defaultMaxTokens: 1000,
    defaultTimeoutMs: 60000
  },
  google: {
    provider: 'google',
    model: 'gemini-1.5-flash',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    defaultTemperature: 0.2,
    defaultMaxTokens: 1000,
    defaultTimeoutMs: 60000
  },
  local: {
    provider: 'local',
    model: 'local',
    apiKeyEnvVar: '',
    defaultTemperature: 0.7,
    defaultMaxTokens: 500,
    defaultTimeoutMs: 30000
  }
};
