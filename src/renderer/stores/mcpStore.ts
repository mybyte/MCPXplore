import { create } from 'zustand'

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  serverId: string
}

export interface McpResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface McpServer {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: string
  tools: McpTool[]
  resources: McpResource[]
}

interface McpState {
  servers: McpServer[]
  activeServerId: string | null
  setActiveServer: (id: string | null) => void
  setServers: (servers: McpServer[]) => void
  updateServer: (id: string, patch: Partial<McpServer>) => void
  allTools: () => McpTool[]
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  activeServerId: null,

  setActiveServer: (id) => set({ activeServerId: id }),

  setServers: (servers) => set({ servers }),

  updateServer: (id, patch) =>
    set((s) => ({
      servers: s.servers.map((srv) => (srv.id === id ? { ...srv, ...patch } : srv))
    })),

  allTools: () => get().servers.flatMap((s) => s.tools)
}))
