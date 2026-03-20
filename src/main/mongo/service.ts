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

function docToChat(doc: Document): Record<string, unknown> {
  const id = String(doc._id ?? doc.id ?? '')
  const messages = Array.isArray(doc.messages) ? doc.messages : []
  const enabledTools = Array.isArray(doc.enabledTools) ? doc.enabledTools : []
  const mcpToolsMode = doc.mcpToolsMode === 'pick' || doc.mcpToolsMode === 'all' ? doc.mcpToolsMode : 'all'
  return {
    id,
    title: String(doc.title ?? 'Chat'),
    messages,
    mcpToolsMode,
    enabledTools: enabledTools.map(String),
    providerId: String(doc.providerId ?? ''),
    modelId: String(doc.modelId ?? ''),
    createdAt: typeof doc.createdAt === 'number' ? doc.createdAt : Date.now()
  }
}

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
    const docs = await coll.find({}).toArray()
    return docs.map(docToChat)
  } finally {
    await client?.close().catch(() => {})
  }
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
      const doc: ChatDoc = {
        _id: id,
        title: chat.title,
        messages: chat.messages,
        mcpToolsMode: chat.mcpToolsMode,
        enabledTools: chat.enabledTools,
        providerId: chat.providerId,
        modelId: chat.modelId,
        createdAt: chat.createdAt
      }
      await coll.replaceOne({ _id: id }, doc, { upsert: true })
    }
  } finally {
    await client?.close().catch(() => {})
  }
}
