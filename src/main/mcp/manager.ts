import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { McpServerConfig } from '../config/store'
import type { McpToolInfo, McpResourceInfo, McpServerStatus } from './types'

interface ManagedServer {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport
  status: McpServerStatus
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
    if (this.servers.has(config.id)) {
      await this.disconnect(config.id)
    }

    const status: McpServerStatus = {
      id: config.id,
      name: config.name,
      status: 'connecting',
      tools: [],
      resources: []
    }

    const client = new Client({ name: 'mcpxplore', version: '0.1.0' }, {})
    let transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

    try {
      if (config.transport === 'stdio') {
        transport = new StdioClientTransport({
          command: config.command!,
          args: config.args,
          env: { ...process.env, ...(config.env ?? {}) } as Record<string, string>
        })
      } else if (config.transport === 'streamable-http') {
        transport = new StreamableHTTPClientTransport(new URL(config.url!))
      } else {
        transport = new SSEClientTransport(new URL(config.url!))
      }

      this.servers.set(config.id, { config, client, transport, status })
      this.notifyStatus()

      await client.connect(transport)

      const tools = await this.fetchTools(config.id, client)
      const resources = await this.fetchResources(config.id, client)

      status.status = 'connected'
      status.tools = tools
      status.resources = resources
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

    try {
      await server.client.close()
    } catch {
      // ignore close errors
    }
    server.status.status = 'disconnected'
    server.status.tools = []
    server.status.resources = []
    this.servers.delete(serverId)
    this.notifyStatus()
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

  async listTools(serverId: string): Promise<McpToolInfo[]> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') return []
    return server.status.tools
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const server = this.servers.get(serverId)
    if (!server || server.status.status !== 'connected') {
      throw new Error(`Server ${serverId} is not connected`)
    }
    const result = await server.client.callTool({ name: toolName, arguments: args })
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
