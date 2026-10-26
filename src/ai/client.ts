import { AIProviderError } from '../common/errors';
import { OpenRouterConfig, OpenRouterChatRequest, OpenRouterChatResponse } from './types';

export class OpenRouterClient {
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /**
   * Returns true if client has a non-placeholder API key configured
   */
  public isConfigured(): boolean {
    return Boolean(
      this.config.apiKey &&
      !this.config.apiKey.includes('placeholder') &&
      this.config.apiKey !== '****'
    );
  }

  /**
   * Send a chat completion request to OpenRouter with timeout and error handling
   */
  public async createChatCompletion(
    messages: OpenRouterChatRequest['messages'],
    options: { temperature?: number; max_tokens?: number; maxRetries?: number } = {}
  ): Promise<OpenRouterChatResponse> {
    const { temperature = 0.1, max_tokens = 500, maxRetries = 2 } = options;

    if (!this.config.apiKey || this.config.apiKey.includes('placeholder')) {
      throw new AIProviderError(
        'OpenRouter API key is not configured or is a placeholder. Live AI calls require a valid key.',
        { configured: false }
      );
    }

    const payload: OpenRouterChatRequest = {
      model: this.config.model,
      messages,
      temperature,
      max_tokens,
    };

    const endpoint = `${this.config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
            'HTTP-Referer': 'https://agentguard.security',
            'X-Title': 'AgentGuard Security Gateway',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new AIProviderError(
            `OpenRouter returned error HTTP ${response.status}: ${errorText}`,
            { status: response.status }
          );
        }

        const data = (await response.json()) as OpenRouterChatResponse;
        return data;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err instanceof Error && err.name === 'AbortError') {
          throw new AIProviderError(
            `OpenRouter request timed out after ${this.config.timeoutMs}ms`,
            { timeout: true }
          );
        }

        if (attempt > maxRetries) {
          break;
        }

        // Brief exponential backoff
        await new Promise((resolve) => setTimeout(resolve, attempt * 200));
      }
    }

    throw new AIProviderError(
      `OpenRouter request failed after ${maxRetries + 1} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
      { originalError: lastError }
    );
  }

  public getConfig(): Readonly<OpenRouterConfig> {
    return { ...this.config, apiKey: '****' };
  }
}
