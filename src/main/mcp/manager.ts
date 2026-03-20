import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { McpServerConfig } from '../config/store'
import type {
  McpToolInfo,
  McpResourceInfo,
  McpResourceTemplateInfo,
  McpPromptInfo,
  McpServerStatus
} from './types'

/** Cursor-style configs often omit `transport`; infer like other MCP clients. */
function normalizeMcpConfig(config: McpServerConfig): McpServerConfig {
  let transport: McpServerConfig['transport'] | undefined = config.transport
  if (!transport) {
    if (config.command?.trim()) transport = 'stdio'
    else if (config.url?.trim()) transport = 'streamable-http'
    else transport = 'stdio'
  }
  return { ...config, transport }
}

function isRemoteMcpTransport(config: McpServerConfig): boolean {
  const t = normalizeMcpConfig(config).transport
  return t === 'streamable-http' || t === 'sse'
}

/** After an MCP HTTP server restarts, the client still sends a stale `mcp-session-id` until we reconnect. */
function looksLikeLostRemoteSessionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('session not found')) return true
  if (lower.includes('invalid session')) return true
  if (lower.includes('unknown session')) return true
  if (lower.includes('session expired')) return true
  // JSON-RPC invalid request often used for bad / missing session
  if (msg.includes('-32600') && lower.includes('session')) return true
  if (err instanceof StreamableHTTPError && typeof err.code === 'number' && err.code === 404) return true
  return false
}

function looksLikeDeadRemoteTransport(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.toLowerCase().includes('connection closed')) return true
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code: unknown }).code
    if (c === -32000) return true
  }
  return false
}

function shouldAttemptRemoteTransportReconnect(err: unknown): boolean {
  return looksLikeLostRemoteSessionError(err) || looksLikeDeadRemoteTransport(err)
}

interface ManagedServer {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport
  status: McpServerStatus
  refreshTimer?: ReturnType<typeof setInterval>
}

class McpManager {
  private servers = new Map<string, ManagedServer>()
  private statusCallback?: (statuses: McpServerStatus[]) => void
  private refreshInProgress = new Set<string>()

  onStatusChange(callback: (statuses: McpServerStatus[]) => void) {
    this.statusCallback = callback
  }

  private notifyStatus() {
    this.statusCallback?.(this.getAllStatuses())
  }

  getAllStatuses(): McpServerStatus[] {
    return Array.from(this.servers.values()).map((s) => s.status)
  }

  async connect(config: McpServerConfig): Promise<McpServerStatus> {
    config = normalizeMcpConfig(config)

    if (this.servers.has(config.id)) {
      await this.disconnect(config.id)
    }

    const status: McpServerStatus = {
      id: config.id,
      name: config.name,
      status: 'connecting',
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: []
    }

    const client = new Client({ name: 'mcpxplore', version: '0.1.0' }, {})
    let transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

    try {
      transport = this.createTransportForConfig(config)

      this.servers.set(config.id, { config, client, transport, status })
      this.notifyStatus()

      await client.connect(transport)

      const [tools, resources, resourceTemplates, prompts] = await Promise.all([
        this.fetchTools(config.id, client),
        this.fetchResources(config.id, client),
        this.fetchResourceTemplates(config.id, client),
        this.fetchPrompts(config.id, client)
      ])

      status.status = 'connected'
      status.tools = tools
      status.resources = resources
      status.resourceTemplates = resourceTemplates
      status.prompts = prompts

      this.startRefreshTimer(config.id)
      this.notifyStatus()

      return status
    } catch (err) {
      status.status = 'error'
      status.error = err instanceof Error ? err.message : String(err)
      this.notifyStatus()
      return status
    }
  }

  async disconnect(serverId: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) return

    this.clearRefreshTimer(serverId)

    try {
      await server.client.close()
    } catch {
      // ignore close errors
    }
    server.status.status = 'disconnected'
    server.status.tools = []
    server.status.resources = []
    server.status.resourceTemplates = []
    server.status.prompts = []
    this.servers.delete(serverId)
    this.notifyStatus()
  }

  private startRefreshTimer(serverId: string): void {
    const server = this.servers.get(serverId)
    if (!server) return

    this.clearRefreshTimer(serverId)

    const intervalSec = server.config.refreshInterval
    if (!intervalSec || intervalSec <= 0) return

    server.refreshTimer = setInterval(() => {
      void this.refreshCapabilities(serverId)
    }, intervalSec * 1000)
  }

  /**
   * When the config store's mcpServers list changes, connected servers still hold the old
   * in-memory config (including refreshInterval). Merge saved configs and restart timers.
   */
  applySavedServerConfigs(configs: McpServerConfig[]): void {
    for (const raw of configs) {
      const config = normalizeMcpConfig(raw)
      const managed = this.servers.get(config.id)
      if (!managed) continue
      managed.config = config
      if (managed.status.status === 'connected') {
        this.startRefreshTimer(config.id)
      }
    }
  }

  private clearRefreshTimer(serverId: string): void {
    const server = this.servers.get(serverId)
    if (server?.refreshTimer) {
      clearInterval(server.refreshTimer)
      server.refreshTimer = undefined
    }
  }

  async refreshCapabilities(serverId: string): Promise<McpServerStatus | null> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') return null
    if (this.refreshInProgress.has(serverId)) return server.status

    this.refreshInProgress.add(serverId)
    try {
      const applyLists = async () => {
        const [tools, resources, resourceTemplates, prompts] = await Promise.all([
          this.listToolsFromClient(serverId, server.client),
          this.listResourcesFromClient(serverId, server.client),
          this.listResourceTemplatesFromClient(serverId, server.client),
          this.listPromptsFromClient(serverId, server.client)
        ])
        server.status.tools = tools
        server.status.resources = resources
        server.status.resourceTemplates = resourceTemplates
        server.status.prompts = prompts
        this.notifyStatus()
      }

      const maxAttempts = 2
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          await applyLists()
          break
        } catch (err) {
          const canRetry =
            attempt < maxAttempts - 1 &&
            isRemoteMcpTransport(server.config) &&
            shouldAttemptRemoteTransportReconnect(err)
          if (canRetry) {
            console.info(
              `[mcp] remote transport error for ${serverId} (${err instanceof Error ? err.message : String(err)}); reconnecting`
            )
            await this.reconnectRemoteMcpSession(serverId)
            continue
          }
          throw err
        }
      }
    } catch (err) {
      // Keep last known capabilities; periodic refresh and manual retry will run again.
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[mcp] refreshCapabilities failed serverId=${serverId}: ${msg}`)
    } finally {
      this.refreshInProgress.delete(serverId)
    }

    return server.status
  }

  private createTransportForConfig(
    config: McpServerConfig
  ): StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport {
    const c = normalizeMcpConfig(config)
    if (c.transport === 'stdio') {
      const extraEnv = c.env
      const cleaned =
        extraEnv &&
        Object.fromEntries(
          Object.entries(extraEnv).filter((entry): entry is [string, string] => {
            const v = entry[1]
            return typeof v === 'string' && v.length > 0
          })
        )
      return new StdioClientTransport({
        command: c.command!,
        args: c.args ?? [],
        env: cleaned && Object.keys(cleaned).length > 0 ? cleaned : undefined
      })
    }
    if (c.transport === 'streamable-http') {
      return new StreamableHTTPClientTransport(new URL(c.url!))
    }
    return new SSEClientTransport(new URL(c.url!))
  }

  /**
   * Close the current remote transport and connect with a new one so Streamable HTTP gets a
   * fresh session (e.g. after the MCP server process restarted).
   */
  private async reconnectRemoteMcpSession(serverId: string): Promise<void> {
    const server = this.servers.get(serverId)
    if (!server) throw new Error(`MCP server not found: ${serverId}`)
    const config = normalizeMcpConfig(server.config)
    if (!isRemoteMcpTransport(config)) return

    try {
      await server.client.close()
    } catch {
      // ignore
    }

    const transport = this.createTransportForConfig(config)
    server.transport = transport
    await server.client.connect(transport)
  }

  private async listToolsFromClient(serverId: string, client: Client): Promise<McpToolInfo[]> {
    const result = await client.listTools()
    return (result.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      serverId
    }))
  }

  private async listResourcesFromClient(serverId: string, client: Client): Promise<McpResourceInfo[]> {
    const result = await client.listResources()
    return (result.resources ?? []).map((resource) => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
      serverId
    }))
  }

  private async listResourceTemplatesFromClient(
    serverId: string,
    client: Client
  ): Promise<McpResourceTemplateInfo[]> {
    const result = await client.listResourceTemplates()
    return (result.resourceTemplates ?? []).map((t) => ({
      uriTemplate: t.uriTemplate,
      name: t.name,
      description: t.description,
      mimeType: t.mimeType,
      serverId
    }))
  }

  private async listPromptsFromClient(serverId: string, client: Client): Promise<McpPromptInfo[]> {
    const result = await client.listPrompts()
    return (result.prompts ?? []).map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments?.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required
      })),
      serverId
    }))
  }

  private async fetchTools(serverId: string, client: Client): Promise<McpToolInfo[]> {
    try {
      return await this.listToolsFromClient(serverId, client)
    } catch {
      return []
    }
  }

  private async fetchResources(serverId: string, client: Client): Promise<McpResourceInfo[]> {
    try {
      return await this.listResourcesFromClient(serverId, client)
    } catch {
      return []
    }
  }

  private async fetchResourceTemplates(
    serverId: string,
    client: Client
  ): Promise<McpResourceTemplateInfo[]> {
    try {
      return await this.listResourceTemplatesFromClient(serverId, client)
    } catch {
      return []
    }
  }

  private async fetchPrompts(serverId: string, client: Client): Promise<McpPromptInfo[]> {
    try {
      return await this.listPromptsFromClient(serverId, client)
    } catch {
      return []
    }
  }

  async listTools(serverId: string): Promise<McpToolInfo[]> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') return []
    return server.status.tools
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): Promise<unknown> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') {
      throw new Error(`Server ${serverId} is not connected`)
    }
    const result = await server.client.callTool(
      { name: toolName, arguments: args },
      undefined,
      options?.signal ? { signal: options.signal } : undefined
    )
    return result
  }

  async listResources(serverId: string): Promise<McpResourceInfo[]> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') return []
    return server.status.resources
  }

  async readResource(serverId: string, uri: string): Promise<unknown> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') {
      throw new Error(`Server ${serverId} is not connected`)
    }
    const result = await server.client.readResource({ uri })
    return result
  }

  async listPrompts(serverId: string): Promise<McpPromptInfo[]> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') return []
    return server.status.prompts
  }

  async getPrompt(
    serverId: string,
    name: string,
    args: Record<string, string>
  ): Promise<unknown> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') {
      throw new Error(`Server ${serverId} is not connected`)
    }
    const result = await server.client.getPrompt({ name, arguments: args })
    return result
  }

  async listResourceTemplates(serverId: string): Promise<McpResourceTemplateInfo[]> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') return []
    return server.status.resourceTemplates
  }

  getClient(serverId: string): Client | undefined {
    return this.servers.get(serverId)?.client
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.servers.keys())
    await Promise.all(ids.map((id) => this.disconnect(id)))
  }
}

let instance: McpManager | null = null

export function getMcpManager(): McpManager {
  if (!instance) {
    instance = new McpManager()
  }
  return instance
}
