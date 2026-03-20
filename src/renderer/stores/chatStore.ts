import { create } from 'zustand'

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

export interface MessageDurations {
  totalMs: number
  toolSelectionMs?: number
  reasoningMs?: number
  generationMs?: number
  toolCallsMs: number
  firstTokenMs?: number
  outputMs?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  tokenUsage?: { input: number; output: number; total: number }
  durations?: MessageDurations
  model?: string
  timestamp: Date
}

export interface ToolCallInfo {
  id: string
  name: string
  args: Record<string, unknown>
  result?: unknown
  duration?: number
  status: 'pending' | 'success' | 'error'
}

export interface Chat {
  id: string
  title: string
  messages: Message[]
  mcpToolsMode: McpToolsMode
  enabledTools: string[]
  providerId: string
  modelId: string
  systemPrompt: string
  agenticSystemPrompt: string
  toolSelectionConfig: ToolSelectionConfig
  createdAt: Date
  updatedAt: Date
}

interface ChatState {
  chats: Chat[]
  activeChatId: string | null
  setActiveChat: (id: string | null) => void
  createChat: () => string
  deleteChat: (id: string) => void
  replaceChats: (chats: Chat[]) => void
  updateChat: (chatId: string, patch: Partial<Omit<Chat, 'id'>>) => void
  addMessage: (chatId: string, message: Message) => void
  replaceChatMessages: (chatId: string, messages: Message[]) => void
  updateMessage: (chatId: string, messageId: string, patch: Partial<Message>) => void
  setEnabledTools: (chatId: string, tools: string[]) => void
  setMcpToolsMode: (chatId: string, mode: McpToolsMode) => void
  setToolSelectionConfig: (chatId: string, config: Partial<ToolSelectionConfig>) => void
}

let nextId = 1
function generateId() {
  return `chat-${Date.now()}-${nextId++}`
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,

  setActiveChat: (id) => set({ activeChatId: id }),

  createChat: () => {
    const id = generateId()
    const state = get()
    const prev = state.chats.find((c) => c.id === state.activeChatId) ?? state.chats[0]
    const chat: Chat = {
      id,
      title: 'New Chat',
      messages: [],
      mcpToolsMode: prev?.mcpToolsMode ?? 'all',
      enabledTools: prev?.enabledTools ? [...prev.enabledTools] : [],
      providerId: prev?.providerId ?? '',
      modelId: prev?.modelId ?? '',
      systemPrompt: prev?.systemPrompt ?? '',
      agenticSystemPrompt: prev?.agenticSystemPrompt ?? '',
      toolSelectionConfig: prev?.toolSelectionConfig
        ? { ...prev.toolSelectionConfig }
        : { ...DEFAULT_TOOL_SELECTION_CONFIG },
      createdAt: new Date(),
      updatedAt: new Date()
    }
    set((s) => ({ chats: [chat, ...s.chats], activeChatId: id }))
    return id
  },

  deleteChat: (id) =>
    set((s) => ({
      chats: s.chats.filter((c) => c.id !== id),
      activeChatId: s.activeChatId === id ? null : s.activeChatId
    })),

  replaceChats: (chats) =>
    set((s) => {
      const sorted = [...chats].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      const stillValid = sorted.some((c) => c.id === s.activeChatId)
      return {
        chats: sorted,
        activeChatId: stillValid ? s.activeChatId : sorted[0]?.id ?? null
      }
    }),

  updateChat: (chatId, patch) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, ...patch, updatedAt: new Date() } : c))
    })),

  addMessage: (chatId, message) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, messages: [...c.messages, message], updatedAt: new Date() } : c
      )
    })),

  replaceChatMessages: (chatId, messages) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, messages, updatedAt: new Date() } : c))
    })),

  updateMessage: (chatId, messageId, patch) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              updatedAt: new Date(),
              messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m))
            }
          : c
      )
    })),

  setEnabledTools: (chatId, tools) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, enabledTools: tools, updatedAt: new Date() } : c))
    })),

  setMcpToolsMode: (chatId, mode) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, mcpToolsMode: mode, updatedAt: new Date() } : c))
    })),

  setToolSelectionConfig: (chatId, patch) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId
          ? { ...c, toolSelectionConfig: { ...c.toolSelectionConfig, ...patch }, updatedAt: new Date() }
          : c
      )
    }))
}))
