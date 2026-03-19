import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore, type Message, type ToolCallInfo } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAppStore } from '@/stores/appStore'
import { ToolPicker } from './ToolPicker'
import { WorkingsPanel, type WorkingsData } from './WorkingsPanel'
import {
  MessageSquare,
  Send,
  Square,
  Wrench,
  SlidersHorizontal,
  ChevronDown,
  Bot,
  User
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function ChatView() {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const chats = useChatStore((s) => s.chats)
  const createChat = useChatStore((s) => s.createChat)
  const addMessage = useChatStore((s) => s.addMessage)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const setEnabledTools = useChatStore((s) => s.setEnabledTools)
  const llmProviders = useSettingsStore((s) => s.llmProviders)
  const workingsPanelOpen = useAppStore((s) => s.workingsPanelOpen)
  const toggleWorkingsPanel = useAppStore((s) => s.toggleWorkingsPanel)

  const activeChat = chats.find((c) => c.id === activeChatId)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [toolPickerOpen, setToolPickerOpen] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Workings panel data for current response
  const [workings, setWorkings] = useState<WorkingsData>({
    reasoning: '',
    toolCalls: [],
    usage: undefined,
    model: undefined
  })

  // Set default provider/model from first available
  useEffect(() => {
    if (!selectedProvider && llmProviders.length > 0) {
      setSelectedProvider(llmProviders[0].id)
      if (llmProviders[0].models.length > 0) {
        setSelectedModel(llmProviders[0].models[0])
      }
    }
  }, [llmProviders, selectedProvider])

  const currentProvider = llmProviders.find((p) => p.id === selectedProvider)
  const availableModels = currentProvider?.models ?? []

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages])

  // Listen for streaming events
  useEffect(() => {
    const cleanup = window.api.onChatStream((event: unknown) => {
      const e = event as {
        type: string
        chatId: string
        messageId: string
        data?: unknown
      }
      if (e.chatId !== activeChatId) return

      switch (e.type) {
        case 'text-delta': {
          useChatStore.getState().updateMessage(e.chatId, e.messageId, {
            content:
              (useChatStore.getState().chats.find((c) => c.id === e.chatId)?.messages.find((m) => m.id === e.messageId)?.content ?? '') +
              String(e.data)
          })
          break
        }
        case 'reasoning-delta': {
          setWorkings((w) => ({ ...w, reasoning: w.reasoning + String(e.data) }))
          break
        }
        case 'tool-call-start': {
          const d = e.data as { toolCallId: string; toolName: string; args: Record<string, unknown> }
          setWorkings((w) => ({
            ...w,
            toolCalls: [
              ...w.toolCalls,
              {
                id: d.toolCallId,
                name: d.toolName,
                args: d.args,
                status: 'pending' as const,
                startTime: Date.now()
              }
            ]
          }))
          break
        }
        case 'tool-call-result': {
          const d = e.data as { toolCallId: string; toolName: string; result: unknown }
          setWorkings((w) => ({
            ...w,
            toolCalls: w.toolCalls.map((tc) =>
              tc.id === d.toolCallId
                ? { ...tc, result: d.result, status: 'success' as const, endTime: Date.now() }
                : tc
            )
          }))
          break
        }
        case 'usage': {
          const d = e.data as { promptTokens: number; completionTokens: number; totalTokens: number }
          setWorkings((w) => ({ ...w, usage: d }))
          break
        }
        case 'error': {
          const existingMsg = useChatStore
            .getState()
            .chats.find((c) => c.id === e.chatId)
            ?.messages.find((m) => m.id === e.messageId)
          useChatStore.getState().updateMessage(e.chatId, e.messageId, {
            content: (existingMsg?.content ?? '') + `\n\n_Error: ${String(e.data)}_`
          })
          break
        }
        case 'finish': {
          setIsStreaming(false)
          break
        }
      }
    })
    return cleanup
  }, [activeChatId])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeChatId || isStreaming) return
    if (!selectedProvider || !selectedModel) return

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    }
    addMessage(activeChatId, userMsg)

    const assistantMsgId = `msg-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      model: `${currentProvider?.name}/${selectedModel}`,
      timestamp: Date.now()
    }
    addMessage(activeChatId, assistantMsg)

    setInput('')
    setIsStreaming(true)
    setWorkings({
      reasoning: '',
      toolCalls: [],
      usage: undefined,
      model: `${currentProvider?.name} / ${selectedModel}`
    })

    const currentChat = useChatStore.getState().chats.find((c) => c.id === activeChatId)
    const historyMessages = (currentChat?.messages ?? [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1) // exclude the assistant placeholder we just added
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      await window.api.chatSend(activeChatId, input.trim(), {
        providerId: selectedProvider,
        modelId: selectedModel,
        enabledTools: activeChat?.enabledTools ?? [],
        messages: historyMessages
      })
    } catch (err) {
      console.error('Chat send failed:', err)
      setIsStreaming(false)
    }
  }, [input, activeChatId, isStreaming, selectedProvider, selectedModel, activeChat, addMessage, currentProvider])

  const handleStop = useCallback(() => {
    if (activeChatId) {
      window.api.chatStop(activeChatId)
      setIsStreaming(false)
    }
  }, [activeChatId])

  if (!activeChat) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <MessageSquare className="size-12 opacity-30" />
        <p className="text-lg">No chat selected</p>
        <button
          onClick={() => createChat()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start a new chat
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeChat.messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>Send a message to start the conversation.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4 pb-4">
              {activeChat.messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border p-4">
          <div className="mx-auto max-w-3xl">
            {/* Provider/model selector row */}
            <div className="flex items-center gap-2 mb-2 text-xs">
              <select
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value)
                  const prov = llmProviders.find((p) => p.id === e.target.value)
                  if (prov?.models.length) setSelectedModel(prov.models[0])
                }}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
              >
                <option value="">Select provider...</option>
                {llmProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {availableModels.length > 0 && (
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex-1" />

              <button
                onClick={toggleWorkingsPanel}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                  workingsPanelOpen
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                <SlidersHorizontal className="size-3" /> Workings
              </button>
            </div>

            {/* Input row */}
            <div className="relative flex items-end gap-2 rounded-xl border border-input bg-card p-2">
              {/* Tool picker button */}
              <div className="relative">
                <button
                  onClick={() => setToolPickerOpen(!toolPickerOpen)}
                  className={cn(
                    'rounded-lg p-1.5 transition-colors',
                    toolPickerOpen || (activeChat.enabledTools.length > 0)
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                  title="Select MCP tools"
                >
                  <Wrench className="size-4" />
                </button>
                <ToolPicker
                  enabledTools={activeChat.enabledTools}
                  onChange={(tools) => setEnabledTools(activeChatId!, tools)}
                  open={toolPickerOpen}
                  onClose={() => setToolPickerOpen(false)}
                />
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  selectedProvider
                    ? 'Type a message...'
                    : 'Configure an LLM provider in Settings first'
                }
                disabled={!selectedProvider}
                rows={1}
                className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px'
                }}
              />

              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="rounded-lg bg-destructive p-1.5 text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  title="Stop generating"
                >
                  <Square className="size-4" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || !selectedProvider || !selectedModel}
                  className="rounded-lg bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Send className="size-4" />
                </button>
              )}
            </div>

            {activeChat.enabledTools.length > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {activeChat.enabledTools.length} tool(s) enabled
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Workings panel */}
      <WorkingsPanel
        data={workings}
        open={workingsPanelOpen}
        onClose={toggleWorkingsPanel}
      />
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <Bot className="size-4 text-muted-foreground" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5',
          isUser
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md bg-muted'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content || (isUser ? '' : '...')}</p>
        {message.model && (
          <p className="mt-1 text-[10px] opacity-60">{message.model}</p>
        )}
      </div>
      {isUser && (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary">
          <User className="size-4 text-primary-foreground" />
        </div>
      )}
    </div>
  )
}
