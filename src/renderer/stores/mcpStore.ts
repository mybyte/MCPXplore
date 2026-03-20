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

export interface McpResourceTemplate {
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

export interface McpPrompt {
  name: string
  description?: string
  arguments?: McpPromptArgument[]
  serverId: string
}

export interface McpServer {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  error?: string
  tools: McpTool[]
  resources: McpResource[]
  resourceTemplates: McpResourceTemplate[]
  prompts: McpPrompt[]
}

export type ExplorerTab = 'tools' | 'resources' | 'prompts'

export type ExplorerSelection =
  | { type: 'tool'; serverId: string; name: string }
  | { type: 'resource'; serverId: string; uri: string }
  | { type: 'prompt'; serverId: string; name: string }
  | null

export interface CallHistoryEntry {
  id: string
  timestamp: number
  serverId: string
  serverName: string
  kind: 'tool' | 'resource' | 'prompt'
  itemName: string
  args: Record<string, unknown>
  result: unknown
  error?: string
  elapsed: number
}

interface McpState {
  servers: McpServer[]
  activeServerId: string | null
  explorerTab: ExplorerTab
  selection: ExplorerSelection
  callHistory: CallHistoryEntry[]

  setActiveServer: (id: string | null) => void
  setExplorerTab: (tab: ExplorerTab) => void
  setSelection: (sel: ExplorerSelection) => void
  setServers: (servers: McpServer[]) => void
  updateServer: (id: string, patch: Partial<McpServer>) => void
  allTools: () => McpTool[]
  addHistoryEntry: (entry: CallHistoryEntry) => void
  clearHistory: () => void
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  activeServerId: null,
  explorerTab: 'tools',
  selection: null,
  callHistory: [],

  setActiveServer: (id) => set({ activeServerId: id, selection: null }),

  setExplorerTab: (tab) => set({ explorerTab: tab, selection: null }),

  setSelection: (sel) => set({ selection: sel }),

  setServers: (servers) => {
    const state = get()
    const next: Partial<McpState> = { servers }
    if (state.activeServerId && !servers.find((s) => s.id === state.activeServerId)) {
      next.activeServerId = null
      next.selection = null
    }
    set(next)
  },

  updateServer: (id, patch) =>
    set((s) => ({
      servers: s.servers.map((srv) => (srv.id === id ? { ...srv, ...patch } : srv))
    })),

  allTools: () => get().servers.flatMap((s) => s.tools),

  addHistoryEntry: (entry) =>
    set((s) => ({ callHistory: [entry, ...s.callHistory].slice(0, 200) })),

  clearHistory: () => set({ callHistory: [] })
}))
