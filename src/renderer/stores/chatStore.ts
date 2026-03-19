import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  reasoning?: string
  toolCalls?: ToolCallInfo[]
  tokenUsage?: { input: number; output: number; total: number }
  model?: string
  timestamp: number
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
  enabledTools: string[]
  providerId: string
  modelId: string
  createdAt: number
}

interface ChatState {
  chats: Chat[]
  activeChatId: string | null
  setActiveChat: (id: string | null) => void
  createChat: () => string
  deleteChat: (id: string) => void
  addMessage: (chatId: string, message: Message) => void
  updateMessage: (chatId: string, messageId: string, patch: Partial<Message>) => void
  setEnabledTools: (chatId: string, tools: string[]) => void
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
    const chat: Chat = {
      id,
      title: 'New Chat',
      messages: [],
      enabledTools: [],
      providerId: '',
      modelId: '',
      createdAt: Date.now()
    }
    set((s) => ({ chats: [chat, ...s.chats], activeChatId: id }))
    return id
  },

  deleteChat: (id) =>
    set((s) => ({
      chats: s.chats.filter((c) => c.id !== id),
      activeChatId: s.activeChatId === id ? null : s.activeChatId
    })),

  addMessage: (chatId, message) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId ? { ...c, messages: [...c.messages, message] } : c
      )
    })),

  updateMessage: (chatId, messageId, patch) =>
    set((s) => ({
      chats: s.chats.map((c) =>
        c.id === chatId
          ? {
              ...c,
              messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m))
            }
          : c
      )
    })),

  setEnabledTools: (chatId, tools) =>
    set((s) => ({
      chats: s.chats.map((c) => (c.id === chatId ? { ...c, enabledTools: tools } : c))
    }))
}))
