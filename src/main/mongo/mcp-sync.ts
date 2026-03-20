import { MongoClient, type Document, type AnyBulkWriteOperation } from 'mongodb'
import type { McpToolInfo, CapabilityFingerprints } from '../mcp/types'
import { getConfigStore } from '../config/store'

const TOOLS_COLLECTION = 'mcpxplore_tools'

interface McpToolDoc extends Document {
  serverId: string
  serverName: string
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  fingerprint?: string
  syncedAt: Date
}

/**
 * Sync all tools of a single MCP server to MongoDB.
 *
 * Strategy:
 *  1. `bulkWrite` a batch of `updateOne` (upsert) operations — one per tool.
 *  2. Inspect the batch result to collect upserted document `_id`s directly,
 *     then query the `_id`s for the remaining matched documents.
 *  3. `deleteMany` on this server's tools, excluding the ids we just touched.
 *     This removes tools that disappeared from the server since the last sync.
 *
 * Silently no-ops when MongoDB is not configured.
 */
export async function syncMcpServerTools(
  serverId: string,
  serverName: string,
  tools: McpToolInfo[],
  fingerprints?: CapabilityFingerprints
): Promise<void> {
  const store = getConfigStore()
  const { connectionUri, chatDatabase } = store.get('mongo')
  if (!connectionUri?.trim() || !chatDatabase?.trim()) return

  let client: MongoClient | undefined
  try {
    client = new MongoClient(connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(chatDatabase.trim()).collection<McpToolDoc>(TOOLS_COLLECTION)

    if (tools.length === 0) {
      await coll.deleteMany({ serverId })
      return
    }

    const now = new Date()

    const ops: AnyBulkWriteOperation<McpToolDoc>[] = tools.map((tool) => ({
      updateOne: {
        filter: { serverId, name: tool.name },
        update: {
          $set: {
            serverName,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            fingerprint: fingerprints?.tools[tool.name],
            syncedAt: now
          },
          $setOnInsert: { serverId, name: tool.name }
        },
        upsert: true
      }
    }))

    const result = await coll.bulkWrite(ops, { ordered: false })

    // --- Collect touched document IDs from the batch result ---

    const touchedIds: unknown[] = []

    // Upserted docs: the result maps operation-index → generated _id
    for (const id of Object.values(result.upsertedIds)) {
      touchedIds.push(id)
    }

    // Matched (already existing) docs: their _ids aren't in the bulkWrite
    // result, so we identify which operations were *not* upserted and query
    // their _ids using the same filter criteria.
    const upsertedIndices = new Set(Object.keys(result.upsertedIds).map(Number))
    const matchedNames = tools
      .filter((_, i) => !upsertedIndices.has(i))
      .map((t) => t.name)

    if (matchedNames.length > 0) {
      const matchedDocs = await coll
        .find({ serverId, name: { $in: matchedNames } }, { projection: { _id: 1 } })
        .toArray()
      for (const doc of matchedDocs) {
        touchedIds.push(doc._id)
      }
    }

    // --- Remove stale tools that no longer exist on this MCP server ---

    if (touchedIds.length > 0) {
      await coll.deleteMany({ serverId, _id: { $nin: touchedIds } })
    } else {
      await coll.deleteMany({ serverId })
    }
  } catch (err) {
    console.warn(
      `[mongo] syncMcpServerTools failed for ${serverId}: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    await client?.close().catch(() => {})
  }
}

/**
 * Remove tool catalog documents whose `serverId` is not in the configured MCP server list.
 * Use when servers are deleted from settings and to fix historical orphans.
 * With an empty `validServerIds`, deletes all catalog documents.
 * Silently no-ops when MongoDB is not configured.
 */
export async function pruneToolCatalogToConfiguredServers(
  validServerIds: string[]
): Promise<void> {
  const store = getConfigStore()
  const { connectionUri, chatDatabase } = store.get('mongo')
  if (!connectionUri?.trim() || !chatDatabase?.trim()) return

  let client: MongoClient | undefined
  try {
    client = new MongoClient(connectionUri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(chatDatabase.trim()).collection<McpToolDoc>(TOOLS_COLLECTION)
    const result = await coll.deleteMany({ serverId: { $nin: validServerIds } })
    if (result.deletedCount > 0) {
      console.info(
        `[mongo] pruned ${result.deletedCount} tool catalog document(s) (not in configured MCP servers)`
      )
    }
  } catch (err) {
    console.warn(
      `[mongo] pruneToolCatalogToConfiguredServers failed: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    await client?.close().catch(() => {})
  }
}
