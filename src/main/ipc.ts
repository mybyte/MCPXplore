import { ipcMain, BrowserWindow } from 'electron'
import { getConfigStore, REDACTED } from './config/store'
import type { MongoSettings, SecretsScope, LlmProviderConfig, EmbeddingsProviderConfig, McpServerConfig, ToolEmbeddingConfig } from './config/store'
import { getMcpManager } from './mcp/manager'
import { handleChatSend, stopChat, testLlmConnection } from './llm/chat'
import { DEFAULT_AGENTIC_SYSTEM_PROMPT } from './llm/tool-selection'
import { testEmbeddingsConnection } from './llm/embeddings'
import { fetchAvailableModels, type FetchModelsRequest } from './llm/models'
import { formatApiError } from './llm/format-error'
import {
  mongoEnsureDatabase,
  mongoLoadChats,
  mongoLoadChatTurns,
  mongoSyncChats,
  mongoTestConnection
} from './mongo/service'
import { syncMcpServerTools } from './mongo/mcp-sync'
import {
  backfillToolEmbeddings,
  removeToolEmbeddingField,
  updateToolEmbeddingsForServer,
  getAllBackfillStatuses,
  onBackfillStatus
} from './mongo/tool-embeddings'
import { updateToolsSearchIndex, bootstrapToolsCollection } from './mongo/search-index'
import { searchTools, searchToolsFacets, type ToolSearchParams } from './mongo/tool-search'

const LOG_LEVELS = new Set(['error', 'warn', 'info', 'debug'])

function logRendererEntry(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return
  const e = raw as Record<string, unknown>
  const level = e['level']
  const source = e['source']
  const message = e['message']
  if (typeof level !== 'string' || !LOG_LEVELS.has(level)) return
  if (typeof source !== 'string' || typeof message !== 'string') return
  const detail = typeof e['detail'] === 'string' ? e['detail'] : undefined
  const stack = typeof e['stack'] === 'string' ? e['stack'] : undefined
  const prefix = `[renderer:${source}]`
  const body = [message, detail, stack].filter(Boolean).join('\n')
  switch (level) {
    case 'error':
      console.error(prefix, '\n' + body)
      break
    case 'warn':
      console.warn(prefix, '\n' + body)
      break
    case 'info':
      console.info(prefix, '\n' + body)
      break
    default:
      console.debug(prefix, '\n' + body)
  }
}

export function registerIpcHandlers(): void {
  const store = getConfigStore()
  const mcpManager = getMcpManager()

  // Broadcast MCP status changes to all renderer windows
  mcpManager.onStatusChange((statuses) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('mcp:status', statuses)
    }
  })

  // Broadcast capability change events (fingerprint diffs) to all renderer windows
  mcpManager.onCapabilityChange((change) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('mcp:capabilityChange', change)
    }
  })

  // Sync MCP tools to MongoDB when a server's capabilities change
  mcpManager.onCapabilityChange((change) => {
    const status = mcpManager
      .getAllStatuses()
      .find((s) => s.id === change.serverId)
    if (!status || status.status !== 'connected') return

    void syncMcpServerTools(
      change.serverId,
      change.serverName,
      status.tools,
      status.fingerprints
    )
  })

  // Broadcast backfill status changes to all renderer windows
  onBackfillStatus((statuses) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('toolEmbeddings:backfillStatus', statuses)
    }
  })

  // Compute and store tool embeddings when a server's capabilities change.
  // Runs after the tool sync callback writes documents to MongoDB.
  mcpManager.onCapabilityChange((change) => {
    const status = mcpManager
      .getAllStatuses()
      .find((s) => s.id === change.serverId)
    if (!status || status.status !== 'connected') return
    if (status.tools.length === 0) return

    void updateToolEmbeddingsForServer(change.serverId, status.tools)
  })

  ipcMain.handle('renderer:log', (_event, entry: unknown) => {
    logRendererEntry(entry)
  })

  // ── Config ─────────────────────────────────────────────────────────

  ipcMain.handle('config:getAll', () => store.getRedactedAll())

  ipcMain.handle('config:getSecrets', (_event, scope: SecretsScope) => {
    return store.getSecrets(scope)
  })

  ipcMain.handle('config:llmProviders:set', (_event, providers: LlmProviderConfig[]) => {
    const existing = store.get('llmProviders')
    const merged = providers.map((p) => {
      if (p.apiKey === REDACTED) {
        const prev = existing.find((x) => x.id === p.id)
        return prev ? { ...p, apiKey: prev.apiKey } : p
      }
      return p
    })
    store.set('llmProviders', merged)
  })

  ipcMain.handle('config:embeddingsProviders:set', (_event, providers: EmbeddingsProviderConfig[]) => {
    const existing = store.get('embeddingsProviders')
    const merged = providers.map((p) => {
      if (p.apiKey === REDACTED) {
        const prev = existing.find((x) => x.id === p.id)
        return prev ? { ...p, apiKey: prev.apiKey } : p
      }
      return p
    })
    store.set('embeddingsProviders', merged)
  })

  ipcMain.handle('config:mcpServers:set', (_event, servers: McpServerConfig[]) => {
    const existing = store.get('mcpServers')
    const merged = servers.map((s) => {
      if (s.env) {
        const prevServer = existing.find((x) => x.id === s.id)
        const prevEnv = prevServer?.env ?? {}
        const resolvedEnv: Record<string, string> = {}
        for (const [k, v] of Object.entries(s.env)) {
          resolvedEnv[k] = v === REDACTED ? (prevEnv[k] ?? '') : v
        }
        return { ...s, env: resolvedEnv }
      }
      return s
    })
    store.set('mcpServers', merged)
    mcpManager.applySavedServerConfigs(merged)
  })

  ipcMain.handle('toolEmbeddings:getBackfillStatuses', () => getAllBackfillStatuses())

  ipcMain.handle('config:toolEmbeddings:set', (_event, configs: ToolEmbeddingConfig[]) => {
    const oldConfigs = store.get('toolEmbeddings')
    store.set('toolEmbeddings', configs)

    const oldFieldNames = new Set(oldConfigs.map((c) => c.fieldName))
    const newFieldNames = new Set(configs.map((c) => c.fieldName))

    for (const old of oldConfigs) {
      if (!newFieldNames.has(old.fieldName)) {
        void removeToolEmbeddingField(old.fieldName)
      }
    }

    for (const cfg of configs) {
      if (!oldFieldNames.has(cfg.fieldName)) {
        void backfillToolEmbeddings(cfg)
      }
    }

    void updateToolsSearchIndex(configs)
  })

  ipcMain.handle('config:chats:set', (_event, chats) => {
    store.set('chats', chats)
  })

  ipcMain.handle('config:defaultAgenticSystemPrompt', () => DEFAULT_AGENTIC_SYSTEM_PROMPT)

  ipcMain.handle('config:mongo:set', (_event, mongo: MongoSettings) => {
    if (mongo.connectionUri === REDACTED || mongo.connectionUri.includes('***')) {
      const existing = store.get('mongo')
      mongo = { ...mongo, connectionUri: existing.connectionUri }
    }
    store.set('mongo', mongo)
    void bootstrapToolsCollection()
  })

  // ── MCP ────────────────────────────────────────────────────────────

  ipcMain.handle('mcp:connect', async (_event, serverId: string) => {
    const configs = store.get('mcpServers')
    const config = configs.find((s) => s.id === serverId)
    if (!config) throw new Error(`MCP server config not found: ${serverId}`)
    const result = await mcpManager.connect(config)
    if (result.status === 'connected') {
      const saved = new Set(store.get('connectedServerIds'))
      saved.add(serverId)
      store.set('connectedServerIds', [...saved])
    }
    return result
  })

  ipcMain.handle('mcp:disconnect', async (_event, serverId: string) => {
    await mcpManager.disconnect(serverId)
    const saved = store.get('connectedServerIds').filter((id) => id !== serverId)
    store.set('connectedServerIds', saved)
  })

  ipcMain.handle('mcp:listTools', async (_event, serverId: string) => {
    return mcpManager.listTools(serverId)
  })

  ipcMain.handle('mcp:callTool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>) => {
    return mcpManager.callTool(serverId, toolName, args)
  })

  ipcMain.handle('mcp:listResources', async (_event, serverId: string) => {
    return mcpManager.listResources(serverId)
  })

  ipcMain.handle('mcp:readResource', async (_event, serverId: string, uri: string) => {
    return mcpManager.readResource(serverId, uri)
  })

  ipcMain.handle('mcp:listPrompts', async (_event, serverId: string) => {
    return mcpManager.listPrompts(serverId)
  })

  ipcMain.handle(
    'mcp:getPrompt',
    async (_event, serverId: string, name: string, args: Record<string, string>) => {
      return mcpManager.getPrompt(serverId, name, args)
    }
  )

  ipcMain.handle('mcp:listResourceTemplates', async (_event, serverId: string) => {
    return mcpManager.listResourceTemplates(serverId)
  })

  ipcMain.handle('mcp:getStatuses', () => {
    return mcpManager.getAllStatuses()
  })

  ipcMain.handle('mcp:connectAll', async () => {
    const configs = store.get('mcpServers')
    const results = await Promise.allSettled(configs.map((c) => mcpManager.connect(c)))
    const connectedIds = results
      .map((r, i) => (r.status === 'fulfilled' && r.value.status === 'connected' ? configs[i].id : null))
      .filter((id): id is string => id !== null)
    if (connectedIds.length > 0) {
      const saved = new Set(store.get('connectedServerIds'))
      connectedIds.forEach((id) => saved.add(id))
      store.set('connectedServerIds', [...saved])
    }
    return results.map((r) => (r.status === 'fulfilled' ? r.value : { error: String(r.reason) }))
  })

  ipcMain.handle('mcp:reconnectSaved', async () => {
    const savedIds = new Set(store.get('connectedServerIds'))
    if (savedIds.size === 0) return []
    const configs = store.get('mcpServers').filter((c) => savedIds.has(c.id))
    const results = await Promise.allSettled(configs.map((c) => mcpManager.connect(c)))
    const stillConnected = configs
      .filter((_, i) => {
        const r = results[i]
        return r.status === 'fulfilled' && r.value.status === 'connected'
      })
      .map((c) => c.id)
    store.set('connectedServerIds', stillConnected)
    return results.map((r) => (r.status === 'fulfilled' ? r.value : { error: String(r.reason) }))
  })

  ipcMain.handle('mcp:refreshCapabilities', async (_event, serverId: string) => {
    return mcpManager.refreshCapabilities(serverId)
  })

  // ── LLM Chat ───────────────────────────────────────────────────────

  ipcMain.handle('llm:send', async (_event, chatId: string, message: string, options: Record<string, unknown>) => {
    try {
      await handleChatSend(chatId, message, options as never)
    } catch (err) {
      console.error(`[llm:send] chatId=${chatId}\n${formatApiError(err)}`)
      throw err
    }
  })

  ipcMain.handle('llm:stop', (_event, chatId: string) => {
    stopChat(chatId)
  })

  ipcMain.handle('llm:testConnection', async (_event, payload: unknown) => {
    const result = await testLlmConnection(payload as never)
    if (!result.ok) {
      console.error(`[llm:testConnection]\n${result.error}`)
    }
    return result
  })

  ipcMain.handle('embeddings:testConnection', async (_event, payload: unknown) => {
    const result = await testEmbeddingsConnection(payload as never)
    if (!result.ok) {
      console.error(`[embeddings:testConnection]\n${result.error}`)
    }
    return result
  })

  ipcMain.handle('models:fetch', async (_event, payload: unknown) => {
    try {
      return await fetchAvailableModels(payload as FetchModelsRequest)
    } catch (err) {
      console.error(`[models:fetch]\n${formatApiError(err)}`)
      throw err
    }
  })

  // ── MongoDB (chat history) ────────────────────────────────────────

  ipcMain.handle('mongo:testConnection', async (_event, connectionUri: unknown) => {
    return mongoTestConnection(typeof connectionUri === 'string' ? connectionUri : '')
  })

  ipcMain.handle(
    'mongo:ensureDatabase',
    async (_event, payload: { connectionUri?: string; databaseName?: string }) => {
      return mongoEnsureDatabase(
        typeof payload?.connectionUri === 'string' ? payload.connectionUri : '',
        typeof payload?.databaseName === 'string' ? payload.databaseName : ''
      )
    }
  )

  ipcMain.handle(
    'mongo:loadChats',
    async (_event, payload: { connectionUri?: string; databaseName?: string }) => {
      return mongoLoadChats(
        typeof payload?.connectionUri === 'string' ? payload.connectionUri : '',
        typeof payload?.databaseName === 'string' ? payload.databaseName : ''
      )
    }
  )

  ipcMain.handle(
    'mongo:syncChats',
    async (
      _event,
      payload: { connectionUri?: string; databaseName?: string; chats?: Record<string, unknown>[] }
    ) => {
      const chats = Array.isArray(payload?.chats) ? payload.chats : []
      await mongoSyncChats(
        typeof payload?.connectionUri === 'string' ? payload.connectionUri : '',
        typeof payload?.databaseName === 'string' ? payload.databaseName : '',
        chats
      )
    }
  )

  ipcMain.handle(
    'mongo:loadChatTurns',
    async (
      _event,
      payload: { connectionUri?: string; databaseName?: string; chatId?: string }
    ) => {
      return mongoLoadChatTurns(
        typeof payload?.connectionUri === 'string' ? payload.connectionUri : '',
        typeof payload?.databaseName === 'string' ? payload.databaseName : '',
        typeof payload?.chatId === 'string' ? payload.chatId : ''
      )
    }
  )

  // ── Tool Search ────────────────────────────────────────────────────

  ipcMain.handle('tools:search', async (_event, params: ToolSearchParams) => {
    return searchTools(params)
  })

  ipcMain.handle('tools:searchFacets', async () => {
    return searchToolsFacets()
  })

  // Bootstrap tools collection + search index on startup if MongoDB is configured
  void bootstrapToolsCollection()
}
