import OpenAI, { AzureOpenAI } from 'openai'
import type { LlmProviderConfig, EmbeddingsProviderConfig } from '../config/store'

export type ProviderType = LlmProviderConfig['type']

export function createClient(config: LlmProviderConfig | EmbeddingsProviderConfig): OpenAI {
  switch (config.type) {
    case 'openai':
      return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl || undefined })

    case 'azure':
      return new AzureOpenAI({
        apiKey: config.apiKey,
        endpoint: config.baseUrl,
        apiVersion: config.apiVersion || '2025-03-01-preview'
      })

    case 'fireworks':
      return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://api.fireworks.ai/inference/v1'
      })

    case 'openrouter':
      return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://mcpxplore.com',
          'X-Title': 'MCPXplore'
        }
      })

    case 'voyage':
      return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://api.voyageai.com/v1'
      })

    case 'voyage-mongo':
      return new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseUrl || 'https://ai.mongodb.com/v1'
      })

    default:
      throw new Error(`Unknown provider type: ${(config as LlmProviderConfig).type}`)
  }
}

/**
 * Provider-specific overrides merged into every chat completion request.
 * All four providers support `stream_options` for usage in the final chunk.
 */
export function chatRequestDefaults(
  config: LlmProviderConfig
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    stream_options: { include_usage: true }
  }

  if (config.type === 'azure') {
    // Azure may not support stream_options depending on API version; keep it
    // but the caller should tolerate its absence in the response.
  }

  return base
}

/**
 * Azure OpenAI newer models require `max_completion_tokens` instead of
 * `max_tokens`. Other providers (Fireworks, OpenRouter, etc.) still use
 * the original parameter name.
 */
export function maxTokensParam(
  config: LlmProviderConfig,
  n: number
): Record<string, unknown> {
  return config.type === 'azure'
    ? { max_completion_tokens: n }
    : { max_tokens: n }
}
