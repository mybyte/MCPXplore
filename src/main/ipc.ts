import { ipcMain, BrowserWindow } from 'electron'
import { getConfigStore } from './config/store'
import { getMcpManager } from './mcp/manager'
import { handleChatSend, stopChat, testLlmConnection } from './llm/chat'
import { testEmbeddingsConnection } from './llm/embeddings'
import { formatApiError } from './llm/format-error'
import type { AppConfig } from './config/store'
import {
  mongoEnsureDatabase,
  mongoLoadChats,
  mongoSyncChats,
  mongoTestConnection
} from './mongo/service'

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

  ipcMain.handle('renderer:log', (_event, entry: unknown) => {
    logRendererEntry(entry)
  })

  // ── Config ─────────────────────────────────────────────────────────

  ipcMain.handle('config:getAll', () => store.getAll())

  ipcMain.handle('config:get', (_event, key: keyof AppConfig) => store.get(key))

  ipcMain.handle('config:set', (_event, key: keyof AppConfig, value: unknown) => {
    store.set(key, value as AppConfig[typeof key])
  })

  ipcMain.handle('config:update', (_event, patch: Partial<AppConfig>) => {
    store.update(patch)
  })

  ipcMain.handle('config:llmProviders:set', (_event, providers) => {
    store.set('llmProviders', providers)
  })

  ipcMain.handle('config:embeddingsProviders:set', (_event, providers) => {
    store.set('embeddingsProviders', providers)
  })

  ipcMain.handle('config:mcpServers:set', (_event, servers) => {
    store.set('mcpServers', servers)
  })

  ipcMain.handle('config:chats:set', (_event, chats) => {
    store.set('chats', chats)
  })

  // ── MCP ────────────────────────────────────────────────────────────

  ipcMain.handle('mcp:connect', async (_event, serverId: string) => {
    const configs = store.get('mcpServers')
    const config = configs.find((s) => s.id === serverId)
    if (!config) throw new Error(`MCP server config not found: ${serverId}`)
    return mcpManager.connect(config)
  })

  ipcMain.handle('mcp:disconnect', async (_event, serverId: string) => {
    await mcpManager.disconnect(serverId)
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

  ipcMain.handle('mcp:getStatuses', () => {
    return mcpManager.getAllStatuses()
  })

  ipcMain.handle('mcp:connectAll', async () => {
    const configs = store.get('mcpServers')
    const results = await Promise.allSettled(configs.map((c) => mcpManager.connect(c)))
    return results.map((r) => (r.status === 'fulfilled' ? r.value : { error: String(r.reason) }))
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
}
