import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
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
      if (config.transport === 'stdio') {
        // Let the SDK merge getDefaultEnvironment() + config.env — do not pass full
        // process.env (Electron pollutes the child and breaks clients like docker -e VAR).
        const extraEnv = config.env
        const cleaned =
          extraEnv &&
          Object.fromEntries(
            Object.entries(extraEnv).filter((entry): entry is [string, string] => {
              const v = entry[1]
              return typeof v === 'string' && v.length > 0
            })
          )
        transport = new StdioClientTransport({
          command: config.command!,
          args: config.args ?? [],
          env: cleaned && Object.keys(cleaned).length > 0 ? cleaned : undefined
        })
      } else if (config.transport === 'streamable-http') {
        transport = new StreamableHTTPClientTransport(new URL(config.url!))
      } else {
        transport = new SSEClientTransport(new URL(config.url!))
      }

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
      this.refreshCapabilities(serverId).catch(() => {})
    }, intervalSec * 1000)
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

    const [tools, resources, resourceTemplates, prompts] = await Promise.all([
      this.fetchTools(serverId, server.client),
      this.fetchResources(serverId, server.client),
      this.fetchResourceTemplates(serverId, server.client),
      this.fetchPrompts(serverId, server.client)
    ])

    server.status.tools = tools
    server.status.resources = resources
    server.status.resourceTemplates = resourceTemplates
    server.status.prompts = prompts
    this.notifyStatus()

    return server.status
  }

  private async fetchTools(serverId: string, client: Client): Promise<McpToolInfo[]> {
    try {
      const result = await client.listTools()
      return (result.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        serverId
      }))
    } catch {
      return []
    }
  }

  private async fetchResources(serverId: string, client: Client): Promise<McpResourceInfo[]> {
    try {
      const result = await client.listResources()
      return (result.resources ?? []).map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverId
      }))
    } catch {
      return []
    }
  }

  private async fetchResourceTemplates(
    serverId: string,
    client: Client
  ): Promise<McpResourceTemplateInfo[]> {
    try {
      const result = await client.listResourceTemplates()
      return (result.resourceTemplates ?? []).map((t) => ({
        uriTemplate: t.uriTemplate,
        name: t.name,
        description: t.description,
        mimeType: t.mimeType,
        serverId
      }))
    } catch {
      return []
    }
  }

  private async fetchPrompts(serverId: string, client: Client): Promise<McpPromptInfo[]> {
    try {
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
