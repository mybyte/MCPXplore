import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

export interface MongoSettings {
  connectionUri: string
  chatDatabase: string
}

export interface AppConfig {
  llmProviders: LlmProviderConfig[]
  embeddingsProviders: EmbeddingsProviderConfig[]
  mcpServers: McpServerConfig[]
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

export interface ChatMeta {
  id: string
  title: string
  mcpToolsMode: 'all' | 'pick'
  enabledTools: string[]
  providerId: string
  modelId: string
  createdAt: number
}

function normalizeChatMeta(entry: unknown): ChatMeta {
  const c = entry as Partial<ChatMeta>
  const enabledTools = Array.isArray(c.enabledTools) ? c.enabledTools : []
  const mcpToolsMode: 'all' | 'pick' =
    c.mcpToolsMode === 'pick' || c.mcpToolsMode === 'all'
      ? c.mcpToolsMode
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
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now()
  }
}

const DEFAULT_CONFIG: AppConfig = {
  llmProviders: [],
  embeddingsProviders: [],
  mcpServers: [],
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
        if (!Array.isArray(parsed.connectedServerIds)) {
          parsed.connectedServerIds = []
        }
        return parsed
      }
    } catch {
      console.error('Failed to load config, using defaults')
    }
    return { ...DEFAULT_CONFIG }
  }

  private save(): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }

  getAll(): AppConfig {
    return this.config
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value
    this.save()
  }

  update(patch: Partial<AppConfig>): void {
    this.config = { ...this.config, ...patch }
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
