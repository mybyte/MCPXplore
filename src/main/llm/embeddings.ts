import { embed, embedMany } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { getConfigStore, type EmbeddingsProviderConfig } from '../config/store'
import { voyageEmbed } from './voyage-adapter'

export async function generateEmbedding(
  providerId: string,
  modelId: string,
  text: string
): Promise<{ embedding: number[]; usage?: { totalTokens: number } }> {
  const store = getConfigStore()
  const providers = store.get('embeddingsProviders')
  const provider = providers.find((p) => p.id === providerId)
  if (!provider) throw new Error(`Embeddings provider not found: ${providerId}`)

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
    value: text
  })

  return { embedding, usage: { totalTokens: usage?.tokens ?? 0 } }
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
