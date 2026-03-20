import { embed, embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { getConfigStore, type EmbeddingsProviderConfig } from '../config/store'
import { formatAiSdkApiError } from './format-ai-sdk-error'
import { voyageEmbed } from './voyage-adapter'

async function embedSingleText(
  provider: EmbeddingsProviderConfig,
  modelId: string,
  text: string,
  options?: { maxRetries?: number }
): Promise<{ embedding: number[]; usage?: { totalTokens: number } }> {
  if (provider.type === 'voyage') {
    const result = await voyageEmbed(provider.baseUrl, provider.apiKey, modelId, text)
    return { embedding: result.embeddings[0], usage: result.usage }
  }

  const openai = createOpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
    compatibility: 'compatible'
  })

  const { embedding, usage } = await embed({
    model: openai.textEmbeddingModel(modelId),
    value: text,
    maxRetries: options?.maxRetries ?? 2
  })

  return { embedding, usage: { totalTokens: usage?.tokens ?? 0 } }
}

export async function generateEmbedding(
  providerId: string,
  modelId: string,
  text: string
): Promise<{ embedding: number[]; usage?: { totalTokens: number } }> {
  const store = getConfigStore()
  const providers = store.get('embeddingsProviders')
  const provider = providers.find((p) => p.id === providerId)
  if (!provider) throw new Error(`Embeddings provider not found: ${providerId}`)

  return embedSingleText(provider, modelId, text)
}

export async function generateEmbeddings(
  providerId: string,
  modelId: string,
  texts: string[]
): Promise<{ embeddings: number[][]; usage?: { totalTokens: number } }> {
  const store = getConfigStore()
  const providers = store.get('embeddingsProviders')
  const provider = providers.find((p) => p.id === providerId)
  if (!provider) throw new Error(`Embeddings provider not found: ${providerId}`)

  if (provider.type === 'voyage') {
    return voyageEmbed(provider.baseUrl, provider.apiKey, modelId, texts)
  }

  const openai = createOpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
    compatibility: 'compatible'
  })

  const { embeddings, usage } = await embedMany({
    model: openai.textEmbeddingModel(modelId),
    values: texts
  })

  return { embeddings, usage: { totalTokens: usage?.tokens ?? 0 } }
}

const TEST_EMBED_TEXT = 'embedding endpoint check'

export type EmbeddingsTestPayload =
  | { providerId: string; modelId?: string }
  | { provider: EmbeddingsProviderConfig; modelId?: string }

export type EmbeddingsTestResult =
  | { ok: true; modelId: string; dimensions: number; totalTokens?: number }
  | { ok: false; error: string }

/** Single embedding request to verify URL, API key, and model ID. */
export async function testEmbeddingsConnection(
  payload: EmbeddingsTestPayload
): Promise<EmbeddingsTestResult> {
  try {
    let provider: EmbeddingsProviderConfig
    if ('provider' in payload) {
      provider = payload.provider
    } else {
      const store = getConfigStore()
      const p = store.get('embeddingsProviders').find((x) => x.id === payload.providerId)
      if (!p) {
        return { ok: false, error: `Embeddings provider not found: ${payload.providerId}` }
      }
      provider = p
    }

    const modelId = payload.modelId ?? provider.models[0]
    if (!modelId?.trim()) {
      return {
        ok: false,
        error:
          'No model to test. Add at least one embedding model ID (comma-separated) first.'
      }
    }

    const { embedding, usage } = await embedSingleText(
      provider,
      modelId.trim(),
      TEST_EMBED_TEXT,
      { maxRetries: 0 }
    )
    const dimensions = embedding.length
    if (dimensions === 0) {
      return { ok: false, error: 'API returned an empty embedding vector.' }
    }

    return {
      ok: true,
      modelId: modelId.trim(),
      dimensions,
      totalTokens: usage?.totalTokens
    }
  } catch (err) {
    return { ok: false, error: formatAiSdkApiError(err) }
  }
}
