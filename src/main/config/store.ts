import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { encryptSecret, decryptSecret } from './secrets'

export interface MongoSettings {
  connectionUri: string
  chatDatabase: string
}

export interface AppConfig {
  llmProviders: LlmProviderConfig[]
  embeddingsProviders: EmbeddingsProviderConfig[]
  mcpServers: McpServerConfig[]
  toolEmbeddings: ToolEmbeddingConfig[]
  chats: ChatMeta[]
  mongo: MongoSettings
  /** Server IDs that were connected when the app last ran — auto-reconnected on launch. */
  connectedServerIds: string[]
}

export interface LlmProviderConfig {
  id: string
  name: string
  type: 'openai' | 'azure' | 'fireworks' | 'openrouter'
  baseUrl: string
  apiKey: string
  models: string[]
  apiVersion?: string
}

export interface EmbeddingsProviderConfig {
  id: string
  name: string
  type: 'openai' | 'azure' | 'fireworks' | 'openrouter' | 'voyage' | 'voyage-mongo'
  baseUrl: string
  apiKey: string
  models: string[]
  apiVersion?: string
}

export interface ToolEmbeddingConfig {
  id: string
  providerId: string
  model: string
  dimensions: number
  /** Derived: model with special chars replaced by underscores, plus dimensions. */
  fieldName: string
}

export function toEmbeddingFieldName(model: string, dimensions: number): string {
  return `${model.replace(/[^a-zA-Z0-9]/g, '_')}_${dimensions}`
}

export interface McpServerConfig {
  id: string
  name: string
  transport: 'stdio' | 'sse' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  /** Seconds between automatic re-fetches of tools/resources/prompts. 0 or undefined = disabled. */
  refreshInterval?: number
}

export type McpToolsMode = 'all' | 'pick' | 'semantic' | 'agentic'

export interface ToolSelectionConfig {
  semanticContextTokens: number
  semanticToolLimit: number
  semanticScoreCutoff: number
  semanticEmbeddingFieldName: string

  agenticContextTokens: number
  agenticProviderId: string
  agenticModelId: string
  agenticSearchMode: 'keyword' | 'vector' | 'hybrid'
  agenticToolLimit: number
  agenticScoreCutoff: number
  agenticEmbeddingFieldName: string
  agenticHybridWeights: { keyword: number; vector: number }
}

export const DEFAULT_TOOL_SELECTION_CONFIG: ToolSelectionConfig = {
  semanticContextTokens: 500,
  semanticToolLimit: 5,
  semanticScoreCutoff: 0,
  semanticEmbeddingFieldName: '',

  agenticContextTokens: 5000,
  agenticProviderId: '',
  agenticModelId: '',
  agenticSearchMode: 'keyword',
  agenticToolLimit: 10,
  agenticScoreCutoff: 0,
  agenticEmbeddingFieldName: '',
  agenticHybridWeights: { keyword: 1, vector: 1 }
}

export interface ChatMeta {
  id: string
  title: string
  mcpToolsMode: McpToolsMode
  enabledTools: string[]
  providerId: string
  modelId: string
  systemPrompt: string
  agenticSystemPrompt: string
  toolSelectionConfig: ToolSelectionConfig
  createdAt: number
}

const VALID_TOOLS_MODES = new Set<McpToolsMode>(['all', 'pick', 'semantic', 'agentic'])

function normalizeToolSelectionConfig(raw: unknown): ToolSelectionConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TOOL_SELECTION_CONFIG }
  const c = raw as Partial<ToolSelectionConfig>
  return {
    semanticContextTokens: typeof c.semanticContextTokens === 'number' ? c.semanticContextTokens : DEFAULT_TOOL_SELECTION_CONFIG.semanticContextTokens,
    semanticToolLimit: typeof c.semanticToolLimit === 'number' ? c.semanticToolLimit : DEFAULT_TOOL_SELECTION_CONFIG.semanticToolLimit,
    semanticScoreCutoff: typeof c.semanticScoreCutoff === 'number' ? c.semanticScoreCutoff : DEFAULT_TOOL_SELECTION_CONFIG.semanticScoreCutoff,
    semanticEmbeddingFieldName: typeof c.semanticEmbeddingFieldName === 'string' ? c.semanticEmbeddingFieldName : '',
    agenticContextTokens: typeof c.agenticContextTokens === 'number' ? c.agenticContextTokens : DEFAULT_TOOL_SELECTION_CONFIG.agenticContextTokens,
    agenticProviderId: typeof c.agenticProviderId === 'string' ? c.agenticProviderId : '',
    agenticModelId: typeof c.agenticModelId === 'string' ? c.agenticModelId : '',
    agenticSearchMode: c.agenticSearchMode === 'keyword' || c.agenticSearchMode === 'vector' || c.agenticSearchMode === 'hybrid' ? c.agenticSearchMode : 'keyword',
    agenticToolLimit: typeof c.agenticToolLimit === 'number' ? c.agenticToolLimit : DEFAULT_TOOL_SELECTION_CONFIG.agenticToolLimit,
    agenticScoreCutoff: typeof c.agenticScoreCutoff === 'number' ? c.agenticScoreCutoff : DEFAULT_TOOL_SELECTION_CONFIG.agenticScoreCutoff,
    agenticEmbeddingFieldName: typeof c.agenticEmbeddingFieldName === 'string' ? c.agenticEmbeddingFieldName : '',
    agenticHybridWeights: c.agenticHybridWeights && typeof c.agenticHybridWeights === 'object'
      ? { keyword: Number(c.agenticHybridWeights.keyword) || 1, vector: Number(c.agenticHybridWeights.vector) || 1 }
      : { ...DEFAULT_TOOL_SELECTION_CONFIG.agenticHybridWeights }
  }
}

function normalizeChatMeta(entry: unknown): ChatMeta {
  const c = entry as Partial<ChatMeta>
  const enabledTools = Array.isArray(c.enabledTools) ? c.enabledTools : []
  const mcpToolsMode: McpToolsMode =
    typeof c.mcpToolsMode === 'string' && VALID_TOOLS_MODES.has(c.mcpToolsMode as McpToolsMode)
      ? (c.mcpToolsMode as McpToolsMode)
      : enabledTools.length > 0
        ? 'pick'
        : 'all'
  return {
    id: String(c.id ?? ''),
    title: String(c.title ?? ''),
    mcpToolsMode,
    enabledTools,
    providerId: String(c.providerId ?? ''),
    modelId: String(c.modelId ?? ''),
    systemPrompt: typeof c.systemPrompt === 'string' ? c.systemPrompt : '',
    agenticSystemPrompt: typeof c.agenticSystemPrompt === 'string' ? c.agenticSystemPrompt : '',
    toolSelectionConfig: normalizeToolSelectionConfig((c as Record<string, unknown>).toolSelectionConfig),
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now()
  }
}

function decryptConfigSecrets(config: AppConfig): void {
  for (const p of config.llmProviders) {
    if (p.apiKey) p.apiKey = decryptSecret(p.apiKey)
  }
  for (const p of config.embeddingsProviders) {
    if (p.apiKey) p.apiKey = decryptSecret(p.apiKey)
  }
  for (const s of config.mcpServers) {
    if (s.env) {
      for (const key of Object.keys(s.env)) {
        s.env[key] = decryptSecret(s.env[key])
      }
    }
  }
  if (config.mongo.connectionUri) {
    config.mongo.connectionUri = decryptSecret(config.mongo.connectionUri)
  }
}

function encryptConfigSecrets(config: AppConfig): AppConfig {
  const clone: AppConfig = JSON.parse(JSON.stringify(config))
  for (const p of clone.llmProviders) {
    if (p.apiKey) p.apiKey = encryptSecret(p.apiKey)
  }
  for (const p of clone.embeddingsProviders) {
    if (p.apiKey) p.apiKey = encryptSecret(p.apiKey)
  }
  for (const s of clone.mcpServers) {
    if (s.env) {
      for (const key of Object.keys(s.env)) {
        s.env[key] = encryptSecret(s.env[key])
      }
    }
  }
  if (clone.mongo.connectionUri) {
    clone.mongo.connectionUri = encryptSecret(clone.mongo.connectionUri)
  }
  return clone
}

export const REDACTED = '***'

/**
 * Replace user:password in a MongoDB URI with ***:*** so the host/db
 * remain visible in the UI while credentials are hidden.
 * Falls back to the generic REDACTED sentinel if parsing fails.
 */
export function maskMongoUri(uri: string): string {
  if (!uri) return uri
  const m = uri.match(/^(mongodb(?:\+srv)?:\/\/)([^@]+)@(.+)$/)
  if (m) return `${m[1]}***:***@${m[3]}`
  return REDACTED
}

export type SecretsScope =
  | { type: 'llm'; id: string }
  | { type: 'embeddings'; id: string }
  | { type: 'mcp'; id: string }
  | { type: 'mongo' }

const DEFAULT_CONFIG: AppConfig = {
  llmProviders: [],
  embeddingsProviders: [],
  mcpServers: [],
  toolEmbeddings: [],
  chats: [],
  mongo: { connectionUri: '', chatDatabase: '' },
  connectedServerIds: []
}

class ConfigStore {
  private configPath: string
  private config: AppConfig

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.configPath = join(userDataPath, 'config.json')
    this.config = this.load()
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf-8')
        const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as AppConfig & Record<string, unknown>
        if (Array.isArray(parsed.chats)) {
          parsed.chats = parsed.chats.map(normalizeChatMeta)
        }
        const m = parsed.mongo as Partial<MongoSettings> | undefined
        parsed.mongo = {
          connectionUri: typeof m?.connectionUri === 'string' ? m.connectionUri : '',
          chatDatabase: typeof m?.chatDatabase === 'string' ? m.chatDatabase : ''
        }
        if (!Array.isArray(parsed.toolEmbeddings)) {
          parsed.toolEmbeddings = []
        }
        if (!Array.isArray(parsed.connectedServerIds)) {
          parsed.connectedServerIds = []
        }
        decryptConfigSecrets(parsed)
        return parsed
      }
    } catch {
      console.error('Failed to load config, using defaults')
    }
    return { ...DEFAULT_CONFIG }
  }

  private save(): void {
    try {
      const toWrite = encryptConfigSecrets(this.config)
      writeFileSync(this.configPath, JSON.stringify(toWrite, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }

  getAll(): AppConfig {
    return this.config
  }

  getRedactedAll(): AppConfig {
    const clone: AppConfig = JSON.parse(JSON.stringify(this.config))
    for (const p of clone.llmProviders) {
      if (p.apiKey) p.apiKey = REDACTED
    }
    for (const p of clone.embeddingsProviders) {
      if (p.apiKey) p.apiKey = REDACTED
    }
    for (const s of clone.mcpServers) {
      if (s.env) {
        for (const key of Object.keys(s.env)) {
          if (s.env[key]) s.env[key] = REDACTED
        }
      }
    }
    if (clone.mongo.connectionUri) {
      clone.mongo.connectionUri = maskMongoUri(clone.mongo.connectionUri)
    }
    return clone
  }

  getSecrets(scope: SecretsScope): Record<string, string> {
    switch (scope.type) {
      case 'llm': {
        const p = this.config.llmProviders.find((x) => x.id === scope.id)
        return p ? { apiKey: p.apiKey } : {}
      }
      case 'embeddings': {
        const p = this.config.embeddingsProviders.find((x) => x.id === scope.id)
        return p ? { apiKey: p.apiKey } : {}
      }
      case 'mcp': {
        const s = this.config.mcpServers.find((x) => x.id === scope.id)
        return s?.env ? { ...s.env } : {}
      }
      case 'mongo':
        return { connectionUri: this.config.mongo.connectionUri }
      default:
        return {}
    }
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value
    this.save()
  }
}

let instance: ConfigStore | null = null

export function getConfigStore(): ConfigStore {
  if (!instance) {
    instance = new ConfigStore()
  }
  return instance
}
