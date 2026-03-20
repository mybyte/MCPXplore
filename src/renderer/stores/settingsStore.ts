import { create } from 'zustand'

export interface LlmProvider {
  id: string
  name: string
  type: 'openai' | 'azure' | 'fireworks' | 'openrouter'
  baseUrl: string
  apiKey: string
  models: string[]
  apiVersion?: string
}

export interface EmbeddingsProvider {
  id: string
  name: string
  type: 'openai' | 'azure' | 'fireworks' | 'openrouter'
  baseUrl: string
  apiKey: string
  models: string[]
  apiVersion?: string
}

export interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

export interface MongoSettings {
  connectionUri: string
  chatDatabase: string
}

interface SettingsState {
  llmProviders: LlmProvider[]
  embeddingsProviders: EmbeddingsProvider[]
  mcpServers: McpServerConfig[]
  mongo: MongoSettings
  setLlmProviders: (providers: LlmProvider[]) => void
  addLlmProvider: (provider: LlmProvider) => void
  updateLlmProvider: (id: string, patch: Partial<LlmProvider>) => void
  removeLlmProvider: (id: string) => void
  setEmbeddingsProviders: (providers: EmbeddingsProvider[]) => void
  addEmbeddingsProvider: (provider: EmbeddingsProvider) => void
  updateEmbeddingsProvider: (id: string, patch: Partial<EmbeddingsProvider>) => void
  removeEmbeddingsProvider: (id: string) => void
  setMcpServers: (servers: McpServerConfig[]) => void
  addMcpServer: (server: McpServerConfig) => void
  updateMcpServer: (id: string, patch: Partial<McpServerConfig>) => void
  removeMcpServer: (id: string) => void
  setMongo: (mongo: MongoSettings) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  llmProviders: [],
  embeddingsProviders: [],
  mcpServers: [],
  mongo: { connectionUri: '', chatDatabase: '' },

  setLlmProviders: (providers) => set({ llmProviders: providers }),
  addLlmProvider: (provider) =>
    set((s) => ({ llmProviders: [...s.llmProviders, provider] })),
  updateLlmProvider: (id, patch) =>
    set((s) => ({
      llmProviders: s.llmProviders.map((p) => (p.id === id ? { ...p, ...patch } : p))
    })),
  removeLlmProvider: (id) =>
    set((s) => ({ llmProviders: s.llmProviders.filter((p) => p.id !== id) })),

  setEmbeddingsProviders: (providers) => set({ embeddingsProviders: providers }),
  addEmbeddingsProvider: (provider) =>
    set((s) => ({ embeddingsProviders: [...s.embeddingsProviders, provider] })),
  updateEmbeddingsProvider: (id, patch) =>
    set((s) => ({
      embeddingsProviders: s.embeddingsProviders.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      )
    })),
  removeEmbeddingsProvider: (id) =>
    set((s) => ({ embeddingsProviders: s.embeddingsProviders.filter((p) => p.id !== id) })),

  setMcpServers: (servers) => set({ mcpServers: servers }),
  addMcpServer: (server) =>
    set((s) => ({ mcpServers: [...s.mcpServers, server] })),
  updateMcpServer: (id, patch) =>
    set((s) => ({
      mcpServers: s.mcpServers.map((srv) => (srv.id === id ? { ...srv, ...patch } : srv))
    })),
  removeMcpServer: (id) =>
    set((s) => ({ mcpServers: s.mcpServers.filter((srv) => srv.id !== id) })),

  setMongo: (mongo) => set({ mongo })
}))
