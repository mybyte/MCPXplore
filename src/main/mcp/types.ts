export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  serverId: string
}

export interface McpResourceInfo {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface McpServerStatus {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: string
  tools: McpToolInfo[]
  resources: McpResourceInfo[]
}
