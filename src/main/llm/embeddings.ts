import { getConfigStore, type EmbeddingsProviderConfig } from '../config/store'
import { createClient } from './providers'
import { formatApiError } from './format-error'

const VOYAGE_TYPES = new Set(['voyage', 'voyage-mongo'])

/**
 * Build the dimensions body fragment. Voyage uses `output_dimension`;
 * OpenAI-compatible providers use `dimensions`.
 */
function dimensionsBody(
  provider: EmbeddingsProviderConfig,
  dimensions?: number
): Record<string, unknown> {
  if (dimensions == null || dimensions <= 0) return {}
  if (VOYAGE_TYPES.has(provider.type)) return { output_dimension: dimensions }
  return { dimensions }
}

async function embedSingleText(
  provider: EmbeddingsProviderConfig,
  modelId: string,
  text: string,
  dimensions?: number
): Promise<{ embedding: number[]; usage?: { totalTokens: number } }> {
  const client = createClient(provider)
  const body = { model: modelId, input: text, ...dimensionsBody(provider, dimensions) }
  const response = await client.embeddings.create(body as Parameters<typeof client.embeddings.create>[0])

  const embedding = response.data[0]?.embedding ?? []
  const totalTokens = response.usage?.total_tokens ?? 0
  return { embedding, usage: { totalTokens } }
}

export async function generateEmbedding(
  providerId: string,
  modelId: string,
  text: string,
  dimensions?: number
): Promise<{ embedding: number[]; usage?: { totalTokens: number } }> {
  const store = getConfigStore()
  const providers = store.get('embeddingsProviders')
  const provider = providers.find((p) => p.id === providerId)
  if (!provider) throw new Error(`Embeddings provider not found: ${providerId}`)

  return embedSingleText(provider, modelId, text, dimensions)
}

export async function generateEmbeddings(
  providerId: string,
  modelId: string,
  texts: string[],
  dimensions?: number
): Promise<{ embeddings: number[][]; usage?: { totalTokens: number } }> {
  const store = getConfigStore()
  const providers = store.get('embeddingsProviders')
  const provider = providers.find((p) => p.id === providerId)
  if (!provider) throw new Error(`Embeddings provider not found: ${providerId}`)

  const client = createClient(provider)
  const body = { model: modelId, input: texts, ...dimensionsBody(provider, dimensions) }
  const response = await client.embeddings.create(body as Parameters<typeof client.embeddings.create>[0])

  const embeddings = response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
  const totalTokens = response.usage?.total_tokens ?? 0
  return { embeddings, usage: { totalTokens } }
}

const TEST_EMBED_TEXT = 'embedding endpoint check'

export type EmbeddingsTestPayload =
  | { providerId: string; modelId?: string }
  | { provider: EmbeddingsProviderConfig; modelId?: string }

export type EmbeddingsTestResult =
  | { ok: true; modelId: string; dimensions: number; totalTokens?: number }
  | { ok: false; error: string }

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

    const { embedding, usage } = await embedSingleText(provider, modelId.trim(), TEST_EMBED_TEXT)
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
    return { ok: false, error: formatApiError(err) }
  }
}
