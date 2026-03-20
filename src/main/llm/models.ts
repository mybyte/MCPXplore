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
    case 'cerebras':
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
 * OpenAI, Azure, OpenRouter, and Cerebras expose a standard /models endpoint
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

/** @see https://docs.fireworks.ai/api-reference/create-model (gatewayModelKind) */
type FireworksGatewayModelKind =
  | 'KIND_UNSPECIFIED'
  | 'HF_BASE_MODEL'
  | 'HF_PEFT_ADDON'
  | 'HF_TEFT_ADDON'
  | 'FLUMINA_BASE_MODEL'
  | 'FLUMINA_ADDON'
  | 'DRAFT_ADDON'
  | 'FIRE_AGENT'
  | 'LIVE_MERGE'
  | 'CUSTOM_MODEL'
  | 'EMBEDDING_MODEL'
  | 'SNAPSHOT_MODEL'

interface FireworksGatewayListModel {
  name?: string
  kind?: string
  supportsServerless?: boolean
  baseModelDetails?: { modelType?: string }
}

/** Decoder / chat LLM families — excludes embeddings, draft, agents, merges, snapshots. */
const FIREWORKS_LLM_KINDS = new Set<FireworksGatewayModelKind>([
  'HF_BASE_MODEL',
  'HF_PEFT_ADDON',
  'HF_TEFT_ADDON',
  'FLUMINA_BASE_MODEL',
  'FLUMINA_ADDON',
  'CUSTOM_MODEL'
])

function fireworksModelSlug(name: string): string {
  const i = name.lastIndexOf('/')
  return i >= 0 ? name.slice(i + 1) : name
}

/** Image / diffusion models are often still HF_BASE_MODEL; trim via modelType + id slug. */
function isFireworksNonLanguageModel(m: FireworksGatewayListModel): boolean {
  const t = m.baseModelDetails?.modelType?.toLowerCase() ?? ''
  if (
    t.includes('flux') ||
    t.includes('sdxl') ||
    t.includes('diffusion') ||
    t.includes('imagen') ||
    t.includes('rerank')
  ) {
    return true
  }

  const slug = m.name ? fireworksModelSlug(m.name).toLowerCase() : ''
  return /flux|sdxl|stable-diffusion|playground-v2|kontext|controlnet|\brerank|embedding/.test(slug)
}

function isFireworksLanguageLlm(
  m: FireworksGatewayListModel
): m is FireworksGatewayListModel & { name: string } {
  if (!m.name || m.supportsServerless !== true) return false
  const kind = m.kind as FireworksGatewayModelKind | undefined
  if (!kind || !FIREWORKS_LLM_KINDS.has(kind)) return false
  if (isFireworksNonLanguageModel(m)) return false
  return true
}

/**
 * Fireworks Gateway list-models API (not the OpenAI-compat /models route).
 * Paginates with `pageToken` / `nextPageToken` until no further page; `pageSize` is capped at 200.
 * @see https://docs.fireworks.ai/api-reference/list-models
 */
async function fetchFireworksModels(req: FetchModelsRequest): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  /** Guard against a buggy or stuck API repeating the same token. */
  const seenTokens = new Set<string>()
  const maxPages = 500

  for (let page = 0; page < maxPages; page++) {
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
      models?: FireworksGatewayListModel[]
      nextPageToken?: string
    }

    for (const m of data.models ?? []) {
      if (isFireworksLanguageLlm(m)) ids.push(m.name)
    }

    const next = data.nextPageToken?.trim()
    if (!next) break
    if (seenTokens.has(next)) break
    seenTokens.add(next)
    pageToken = next
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
