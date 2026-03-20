export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  serverId: string
}

export interface McpResourceInfo {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface McpResourceTemplateInfo {
  uriTemplate: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface McpPromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface McpPromptInfo {
  name: string
  description?: string
  arguments?: McpPromptArgument[]
  serverId: string
}

export interface McpServerStatus {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: string
  tools: McpToolInfo[]
  resources: McpResourceInfo[]
  resourceTemplates: McpResourceTemplateInfo[]
  prompts: McpPromptInfo[]
  fingerprints?: CapabilityFingerprints
}

// ── Fingerprinting & change detection ────────────────────────────────

export interface CapabilityFingerprints {
  /** Aggregate hash of all individual capability fingerprints. */
  server: string
  /** tool name -> content hash */
  tools: Record<string, string>
  /** resource URI -> content hash */
  resources: Record<string, string>
  /** resource-template URI template -> content hash */
  resourceTemplates: Record<string, string>
  /** prompt name -> content hash */
  prompts: Record<string, string>
}

export interface ItemChanges {
  added: string[]
  removed: string[]
  modified: string[]
}

export interface CapabilityChanges {
  serverId: string
  serverName: string
  previousFingerprint: string | null
  currentFingerprint: string
  tools: ItemChanges
  resources: ItemChanges
  resourceTemplates: ItemChanges
  prompts: ItemChanges
}
