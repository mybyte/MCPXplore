import { MongoClient, type Document } from 'mongodb'
import { getConfigStore } from '../config/store'
import { TOOLS_COLLECTION, ensureToolsSearchIndex } from './search-index'

const CHATS_COLLECTION = 'mcpxplore_chats'

type ChatDoc = Document & { _id: string }

function invalidDbName(name: string): string | null {
  const t = name.trim()
  if (!t) return 'Database name is required'
  if (t.length > 64) return 'Database name must be at most 64 characters'
  if (/[/. "$*<>:?|]/.test(t) || t.includes('\\')) return 'Database name contains invalid characters'
  return null
}

export async function mongoTestConnection(
  connectionUri: string
): Promise<{ ok: true; databases: string[] } | { ok: false; error: string }> {
  const uri = connectionUri.trim()
  if (!uri) return { ok: false, error: 'Connection URI is empty' }
  let client: MongoClient | undefined
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const { databases } = await client.db().admin().listDatabases()
    const names = databases.map((d) => d.name).sort()
    return { ok: true, databases: names }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await client?.close().catch(() => {})
  }
}

export async function mongoEnsureDatabase(
  connectionUri: string,
  databaseName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uri = connectionUri.trim()
  const err = invalidDbName(databaseName)
  if (!uri) return { ok: false, error: 'Connection URI is empty' }
  if (err) return { ok: false, error: err }
  let client: MongoClient | undefined
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const db = client.db(databaseName.trim())

    const hasChatsColl = await db.listCollections({ name: CHATS_COLLECTION }).hasNext()
    if (!hasChatsColl) await db.createCollection(CHATS_COLLECTION)

    const hasToolsColl = await db.listCollections({ name: TOOLS_COLLECTION }).hasNext()
    if (!hasToolsColl) await db.createCollection(TOOLS_COLLECTION)

    const toolsColl = db.collection(TOOLS_COLLECTION)
    await toolsColl.createIndex({ serverId: 1, name: 1 }, { unique: true }).catch(() => {})

    const embeddingConfigs = getConfigStore().get('toolEmbeddings')
    await ensureToolsSearchIndex(toolsColl, embeddingConfigs)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    await client?.close().catch(() => {})
  }
}

const DEFAULT_TOOL_SELECTION_CONFIG = {
  semanticContextTokens: 500,
  semanticToolLimit: 5,
  semanticScoreCutoff: 0,
  semanticEmbeddingFieldName: '',
  agenticContextTokens: 5000,
  agenticProviderId: '',
  agenticModelId: '',
  agenticSearchMode: 'keyword',
  agenticToolLimit: 10,
  agenticScoreCutoff: 0,
  agenticEmbeddingFieldName: '',
  agenticHybridWeights: { keyword: 1, vector: 1 }
}

function buildToolSelectionConfigProjection(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, defaultVal] of Object.entries(DEFAULT_TOOL_SELECTION_CONFIG)) {
    out[key] = { $ifNull: [`$toolSelectionConfig.${key}`, defaultVal] }
  }
  return out
}

const LOAD_CHATS_PIPELINE: Document[] = [
  {
    $project: {
      _id: 0,
      id: { $toString: '$_id' },
      title: { $ifNull: ['$title', 'Chat'] },
      messages: { $ifNull: ['$messages', []] },
      mcpToolsMode: {
        $cond: {
          if: { $in: ['$mcpToolsMode', ['all', 'pick', 'semantic', 'agentic']] },
          then: '$mcpToolsMode',
          else: 'all'
        }
      },
      enabledTools: { $ifNull: ['$enabledTools', []] },
      providerId: { $ifNull: ['$providerId', ''] },
      modelId: { $ifNull: ['$modelId', ''] },
      systemPrompt: { $ifNull: ['$systemPrompt', ''] },
      agenticSystemPrompt: { $ifNull: ['$agenticSystemPrompt', ''] },
      toolSelectionConfig: buildToolSelectionConfigProjection(),
      createdAt: { $ifNull: ['$createdAt', { $toLong: new Date() }] }
    }
  }
]

export async function mongoLoadChats(
  connectionUri: string,
  databaseName: string
): Promise<Record<string, unknown>[]> {
  const uri = connectionUri.trim()
  const dbn = databaseName.trim()
  const err = invalidDbName(dbn)
  if (!uri) throw new Error('Connection URI is empty')
  if (err) throw new Error(err)
  let client: MongoClient | undefined
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(dbn).collection<ChatDoc>(CHATS_COLLECTION)
    return (await coll.aggregate(LOAD_CHATS_PIPELINE).toArray()) as Record<string, unknown>[]
  } finally {
    await client?.close().catch(() => {})
  }
}

/** Strip empty strings, empty arrays, and default toolSelectionConfig values to keep documents lean. */
function toChatDoc(chat: Record<string, unknown>): ChatDoc {
  const id = String(chat.id ?? '')
  const doc: Record<string, unknown> = { _id: id }

  if (chat.title && chat.title !== 'Chat') doc.title = chat.title
  if (Array.isArray(chat.messages) && chat.messages.length > 0) doc.messages = chat.messages
  if (chat.mcpToolsMode && chat.mcpToolsMode !== 'all') doc.mcpToolsMode = chat.mcpToolsMode
  if (Array.isArray(chat.enabledTools) && chat.enabledTools.length > 0) doc.enabledTools = chat.enabledTools
  if (chat.providerId) doc.providerId = chat.providerId
  if (chat.modelId) doc.modelId = chat.modelId
  if (chat.systemPrompt) doc.systemPrompt = chat.systemPrompt
  if (chat.agenticSystemPrompt) doc.agenticSystemPrompt = chat.agenticSystemPrompt
  if (typeof chat.createdAt === 'number') doc.createdAt = chat.createdAt

  const tsc = chat.toolSelectionConfig as Record<string, unknown> | undefined
  if (tsc && typeof tsc === 'object') {
    const sparse: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(tsc)) {
      const def = (DEFAULT_TOOL_SELECTION_CONFIG as Record<string, unknown>)[key]
      if (typeof def === 'object' && def !== null) {
        if (JSON.stringify(val) !== JSON.stringify(def)) sparse[key] = val
      } else if (val !== def) {
        sparse[key] = val
      }
    }
    if (Object.keys(sparse).length > 0) doc.toolSelectionConfig = sparse
  }

  return doc as ChatDoc
}

export async function mongoSyncChats(
  connectionUri: string,
  databaseName: string,
  chats: Record<string, unknown>[]
): Promise<void> {
  const uri = connectionUri.trim()
  const dbn = databaseName.trim()
  const err = invalidDbName(dbn)
  if (!uri) throw new Error('Connection URI is empty')
  if (err) throw new Error(err)
  let client: MongoClient | undefined
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 12_000 })
    await client.connect()
    const coll = client.db(dbn).collection<ChatDoc>(CHATS_COLLECTION)
    const ids = chats.map((c) => String(c.id ?? '')).filter(Boolean)
    if (ids.length === 0) {
      await coll.deleteMany({})
      return
    }
    await coll.deleteMany({ _id: { $nin: ids } })
    for (const chat of chats) {
      const id = String(chat.id ?? '')
      if (!id) continue
      await coll.replaceOne({ _id: id }, toChatDoc(chat), { upsert: true })
    }
  } finally {
    await client?.close().catch(() => {})
  }
}
