import { MongoClient, ObjectId, type Document, type AnyBulkWriteOperation } from 'mongodb'
import type { ToolEmbeddingConfig } from '../config/store'
import { getConfigStore } from '../config/store'
import { generateEmbeddings } from '../llm/embeddings'
import { formatApiError } from '../llm/format-error'
import type { McpToolInfo } from '../mcp/types'
import { updateToolsSearchIndex } from './search-index'

const TOOLS_COLLECTION = 'mcpxplore_tools'
const BATCH_SIZE = 100

// ── Backfill status tracking ─────────────────────────────────────────

export interface BackfillStatus {
  fieldName: string
  status: 'running' | 'completed' | 'error'
  processed: number
  error?: string
}

const backfillStatuses = new Map<string, BackfillStatus>()
const statusCallbacks: Array<(statuses: BackfillStatus[]) => void> = []

function notifyStatusChange(): void {
  const all = getAllBackfillStatuses()
  for (const cb of statusCallbacks) cb(all)
}

function setBackfillStatus(fieldName: string, patch: Partial<BackfillStatus>): void {
  const existing = backfillStatuses.get(fieldName)
  backfillStatuses.set(fieldName, { fieldName, status: 'running', processed: 0, ...existing, ...patch })
  notifyStatusChange()
}

function clearBackfillStatus(fieldName: string): void {
  backfillStatuses.delete(fieldName)
  notifyStatusChange()
}

export function getAllBackfillStatuses(): BackfillStatus[] {
  return [...backfillStatuses.values()]
}

export function onBackfillStatus(callback: (statuses: BackfillStatus[]) => void): void {
  statusCallbacks.push(callback)
}

// ── Helpers ──────────────────────────────────────────────────────────

function getMongoConfig(): { connectionUri: string; databaseName: string } | null {
  const store = getConfigStore()
  const { connectionUri, chatDatabase } = store.get('mongo')
  if (!connectionUri?.trim() || !chatDatabase?.trim()) return null
  return { connectionUri, databaseName: chatDatabase.trim() }
}

function toolDescriptionText(tool: { name: string; description?: string }): string {
  return tool.description?.trim() || tool.name
}

// ── Backfill ─────────────────────────────────────────────────────────

/**
 * Cursor-based batch backfill for a newly added embedding config.
 *
 * Iterates all tool documents that lack `embeddings.<fieldName>` and whose
 * `syncedAt` <= the backfill start time. This avoids calling the embeddings
 * API for documents that were already handled by the `onCapabilityChange`
 * callback running concurrently.
 */
export async function backfillToolEmbeddings(config: ToolEmbeddingConfig): Promise<void> {
  const mongo = getMongoConfig()
  if (!mongo) return

  const startTime = new Date()
  const embeddingField = `embeddings.${config.fieldName}`
  let lastId: ObjectId | null = null
  let totalProcessed = 0

  setBackfillStatus(config.fieldName, { status: 'running', processed: 0 })

  let client: MongoClient | undefined
  try {
    client = new MongoClient(mongo.connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(mongo.databaseName).collection(TOOLS_COLLECTION)

    for (;;) {
      const filter: Document = {
        syncedAt: { $lte: startTime },
        [embeddingField]: { $exists: false }
      }
      if (lastId) {
        filter._id = { $gt: lastId }
      }

      const batch = await coll
        .find(filter, { projection: { _id: 1, name: 1, description: 1 } })
        .sort({ _id: 1 })
        .limit(BATCH_SIZE)
        .toArray()

      if (batch.length === 0) break

      const texts = batch.map((doc) =>
        toolDescriptionText({ name: String(doc.name ?? ''), description: doc.description as string | undefined })
      )

      let vectors: number[][]
      try {
        const result = await generateEmbeddings(config.providerId, config.model, texts, config.dimensions)
        vectors = result.embeddings
      } catch (err) {
        const errorMsg = formatApiError(err)
        console.warn(`[mongo] backfillToolEmbeddings: embedding API error for ${config.fieldName}:\n${errorMsg}`)
        setBackfillStatus(config.fieldName, { status: 'error', error: errorMsg })
        return
      }

      const ops: AnyBulkWriteOperation<Document>[] = batch.map((doc, i) => ({
        updateOne: {
          filter: { _id: doc._id, syncedAt: { $lte: startTime } },
          update: { $set: { [embeddingField]: vectors[i] } }
        }
      }))

      await coll.bulkWrite(ops, { ordered: false })
      totalProcessed += batch.length
      lastId = batch[batch.length - 1]._id as ObjectId
      setBackfillStatus(config.fieldName, { processed: totalProcessed })
    }

    if (totalProcessed > 0) {
      console.info(`[mongo] backfillToolEmbeddings: wrote ${config.fieldName} for ${totalProcessed} tool(s)`)
    }
    setBackfillStatus(config.fieldName, { status: 'completed', processed: totalProcessed })

    setTimeout(() => clearBackfillStatus(config.fieldName), 10_000)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn(`[mongo] backfillToolEmbeddings failed for ${config.fieldName}: ${errorMsg}`)
    setBackfillStatus(config.fieldName, { status: 'error', error: errorMsg })
  } finally {
    await client?.close().catch(() => {})
  }
}

// ── Remove field ─────────────────────────────────────────────────────

/**
 * Remove an embedding field from all tool documents when the user deletes
 * an embedding config.
 */
export async function removeToolEmbeddingField(fieldName: string): Promise<void> {
  clearBackfillStatus(fieldName)

  const mongo = getMongoConfig()
  if (!mongo) return

  let client: MongoClient | undefined
  try {
    client = new MongoClient(mongo.connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(mongo.databaseName).collection(TOOLS_COLLECTION)
    const result = await coll.updateMany({}, { $unset: { [`embeddings.${fieldName}`]: '' } })
    if (result.modifiedCount > 0) {
      console.info(`[mongo] removeToolEmbeddingField: removed embeddings.${fieldName} from ${result.modifiedCount} doc(s)`)
    }

    const remainingConfigs = getConfigStore().get('toolEmbeddings')
    void updateToolsSearchIndex(remainingConfigs)
  } catch (err) {
    console.warn(
      `[mongo] removeToolEmbeddingField failed for ${fieldName}: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    await client?.close().catch(() => {})
  }
}

// ── Ongoing tool changes ─────────────────────────────────────────────

/**
 * Compute and store embeddings for a server's tools after a capability change.
 * Called from the `onCapabilityChange` callback in ipc.ts.
 */
export async function updateToolEmbeddingsForServer(
  serverId: string,
  tools: McpToolInfo[]
): Promise<void> {
  const store = getConfigStore()
  const configs = store.get('toolEmbeddings')
  if (configs.length === 0) return

  const mongo = getMongoConfig()
  if (!mongo) return

  if (tools.length === 0) return

  let client: MongoClient | undefined
  try {
    client = new MongoClient(mongo.connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(mongo.databaseName).collection(TOOLS_COLLECTION)

    const texts = tools.map((t) => toolDescriptionText(t))

    for (const config of configs) {
      const embeddingField = `embeddings.${config.fieldName}`

      let vectors: number[][]
      try {
        const result = await generateEmbeddings(config.providerId, config.model, texts, config.dimensions)
        vectors = result.embeddings
      } catch (err) {
        console.warn(
          `[mongo] updateToolEmbeddingsForServer: embedding API error for ${config.fieldName} on server ${serverId}:\n${formatApiError(err)}`
        )
        continue
      }

      const ops: AnyBulkWriteOperation<Document>[] = tools.map((tool, i) => ({
        updateOne: {
          filter: { serverId, name: tool.name },
          update: { $set: { [embeddingField]: vectors[i] } }
        }
      }))

      await coll.bulkWrite(ops, { ordered: false })
    }
  } catch (err) {
    console.warn(
      `[mongo] updateToolEmbeddingsForServer failed for ${serverId}: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    await client?.close().catch(() => {})
  }
}
