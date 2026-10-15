/**
 * LLM Provider Factory
 * Creates and manages LLM client instances with fallback support
 */

import {
  LLMClient,
  LLMProvider,
  LLMProviderFactory,
  LLMOptions,
  LLMResult,
  LLMMessage,
  PROVIDER_CONFIGS,
  LLMConfigurationError
} from './types';
import { MistralClient, mistralClient } from './mistralClient';

/**
 * Lazy-loaded clients (singleton pattern)
 */
const clients: Map<LLMProvider, LLMClient> = new Map();

/**
 * Default provider priority order
 */
const DEFAULT_PROVIDER_ORDER: LLMProvider[] = [
  'mistral',
  'openai',
  'anthropic',
  'google',
  'local'
];

/**
 * Get a client for a specific provider
 * Creates the client lazily on first access
 */
function createClient(provider: LLMProvider): LLMClient {
  switch (provider) {
    case 'mistral':
      return new MistralClient();
    // case 'openai':
    //   return new OpenAIClient();
    // case 'anthropic':
    //   return new AnthropicClient();
    // case 'google':
    //   return new GoogleClient();
    // case 'local':
    //   return new LocalClient();
    default:
      // For now, only Mistral is implemented
      // Other providers will throw configuration errors
      return new MistralClient();
  }
}

/**
 * Get a client instance for a specific provider
 */
export function getClient(provider: LLMProvider): LLMClient {
  if (!clients.has(provider)) {
    clients.set(provider, createClient(provider));
  }
  return clients.get(provider)!;
}

/**
 * Get the default client based on what's configured
 * Uses the first configured provider in the priority order
 */
export function getDefaultClient(): LLMClient {
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    const client = getClient(provider);
    if (client.isConfigured()) {
      return client;
    }
  }
  // Fallback to Mistral (will throw configuration error)
  return getClient('mistral');
}

/**
 * Get all configured providers
 */
export function getConfiguredProviders(): LLMProvider[] {
  const configured: LLMProvider[] = [];
  
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    const client = getClient(provider);
    if (client.isConfigured()) {
      configured.push(provider);
    }
  }
  
  return configured;
}

/**
 * Check if any provider is configured
 */
export function hasAnyConfigured(): boolean {
  return getConfiguredProviders().length > 0;
}

/**
 * Get a client with automatic fallback to next configured provider
 */
export function getClientWithFallback(
  providers: LLMProvider[] = DEFAULT_PROVIDER_ORDER
): LLMClient {
  const configuredProviders: LLMProvider[] = [];
  const seen = new Set<LLMProvider>();
  for (const provider of providers) {
    const client = getClient(provider);
    if (!client.isConfigured() || seen.has(client.provider)) continue;
    seen.add(client.provider);
    configuredProviders.push(provider);
  }
  
  if (configuredProviders.length === 0) {
    throw new LLMConfigurationError('mistral', 'No LLM providers configured');
  }
  
  // Return a wrapper that tries each provider in order
  return new FallbackLLMClient(configuredProviders);
}

/**
 * Server errors and timeouts get one more attempt on the same provider; client errors do not
 */
function isTransient(error: unknown): boolean {
  const { statusCode, status, name, message } = (error ?? {}) as {
    statusCode?: number;
    status?: number;
    name?: string;
    message?: string;
  };
  const httpStatus = statusCode ?? status;
  if (typeof httpStatus === 'number') return httpStatus >= 500;
  return name === 'AbortError' || /timeout/i.test(message ?? '');
}

/**
 * Fallback LLM Client that tries multiple providers
 */
class FallbackLLMClient implements LLMClient {
  readonly provider: LLMProvider;
  private providers: LLMProvider[];
  private clients: LLMClient[];

  constructor(providers: LLMProvider[]) {
    this.providers = providers;
    this.provider = providers[0] ?? 'mistral';
    this.clients = providers.map(p => getClient(p));
  }

  isConfigured(): boolean {
    return this.clients.some(c => c.isConfigured());
  }

  getConfig() {
    // Return config of first provider
    return this.clients[0].getConfig();
  }

  private async attemptWithRetry<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!isTransient(error)) throw error;
      return call();
    }
  }

  async complete(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResult> {
    let lastError: Error | undefined;
    
    for (const client of this.clients) {
      try {
        return await this.attemptWithRetry(() => client.complete(messages, options));
      } catch (error) {
        lastError = error as Error;
        // Continue to next provider
      }
    }
    
    // All providers failed
    throw lastError || new LLMConfigurationError(this.provider, 'All LLM providers failed');
  }

  async completeText(prompt: string, options?: LLMOptions): Promise<LLMResult> {
    let lastError: Error | undefined;
    
    for (const client of this.clients) {
      try {
        return await this.attemptWithRetry(() => client.completeText(prompt, options));
      } catch (error) {
        lastError = error as Error;
      }
    }
    
    throw lastError || new LLMConfigurationError(this.provider, 'All LLM providers failed');
  }

  async listModels(): Promise<string[]> {
    const allModels: string[] = [];
    
    for (const client of this.clients) {
      try {
        const models = await client.listModels();
        allModels.push(...models);
      } catch {
        // Skip failed providers
      }
    }
    
    return allModels;
  }
}

/**
 * Provider Factory Implementation
 */
export const llmProviderFactory: LLMProviderFactory = {
  getClient,
  getDefaultClient,
  getConfiguredProviders,
  hasAnyConfigured,
  getClientWithFallback
};

// Re-export Mistral client for backwards compatibility
export { MistralClient, mistralClient } from './mistralClient';
export { PROVIDER_CONFIGS } from './types';
export type { LLMMessage, LLMResult, LLMOptions, LLMProvider } from './types';

export default llmProviderFactory;
