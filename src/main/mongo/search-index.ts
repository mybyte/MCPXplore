import { MongoClient, type Collection, type Document } from 'mongodb'
import type { ToolEmbeddingConfig } from '../config/store'
import { getConfigStore } from '../config/store'

export const TOOLS_COLLECTION = 'mcpxplore_tools'
export const SEARCH_INDEX_NAME = 'tools_search'

type FieldMapping = Record<string, unknown> | Record<string, unknown>[]

function tokenAndString(): FieldMapping {
  return [
    { type: 'token' },
    { type: 'string', analyzer: 'lucene.standard' }
  ]
}

/**
 * Build the full Atlas Search index definition from the static McpToolDoc
 * schema plus any configured vector embedding fields.
 */
export function buildSearchIndexDefinition(
  embeddingConfigs: ToolEmbeddingConfig[]
): Record<string, unknown> {
  const fields: Record<string, FieldMapping> = {
    serverId: tokenAndString(),
    serverName: tokenAndString(),
    name: tokenAndString(),
    description: tokenAndString(),
    fingerprint: { type: 'token' },
    syncedAt: { type: 'date' },
    inputSchema: { type: 'document', dynamic: true },
    outputSchema: { type: 'document', dynamic: true }
  }

  if (embeddingConfigs.length > 0) {
    const vectorFields: Record<string, FieldMapping> = {}
    for (const cfg of embeddingConfigs) {
      vectorFields[cfg.fieldName] = {
        type: 'vector',
        numDimensions: cfg.dimensions,
        similarity: 'cosine'
      }
    }
    fields.embeddings = { type: 'document', fields: vectorFields }
  }

  return { mappings: { dynamic: false, fields } }
}

/**
 * Check whether the search index already exists on the collection.
 * If not, create it. If it does, update it to match the current definition.
 */
export async function ensureToolsSearchIndex(
  coll: Collection<Document>,
  embeddingConfigs: ToolEmbeddingConfig[]
): Promise<void> {
  const definition = buildSearchIndexDefinition(embeddingConfigs)

  try {
    const cursor = coll.listSearchIndexes(SEARCH_INDEX_NAME)
    const existing = await cursor.toArray()

    if (existing.length === 0) {
      await coll.createSearchIndex({
        name: SEARCH_INDEX_NAME,
        type: 'search',
        definition
      })
      console.info(`[mongo] created search index "${SEARCH_INDEX_NAME}"`)
    } else {
      await coll.updateSearchIndex(SEARCH_INDEX_NAME, definition)
      console.info(`[mongo] updated search index "${SEARCH_INDEX_NAME}"`)
    }
  } catch (err) {
    console.warn(
      `[mongo] ensureToolsSearchIndex failed: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Standalone entry point to reconcile the search index definition with the
 * current set of embedding configs. Opens its own MongoClient connection.
 */
export async function updateToolsSearchIndex(
  embeddingConfigs: ToolEmbeddingConfig[]
): Promise<void> {
  const store = getConfigStore()
  const { connectionUri, chatDatabase } = store.get('mongo')
  if (!connectionUri?.trim() || !chatDatabase?.trim()) return

  let client: MongoClient | undefined
  try {
    client = new MongoClient(connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(chatDatabase.trim()).collection(TOOLS_COLLECTION)

    const definition = buildSearchIndexDefinition(embeddingConfigs)
    await coll.updateSearchIndex(SEARCH_INDEX_NAME, definition)
    console.info(`[mongo] updated search index "${SEARCH_INDEX_NAME}" for ${embeddingConfigs.length} embedding field(s)`)
  } catch (err) {
    console.warn(
      `[mongo] updateToolsSearchIndex failed: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    await client?.close().catch(() => {})
  }
}

/**
 * Run on app startup: ensure the tools collection, its unique index, and the
 * search index all exist. Reads credentials directly from the config store.
 * Silently no-ops when MongoDB is not configured.
 */
export async function bootstrapToolsCollection(): Promise<void> {
  const store = getConfigStore()
  const { connectionUri, chatDatabase } = store.get('mongo')
  if (!connectionUri?.trim() || !chatDatabase?.trim()) return

  let client: MongoClient | undefined
  try {
    client = new MongoClient(connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const db = client.db(chatDatabase.trim())

    const hasToolsColl = await db.listCollections({ name: TOOLS_COLLECTION }).hasNext()
    if (!hasToolsColl) {
      await db.createCollection(TOOLS_COLLECTION)
      console.info(`[mongo] created collection "${TOOLS_COLLECTION}"`)
    }

    const coll = db.collection(TOOLS_COLLECTION)
    await coll.createIndex({ serverId: 1, name: 1 }, { unique: true }).catch(() => {})

    const embeddingConfigs = store.get('toolEmbeddings')
    await ensureToolsSearchIndex(coll, embeddingConfigs)
  } catch (err) {
    console.warn(
      `[mongo] bootstrapToolsCollection failed: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    await client?.close().catch(() => {})
  }
}
