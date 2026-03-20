import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore, type Message, type MessageDurations, DEFAULT_TOOL_SELECTION_CONFIG } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAppStore } from '@/stores/appStore'
import { WorkingsPanel, type WorkingsData, type ToolSearchTrace, type HistoricalTurn } from './WorkingsPanel'
import {
  MessageSquare,
  Send,
  Square,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Brain,
  Bot,
  User,
  RotateCcw,
  Pencil,
  MoreHorizontal
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logToMain, logUiError } from '@/lib/rendererLog'
import { ChatMarkdown } from './ChatMarkdown'

function buildPriorForApi(messages: Message[], beforeIndex: number) {
  return messages
    .slice(0, beforeIndex)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content }))
}

export function ChatView() {
  const activeChatId = useChatStore((s) => s.activeChatId)
  const chats = useChatStore((s) => s.chats)
  const createChat = useChatStore((s) => s.createChat)
  const addMessage = useChatStore((s) => s.addMessage)
  const replaceChatMessages = useChatStore((s) => s.replaceChatMessages)
  const updateMessage = useChatStore((s) => s.updateMessage)
  const updateChat = useChatStore((s) => s.updateChat)
  const setEnabledTools = useChatStore((s) => s.setEnabledTools)
  const setMcpToolsMode = useChatStore((s) => s.setMcpToolsMode)
  const setToolSelectionConfig = useChatStore((s) => s.setToolSelectionConfig)
  const llmProviders = useSettingsStore((s) => s.llmProviders)
  const workingsPanelOpen = useAppStore((s) => s.workingsPanelOpen)
  const toggleWorkingsPanel = useAppStore((s) => s.toggleWorkingsPanel)

  const activeChat = chats.find((c) => c.id === activeChatId)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const streamScrollRafRef = useRef<number | null>(null)
  const rerunMenuRef = useRef<HTMLDivElement>(null)
  const [rerunMenuOpen, setRerunMenuOpen] = useState(false)
  const [editingUserMessageId, setEditingUserMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  // Workings panel data for current response
  const [workings, setWorkings] = useState<WorkingsData>({
    reasoning: '',
    toolCalls: [],
    usage: undefined,
    model: undefined
  })
  const workingsRef = useRef(workings)
  workingsRef.current = workings

  // Historical turns loaded from MongoDB
  const [historicalTurns, setHistoricalTurns] = useState<HistoricalTurn[]>([])

  const loadHistoricalTurns = useCallback(async (chatId: string) => {
    try {
      const secrets = await window.api.getSecrets({ type: 'mongo' })
      const uri = (secrets.connectionUri ?? '').trim()
      const db = useSettingsStore.getState().mongo.chatDatabase.trim()
      if (!uri || !db) return
      const turns = await window.api.mongoLoadChatTurns({ connectionUri: uri, databaseName: db, chatId })
      setHistoricalTurns(Array.isArray(turns) ? (turns as HistoricalTurn[]) : [])
    } catch {
      setHistoricalTurns([])
    }
  }, [])

  // Sync provider/model UI from the active chat (and persist defaults onto new chats)
  useEffect(() => {
    if (!activeChatId || !activeChat) return
    const p = llmProviders.find((x) => x.id === activeChat.providerId)
    if (activeChat.providerId && p) {
      setSelectedProvider(activeChat.providerId)
      if (activeChat.modelId && p.models.includes(activeChat.modelId)) {
        setSelectedModel(activeChat.modelId)
      } else if (p.models.length > 0) {
        const mid = p.models[0]
        setSelectedModel(mid)
        if (activeChat.modelId !== mid) updateChat(activeChatId, { modelId: mid })
      }
      return
    }
    if (llmProviders.length > 0) {
      const first = llmProviders[0]
      const mid = first.models[0] ?? ''
      setSelectedProvider(first.id)
      setSelectedModel(mid)
      updateChat(activeChatId, { providerId: first.id, modelId: mid })
    }
  }, [
    activeChatId,
    activeChat?.providerId,
    activeChat?.modelId,
    activeChat,
    llmProviders,
    updateChat
  ])

  const currentProvider = llmProviders.find((p) => p.id === selectedProvider)
  const availableModels = currentProvider?.models ?? []

  // Scroll to bottom on new messages. During streaming, message updates fire very often;
  // smooth scrollIntoView on each delta queues competing animations and makes the view jump.
  useEffect(() => {
    if (isStreaming) {
      if (streamScrollRafRef.current != null) return
      streamScrollRafRef.current = requestAnimationFrame(() => {
        streamScrollRafRef.current = null
        const el = messagesScrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages, isStreaming])

  useEffect(() => {
    return () => {
      if (streamScrollRafRef.current != null) {
        cancelAnimationFrame(streamScrollRafRef.current)
        streamScrollRafRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    setEditingUserMessageId(null)
    setEditDraft('')
    setRerunMenuOpen(false)
    setHistoricalTurns([])
    if (activeChatId) void loadHistoricalTurns(activeChatId)
  }, [activeChatId, loadHistoricalTurns])

  useEffect(() => {
    if (!rerunMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (rerunMenuRef.current && !rerunMenuRef.current.contains(e.target as Node)) {
        setRerunMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [rerunMenuOpen])

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
          const store = useChatStore.getState()
          const existing = store.chats.find((c) => c.id === e.chatId)
            ?.messages.find((m) => m.id === e.messageId)?.reasoning ?? ''
          store.updateMessage(e.chatId, e.messageId, {
            reasoning: existing + String(e.data)
          })
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
          const d = e.data as { toolCallId: string; toolName: string; result: unknown; durationMs?: number }
          setWorkings((w) => ({
            ...w,
            toolCalls: w.toolCalls.map((tc) =>
              tc.id === d.toolCallId
                ? { ...tc, result: d.result, status: 'success' as const, endTime: Date.now(), durationMs: d.durationMs }
                : tc
            )
          }))
          break
        }
        case 'tool-selection': {
          const d = e.data as ToolSearchTrace
          setWorkings((w) => ({ ...w, toolSearchTrace: d }))
          break
        }
        case 'usage': {
          const d = e.data as { promptTokens: number; completionTokens: number; totalTokens: number }
          setWorkings((w) => ({ ...w, usage: d }))
          break
        }
        case 'durations': {
          const d = e.data as MessageDurations
          setWorkings((w) => ({ ...w, durations: d }))
          useChatStore.getState().updateMessage(e.chatId, e.messageId, { durations: d })
          break
        }
        case 'error': {
          const existingMsg = useChatStore
            .getState()
            .chats.find((c) => c.id === e.chatId)
            ?.messages.find((m) => m.id === e.messageId)
          const errText = String(e.data)
          logToMain({
            level: 'error',
            source: 'chat-stream',
            message: errText,
            detail: JSON.stringify({ chatId: e.chatId, messageId: e.messageId })
          })
          useChatStore.getState().updateMessage(e.chatId, e.messageId, {
            content: (existingMsg?.content ?? '') + `\n\n_Error: ${errText}_`
          })
          break
        }
        case 'finish': {
          setIsStreaming(false)
          // Read latest workings from a ref — do not call setHistoricalTurns inside setWorkings'
          // functional updater: React Strict Mode double-invokes those updaters in dev and would
          // append the same turn twice. Dedupe by message id in case finish is ever signaled twice.
          const w = workingsRef.current
          const hasContent =
            w.reasoning ||
            w.toolCalls.length > 0 ||
            w.usage ||
            w.durations ||
            w.model ||
            w.toolSearchTrace
          if (hasContent) {
            const snapshot: HistoricalTurn = {
              _id: e.messageId,
              chatId: e.chatId,
              model: w.model,
              timestamp: Date.now(),
              reasoning: w.reasoning || undefined,
              toolSelection: w.toolSearchTrace,
              toolCalls: w.toolCalls.length > 0 ? w.toolCalls : undefined,
              usage: w.usage,
              durations: w.durations
            }
            const mid = e.messageId
            setHistoricalTurns((prev) =>
              prev.some((p) => String(p._id) === mid) ? prev : [snapshot, ...prev]
            )
          }
          break
        }
      }
    })
    return () => {
      cleanup()
    }
  }, [activeChatId])

  const submitUserTurn = useCallback(
    async (
      userText: string,
      assistantMsgId: string,
      priorMessagesForApi: Array<{ role: string; content: string }>
    ) => {
      if (!activeChatId || !selectedProvider || !selectedModel) return
      const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId)
      const prov = useSettingsStore.getState().llmProviders.find((p) => p.id === selectedProvider)
      setIsStreaming(true)
      setWorkings({
        reasoning: '',
        toolCalls: [],
        usage: undefined,
        model: `${prov?.name} / ${selectedModel}`,
        toolSearchTrace: undefined
      })
      try {
        await window.api.chatSend(activeChatId, userText, {
          providerId: selectedProvider,
          modelId: selectedModel,
          mcpToolsMode: chat?.mcpToolsMode ?? 'all',
          enabledTools: chat?.enabledTools ?? [],
          messages: priorMessagesForApi,
          messageId: assistantMsgId,
          systemPrompt: chat?.systemPrompt ?? '',
          agenticSystemPrompt: chat?.agenticSystemPrompt ?? '',
          toolSelectionConfig: chat?.toolSelectionConfig ?? DEFAULT_TOOL_SELECTION_CONFIG
        })
      } catch (err) {
        logUiError('ChatView.chatSend', err, { chatId: activeChatId })
        setIsStreaming(false)
      }
    },
    [activeChatId, selectedProvider, selectedModel]
  )

  const handleRerunLast = useCallback(async () => {
    if (!activeChatId || isStreaming || !selectedProvider || !selectedModel) return
    setRerunMenuOpen(false)
    const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId)
    const msgs = chat?.messages ?? []
    if (msgs.length === 0) return

    const last = msgs[msgs.length - 1]
    const modelLabel = `${currentProvider?.name}/${selectedModel}`

    if (last.role === 'assistant') {
      let userIdx = -1
      for (let i = msgs.length - 2; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          userIdx = i
          break
        }
      }
      if (userIdx < 0) return
      const userMsg = msgs[userIdx]
      const prior = buildPriorForApi(msgs, userIdx)
      updateMessage(activeChatId, last.id, {
        content: '',
        reasoning: undefined,
        model: modelLabel,
        tokenUsage: undefined,
        toolCalls: undefined
      })
      await submitUserTurn(userMsg.content, last.id, prior)
      return
    }

    if (last.role === 'user') {
      const assistantMsgId = `msg-${Date.now()}`
      const assistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        model: modelLabel,
        timestamp: new Date()
      }
      addMessage(activeChatId, assistantMsg)
      const prior = buildPriorForApi(msgs, msgs.length - 1)
      await submitUserTurn(last.content, assistantMsgId, prior)
    }
  }, [
    activeChatId,
    isStreaming,
    selectedProvider,
    selectedModel,
    currentProvider,
    updateMessage,
    addMessage,
    submitUserTurn
  ])

  const handleSaveEditedUser = useCallback(async () => {
    if (!activeChatId || !editingUserMessageId || isStreaming) return
    const text = editDraft.trim()
    if (!text) return
    if (!selectedProvider || !selectedModel) return

    const chat = useChatStore.getState().chats.find((c) => c.id === activeChatId)
    const msgs = chat?.messages ?? []
    const idx = msgs.findIndex((m) => m.id === editingUserMessageId)
    if (idx < 0 || msgs[idx].role !== 'user') return

    const modelLabel = `${currentProvider?.name}/${selectedModel}`
    const truncated = msgs.slice(0, idx + 1).map((m) =>
      m.id === editingUserMessageId ? { ...m, content: text } : m
    )
    const assistantMsgId = `msg-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      model: modelLabel,
      timestamp: new Date()
    }
    replaceChatMessages(activeChatId, [...truncated, assistantMsg])
    setEditingUserMessageId(null)
    setEditDraft('')
    await submitUserTurn(text, assistantMsgId, buildPriorForApi(truncated, idx))
  }, [
    activeChatId,
    editingUserMessageId,
    editDraft,
    isStreaming,
    selectedProvider,
    selectedModel,
    currentProvider,
    replaceChatMessages,
    submitUserTurn
  ])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeChatId || !activeChat || isStreaming) return
    if (!selectedProvider || !selectedModel) return

    const userText = input.trim()
    const priorForApi = buildPriorForApi(activeChat.messages, activeChat.messages.length)

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: userText,
      timestamp: new Date()
    }
    addMessage(activeChatId, userMsg)

    if (activeChat.messages.length === 0) {
      const autoTitle = userText.length > 100 ? userText.slice(0, 100) + '…' : userText
      updateChat(activeChatId, { title: autoTitle })
    }

    const assistantMsgId = `msg-${Date.now()}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      model: `${currentProvider?.name}/${selectedModel}`,
      timestamp: new Date()
    }
    addMessage(activeChatId, assistantMsg)

    setInput('')
    await submitUserTurn(userText, assistantMsgId, priorForApi)
  }, [
    input,
    activeChatId,
    activeChat,
    isStreaming,
    selectedProvider,
    selectedModel,
    addMessage,
    currentProvider,
    submitUserTurn
  ])

  const handleStop = useCallback(() => {
    if (activeChatId && isStreaming) {
      window.api.chatStop(activeChatId)
      setIsStreaming(false)
    }
  }, [activeChatId, isStreaming])

  useEffect(() => {
    if (!isStreaming) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleStop()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isStreaming, handleStop])

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
        <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-4">
          {activeChat.messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <p>Send a message to start the conversation.</p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4 pb-4">
              {activeChat.messages.map((msg, idx) => {
                const isLast = idx === activeChat.messages.length - 1
                return (
                  <div key={msg.id} className="space-y-1">
                    <MessageBubble
                      message={msg}
                      isEditing={editingUserMessageId === msg.id}
                      editDraft={editDraft}
                      onEditDraftChange={setEditDraft}
                      onStartEdit={() => {
                        if (isStreaming) return
                        setRerunMenuOpen(false)
                        setEditingUserMessageId(msg.id)
                        setEditDraft(msg.content)
                      }}
                      onCancelEdit={() => {
                        setEditingUserMessageId(null)
                        setEditDraft('')
                      }}
                      onSaveEdit={handleSaveEditedUser}
                      editDisabled={isStreaming}
                    />
                    {isLast && !isStreaming && (
                      <div
                        ref={rerunMenuRef}
                        className={cn(
                          'flex justify-center pt-0.5',
                          msg.role === 'user' ? 'pr-10' : 'pl-10'
                        )}
                      >
                        <div className="relative">
                          <button
                            type="button"
                            disabled={!selectedProvider || !selectedModel}
                            onClick={() => setRerunMenuOpen((o) => !o)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                            title="Rerun last turn (uses provider, model, and MCP settings above)"
                          >
                            <MoreHorizontal className="size-3.5" />
                            Rerun
                            <ChevronDown
                              className={cn('size-3 transition-transform', rerunMenuOpen && 'rotate-180')}
                            />
                          </button>
                          {rerunMenuOpen && (
                            <div className="absolute left-1/2 top-full z-20 mt-1 w-56 -translate-x-1/2 rounded-md border border-border bg-popover py-1 shadow-md">
                              <button
                                type="button"
                                onClick={() => void handleRerunLast()}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-accent"
                              >
                                <RotateCcw className="size-3.5 shrink-0 opacity-70" />
                                <span>
                                  Regenerate last response
                                  <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                                    Adjust model or MCP tools above first if needed.
                                  </span>
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
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
                  const pid = e.target.value
                  setSelectedProvider(pid)
                  const prov = llmProviders.find((p) => p.id === pid)
                  const mid = prov?.models[0] ?? ''
                  if (prov?.models.length) setSelectedModel(mid)
                  if (activeChatId) updateChat(activeChatId, { providerId: pid, modelId: mid })
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
                  onChange={(e) => {
                    const mid = e.target.value
                    setSelectedModel(mid)
                    if (activeChatId) updateChat(activeChatId, { modelId: mid })
                  }}
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
                type="button"
                onClick={toggleWorkingsPanel}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                  workingsPanelOpen
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                <SlidersHorizontal className="size-3" /> Panel
              </button>
            </div>

            {/* Input row */}
            <div className="relative flex items-end gap-2 rounded-xl border border-input bg-card p-2">
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

            <p className="mt-1 text-[10px] text-muted-foreground">
              {activeChat.mcpToolsMode === 'all'
                ? 'MCP tools: all connected servers'
                : activeChat.mcpToolsMode === 'semantic'
                  ? 'MCP tools: semantic search (auto)'
                  : activeChat.mcpToolsMode === 'agentic'
                    ? 'MCP tools: agentic search (auto)'
                    : activeChat.enabledTools.length > 0
                      ? `MCP tools: ${activeChat.enabledTools.length} selected (side panel)`
                      : 'MCP tools: none (side panel)'}
            </p>
          </div>
        </div>
      </div>

      {/* Workings panel */}
      <WorkingsPanel
        data={workings}
        historicalTurns={historicalTurns}
        isStreaming={isStreaming}
        open={workingsPanelOpen}
        onClose={toggleWorkingsPanel}
        mcpToolsMode={activeChat.mcpToolsMode}
        enabledTools={activeChat.enabledTools}
        systemPrompt={activeChat.systemPrompt ?? ''}
        agenticSystemPrompt={activeChat.agenticSystemPrompt ?? ''}
        toolSelectionConfig={activeChat.toolSelectionConfig ?? DEFAULT_TOOL_SELECTION_CONFIG}
        onMcpModeChange={(mode) => setMcpToolsMode(activeChat.id, mode)}
        onMcpToolsChange={(tools) => setEnabledTools(activeChat.id, tools)}
        onSystemPromptChange={(v) => updateChat(activeChat.id, { systemPrompt: v })}
        onAgenticSystemPromptChange={(v) => updateChat(activeChat.id, { agenticSystemPrompt: v })}
        onToolSelectionConfigChange={(patch) => setToolSelectionConfig(activeChat.id, patch)}
      />
    </div>
  )
}

function MessageBubble({
  message,
  isEditing,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  editDisabled
}: {
  message: Message
  isEditing: boolean
  editDraft: string
  onEditDraftChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  editDisabled: boolean
}) {
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
        {!isUser && message.reasoning && (
          <ReasoningCollapsible text={message.reasoning} />
        )}
        {isUser && isEditing ? (
          <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              value={editDraft}
              onChange={(e) => onEditDraftChange(e.target.value)}
              rows={3}
              className="w-full min-w-[240px] resize-y rounded-lg border border-primary-foreground/30 bg-primary-foreground/10 px-2 py-1.5 text-sm text-primary-foreground placeholder:text-primary-foreground/50 outline-none focus:ring-1 focus:ring-primary-foreground/40"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-md px-2 py-1 text-[11px] text-primary-foreground/80 hover:bg-primary-foreground/15"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSaveEdit()}
                disabled={!editDraft.trim()}
                className="rounded-md bg-primary-foreground/20 px-2 py-1 text-[11px] font-medium hover:bg-primary-foreground/30 disabled:opacity-40"
              >
                Save & rerun
              </button>
            </div>
          </div>
        ) : message.content ? (
          <ChatMarkdown content={message.content} variant={isUser ? 'user' : 'assistant'} />
        ) : !isUser ? (
          <p className="text-sm text-muted-foreground">...</p>
        ) : null}
        {isUser && !isEditing && (
          <div className="mt-2 flex justify-end border-t border-primary-foreground/20 pt-2">
            <button
              type="button"
              disabled={editDisabled}
              onClick={onStartEdit}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-primary-foreground/85 transition-colors hover:bg-primary-foreground/15 disabled:opacity-40"
              title="Edit and rerun from this message"
            >
              <Pencil className="size-3" />
              Edit
            </button>
          </div>
        )}
        {message.model && !isEditing && (
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

function ReasoningCollapsible({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mb-2 rounded-lg border border-border/50 bg-background/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <Brain className="size-3 text-purple-500" />
        <span className="text-xs text-muted-foreground">Thinking</span>
      </button>
      {expanded && (
        <div className="border-t border-border/50 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {text}
          </p>
        </div>
      )}
    </div>
  )
}
