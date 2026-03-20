import { MongoClient, type Document } from 'mongodb'
import { getConfigStore } from '../config/store'
import { generateEmbedding } from '../llm/embeddings'
import { TOOLS_COLLECTION, SEARCH_INDEX_NAME } from './search-index'

// ── Types ─────────────────────────────────────────────────────────────

export interface ToolSearchParams {
  query: string
  mode: 'keyword' | 'vector' | 'hybrid'
  embeddingFieldName?: string
  limit?: number
  serverNames?: string[]
  toolNames?: string[]
  hybrid?: {
    fusionType: 'rank' | 'score'
    weights?: { keyword: number; vector: number }
    normalization?: 'none' | 'sigmoid' | 'minMaxScaler'
  }
}

export interface ToolSearchResult {
  _id: string
  serverId: string
  serverName: string
  name: string
  description?: string
  score: number
  scoreDetails?: Record<string, unknown>
}

export interface FacetBucket {
  _id: string
  count: number
}

export interface ToolSearchFacets {
  servers: FacetBucket[]
  toolNames: FacetBucket[]
}

// ── Helpers ────────────────────────────────────────────────────────────

function getMongoConfig(): { connectionUri: string; databaseName: string } | null {
  const store = getConfigStore()
  const { connectionUri, chatDatabase } = store.get('mongo')
  if (!connectionUri?.trim() || !chatDatabase?.trim()) return null
  return { connectionUri, databaseName: chatDatabase.trim() }
}

/**
 * Build a $search-operator filter clause for token-indexed fields.
 * Uses `serverName` (human-readable, matches $searchMeta facet output)
 * and `name` for tool filtering.
 * Returns `undefined` when no filters are active.
 */
function buildSearchFilter(
  serverNames?: string[],
  toolNames?: string[]
): Document | undefined {
  const clauses: Document[] = []

  if (serverNames && serverNames.length > 0) {
    clauses.push({ in: { path: 'serverName', value: serverNames } })
  }
  if (toolNames && toolNames.length > 0) {
    clauses.push({ in: { path: 'name', value: toolNames } })
  }

  if (clauses.length === 0) return undefined
  if (clauses.length === 1) return clauses[0]
  return { compound: { filter: clauses } }
}

// ── Sub-pipeline builders ──────────────────────────────────────────────

function buildKeywordSubPipeline(
  query: string,
  filter: Document | undefined,
  limit: number
): Document[] {
  const searchBody: Document = filter
    ? { compound: { must: [{ text: { query, path: ['name', 'description'] } }], filter: [filter] } }
    : { text: { query, path: ['name', 'description'] } }

  return [
    { $search: { index: SEARCH_INDEX_NAME, ...searchBody } },
    { $limit: limit }
  ]
}

function buildVectorSubPipeline(
  fieldName: string,
  queryVector: number[],
  filter: Document | undefined,
  limit: number
): Document[] {
  const vectorSearch: Document = {
    path: `embeddings.${fieldName}`,
    queryVector,
    exact: true,
    limit
  }
  if (filter) vectorSearch.filter = filter

  return [{ $search: { index: SEARCH_INDEX_NAME, vectorSearch } }]
}

// ── Full pipeline builders ─────────────────────────────────────────────

function buildKeywordPipeline(
  query: string,
  filter: Document | undefined,
  limit: number
): Document[] {
  return [
    ...buildKeywordSubPipeline(query, filter, limit),
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $project: { embeddings: 0 } }
  ]
}

function buildVectorPipeline(
  fieldName: string,
  queryVector: number[],
  filter: Document | undefined,
  limit: number
): Document[] {
  return [
    ...buildVectorSubPipeline(fieldName, queryVector, filter, limit),
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $project: { embeddings: 0 } }
  ]
}

function buildHybridPipeline(
  query: string,
  fieldName: string,
  queryVector: number[],
  filter: Document | undefined,
  limit: number,
  fusionType: 'rank' | 'score',
  weights: { keyword: number; vector: number },
  normalization: string
): Document[] {
  const keywordSub = buildKeywordSubPipeline(query, filter, limit)
  const vectorSub = buildVectorSubPipeline(fieldName, queryVector, filter, limit)

  const pipelines = { keyword: keywordSub, vector: vectorSub }

  let fusionStage: Document
  if (fusionType === 'score') {
    fusionStage = {
      $scoreFusion: {
        input: { pipelines, normalization },
        combination: {
          weights: { keyword: weights.keyword, vector: weights.vector },
          method: 'avg'
        },
        scoreDetails: true
      }
    }
  } else {
    fusionStage = {
      $rankFusion: {
        input: { pipelines },
        combination: { weights: { keyword: weights.keyword, vector: weights.vector } },
        scoreDetails: true
      }
    }
  }

  return [
    fusionStage,
    { $addFields: { score: { $meta: 'searchScore' } } },
    { $project: { embeddings: 0 } }
  ]
}

// ── Query vector generation ────────────────────────────────────────────

async function getQueryVector(fieldName: string, query: string): Promise<number[]> {
  const store = getConfigStore()
  const configs = store.get('toolEmbeddings')
  const cfg = configs.find((c) => c.fieldName === fieldName)
  if (!cfg) throw new Error(`No embedding config found for field "${fieldName}"`)

  const { embedding } = await generateEmbedding(cfg.providerId, cfg.model, query, cfg.dimensions)
  return embedding
}

// ── Main entry point ───────────────────────────────────────────────────

export async function searchTools(params: ToolSearchParams): Promise<ToolSearchResult[]> {
  const mongo = getMongoConfig()
  if (!mongo) throw new Error('MongoDB is not configured')

  const limit = params.limit ?? 20
  const filter = buildSearchFilter(params.serverNames, params.toolNames)

  let queryVector: number[] | undefined
  if (params.mode === 'vector' || params.mode === 'hybrid') {
    if (!params.embeddingFieldName) {
      throw new Error('embeddingFieldName is required for vector/hybrid search')
    }
    queryVector = await getQueryVector(params.embeddingFieldName, params.query)
  }

  let pipeline: Document[]
  switch (params.mode) {
    case 'keyword':
      pipeline = buildKeywordPipeline(params.query, filter, limit)
      break
    case 'vector':
      pipeline = buildVectorPipeline(
        params.embeddingFieldName!,
        queryVector!,
        filter,
        limit
      )
      break
    case 'hybrid': {
      const hybrid = params.hybrid ?? { fusionType: 'rank' as const }
      pipeline = buildHybridPipeline(
        params.query,
        params.embeddingFieldName!,
        queryVector!,
        filter,
        limit,
        hybrid.fusionType,
        hybrid.weights ?? { keyword: 1, vector: 1 },
        hybrid.normalization ?? 'sigmoid'
      )
      break
    }
  }

  let client: MongoClient | undefined
  try {
    client = new MongoClient(mongo.connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(mongo.databaseName).collection(TOOLS_COLLECTION)
    const docs = await coll.aggregate(pipeline).toArray()

    return docs.map((doc) => ({
      _id: String(doc._id),
      serverId: String(doc.serverId ?? ''),
      serverName: String(doc.serverName ?? ''),
      name: String(doc.name ?? ''),
      description: doc.description != null ? String(doc.description) : undefined,
      score: typeof doc.score === 'number' ? doc.score : 0,
      scoreDetails: doc.scoreDetails as Record<string, unknown> | undefined
    }))
  } finally {
    await client?.close().catch(() => {})
  }
}

// ── Facets ──────────────────────────────────────────────────────────────

export async function searchToolsFacets(): Promise<ToolSearchFacets> {
  const mongo = getMongoConfig()
  if (!mongo) throw new Error('MongoDB is not configured')

  const pipeline: Document[] = [
    {
      $searchMeta: {
        index: SEARCH_INDEX_NAME,
        facet: {
          facets: {
            tool_names: { type: 'string', path: 'name', numBuckets: 1000 },
            servers: { type: 'string', path: 'serverName', numBuckets: 1000 }
          }
        }
      }
    }
  ]

  let client: MongoClient | undefined
  try {
    client = new MongoClient(mongo.connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(mongo.databaseName).collection(TOOLS_COLLECTION)
    const docs = await coll.aggregate(pipeline).toArray()
    const result = docs[0]

    const facet = result?.facet as Record<string, { buckets: FacetBucket[] }> | undefined
    return {
      servers: facet?.servers?.buckets ?? [],
      toolNames: facet?.tool_names?.buckets ?? []
    }
  } finally {
    await client?.close().catch(() => {})
  }
}
