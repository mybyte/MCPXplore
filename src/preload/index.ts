import { contextBridge, ipcRenderer } from 'electron'

const api = {
  /** Host OS — used for macOS-only UI (e.g. title bar drag with hiddenInset). */
  platform: process.platform,

  // Config
  configGetAll: () => ipcRenderer.invoke('config:getAll'),
  configGet: (key: string) => ipcRenderer.invoke('config:get', key),
  configSet: (key: string, value: unknown) => ipcRenderer.invoke('config:set', key, value),
  configUpdate: (patch: Record<string, unknown>) => ipcRenderer.invoke('config:update', patch),

  // Typed config shortcuts
  setLlmProviders: (providers: unknown[]) =>
    ipcRenderer.invoke('config:llmProviders:set', providers),
  setEmbeddingsProviders: (providers: unknown[]) =>
    ipcRenderer.invoke('config:embeddingsProviders:set', providers),
  setMcpServers: (servers: unknown[]) => ipcRenderer.invoke('config:mcpServers:set', servers),
  setChats: (chats: unknown[]) => ipcRenderer.invoke('config:chats:set', chats),

  // MCP operations
  mcpConnect: (serverId: string) => ipcRenderer.invoke('mcp:connect', serverId),
  mcpDisconnect: (serverId: string) => ipcRenderer.invoke('mcp:disconnect', serverId),
  mcpConnectAll: () => ipcRenderer.invoke('mcp:connectAll'),
  mcpGetStatuses: () => ipcRenderer.invoke('mcp:getStatuses'),
  mcpReconnectSaved: () => ipcRenderer.invoke('mcp:reconnectSaved'),
  mcpRefreshCapabilities: (serverId: string) =>
    ipcRenderer.invoke('mcp:refreshCapabilities', serverId),
  mcpListTools: (serverId: string) => ipcRenderer.invoke('mcp:listTools', serverId),
  mcpCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp:callTool', serverId, toolName, args),
  mcpListResources: (serverId: string) => ipcRenderer.invoke('mcp:listResources', serverId),
  mcpReadResource: (serverId: string, uri: string) =>
    ipcRenderer.invoke('mcp:readResource', serverId, uri),
  mcpListPrompts: (serverId: string) => ipcRenderer.invoke('mcp:listPrompts', serverId),
  mcpGetPrompt: (serverId: string, name: string, args: Record<string, string>) =>
    ipcRenderer.invoke('mcp:getPrompt', serverId, name, args),
  mcpListResourceTemplates: (serverId: string) =>
    ipcRenderer.invoke('mcp:listResourceTemplates', serverId),

  // LLM chat operations (wired in Phase 5)
  chatSend: (chatId: string, message: string, options: Record<string, unknown>) =>
    ipcRenderer.invoke('llm:send', chatId, message, options),
  chatStop: (chatId: string) => ipcRenderer.invoke('llm:stop', chatId),
  llmTestConnection: (payload: Record<string, unknown>) =>
    ipcRenderer.invoke('llm:testConnection', payload),
  embeddingsTestConnection: (payload: Record<string, unknown>) =>
    ipcRenderer.invoke('embeddings:testConnection', payload),
  fetchModels: (config: { type: string; baseUrl: string; apiKey: string; apiVersion?: string }) =>
    ipcRenderer.invoke('models:fetch', config) as Promise<string[]>,

  mongoTestConnection: (connectionUri: string) =>
    ipcRenderer.invoke('mongo:testConnection', connectionUri),
  mongoEnsureDatabase: (payload: { connectionUri: string; databaseName: string }) =>
    ipcRenderer.invoke('mongo:ensureDatabase', payload),
  mongoLoadChats: (payload: { connectionUri: string; databaseName: string }) =>
    ipcRenderer.invoke('mongo:loadChats', payload),
  mongoSyncChats: (payload: {
    connectionUri: string
    databaseName: string
    chats: Record<string, unknown>[]
  }) => ipcRenderer.invoke('mongo:syncChats', payload),

  // Streaming events from main -> renderer
  onChatStream: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown) => callback(event)
    ipcRenderer.on('llm:stream', handler)
    return () => ipcRenderer.removeListener('llm:stream', handler)
  },

  onMcpStatus: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown) => callback(event)
    ipcRenderer.on('mcp:status', handler)
    return () => ipcRenderer.removeListener('mcp:status', handler)
  },

  /** Structured logs from the renderer; main prints them so devs see UI issues in the terminal. */
  logFromRenderer: (entry: {
    level: 'error' | 'warn' | 'info' | 'debug'
    source: string
    message: string
    detail?: string
    stack?: string
  }) => ipcRenderer.invoke('renderer:log', entry)
}

contextBridge.exposeInMainWorld('api', api)

export type McpXploreAPI = typeof api
