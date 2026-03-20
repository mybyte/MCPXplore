import type { LlmProviderConfig, EmbeddingsProviderConfig } from '../config/store'
import { createClient } from './providers'

type AnyProviderConfig = LlmProviderConfig | EmbeddingsProviderConfig
type ProviderType = AnyProviderConfig['type']

export interface FetchModelsRequest {
  type: ProviderType
  baseUrl: string
  apiKey: string
  apiVersion?: string
}

/**
 * Fetch the list of available model IDs from a provider.
 * Each provider type uses a different strategy — see inline comments.
 */
export async function fetchAvailableModels(req: FetchModelsRequest): Promise<string[]> {
  switch (req.type) {
    case 'openai':
    case 'azure':
    case 'openrouter':
      return fetchViaOpenAISdk(req)

    case 'fireworks':
      return fetchFireworksModels(req)

    case 'voyage':
    case 'voyage-mongo':
      return fetchVoyageModelsFromError(req)

    default:
      throw new Error(`Unsupported provider type for model listing: ${req.type}`)
  }
}

/**
 * OpenAI, Azure, and OpenRouter all expose a standard /models endpoint
 * compatible with the OpenAI SDK's `client.models.list()`.
 */
async function fetchViaOpenAISdk(req: FetchModelsRequest): Promise<string[]> {
  const config = reqToConfig(req)
  const client = createClient(config)
  const ids: string[] = []
  for await (const model of client.models.list()) {
    ids.push(model.id)
  }
  ids.sort((a, b) => a.localeCompare(b))
  return ids
}

/**
 * Fireworks uses a custom REST endpoint outside the OpenAI-compat layer.
 * Paginate through all results (200 per page max).
 */
async function fetchFireworksModels(req: FetchModelsRequest): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined

  for (;;) {
    const url = new URL('https://api.fireworks.ai/v1/accounts/fireworks/models')
    url.searchParams.set('pageSize', '200')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${req.apiKey}` }
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Fireworks model list failed (${res.status}): ${body}`)
    }

    const data = (await res.json()) as {
      models?: Array<{ name?: string; displayName?: string }>
      nextPageToken?: string
    }

    for (const m of data.models ?? []) {
      if (m.name) ids.push(m.name)
    }

    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }

  ids.sort((a, b) => a.localeCompare(b))
  return ids
}

const VOYAGE_MODEL_REGEX = /Supported models are \[([^\]]+)\]/

/**
 * Voyage AI (both direct and MongoDB-hosted) don't expose a /models endpoint.
 * Sending a request with a bogus model ID returns a 400 whose `detail` field
 * enumerates all valid models.
 */
async function fetchVoyageModelsFromError(req: FetchModelsRequest): Promise<string[]> {
  const baseUrl =
    req.baseUrl ||
    (req.type === 'voyage' ? 'https://api.voyageai.com/v1' : 'https://ai.mongodb.com/v1')

  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey}`
    },
    body: JSON.stringify({ model: '__invalid_model_for_listing__', input: ['test'] })
  })

  const body = await res.json().catch(() => ({})) as { detail?: string }

  if (res.ok) {
    throw new Error('Unexpected success from Voyage with invalid model — cannot extract model list')
  }

  const detail = body.detail ?? ''
  const match = VOYAGE_MODEL_REGEX.exec(detail)
  if (!match) {
    throw new Error(
      `Could not parse model list from Voyage error response: ${detail || res.statusText}`
    )
  }

  const models = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)

  models.sort((a, b) => a.localeCompare(b))
  return models
}

function reqToConfig(req: FetchModelsRequest): AnyProviderConfig {
  return {
    id: '__fetch_models__',
    name: '__fetch_models__',
    type: req.type as never,
    baseUrl: req.baseUrl,
    apiKey: req.apiKey,
    models: [],
    apiVersion: req.apiVersion
  }
}
