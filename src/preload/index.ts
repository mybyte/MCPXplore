import { contextBridge, ipcRenderer } from 'electron'

const api = {
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
  mcpListTools: (serverId: string) => ipcRenderer.invoke('mcp:listTools', serverId),
  mcpCallTool: (serverId: string, toolName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp:callTool', serverId, toolName, args),
  mcpListResources: (serverId: string) => ipcRenderer.invoke('mcp:listResources', serverId),
  mcpReadResource: (serverId: string, uri: string) =>
    ipcRenderer.invoke('mcp:readResource', serverId, uri),

  // LLM chat operations (wired in Phase 5)
  chatSend: (chatId: string, message: string, options: Record<string, unknown>) =>
    ipcRenderer.invoke('llm:send', chatId, message, options),
  chatStop: (chatId: string) => ipcRenderer.invoke('llm:stop', chatId),

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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type McpXploreAPI = typeof api
