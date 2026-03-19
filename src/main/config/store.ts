import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

export interface AppConfig {
  llmProviders: LlmProviderConfig[]
  embeddingsProviders: EmbeddingsProviderConfig[]
  mcpServers: McpServerConfig[]
  chats: ChatMeta[]
}

export interface LlmProviderConfig {
  id: string
  name: string
  type: 'openai' | 'azure' | 'openai-compatible'
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface EmbeddingsProviderConfig {
  id: string
  name: string
  type: 'openai-compatible' | 'voyage'
  baseUrl: string
  apiKey: string
  models: string[]
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

export interface ChatMeta {
  id: string
  title: string
  enabledTools: string[]
  providerId: string
  modelId: string
  createdAt: number
}

const DEFAULT_CONFIG: AppConfig = {
  llmProviders: [],
  embeddingsProviders: [],
  mcpServers: [],
  chats: []
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
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
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
