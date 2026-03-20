import { BrowserWindow } from 'electron'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getConfigStore, type LlmProviderConfig, type ToolSelectionConfig, DEFAULT_TOOL_SELECTION_CONFIG } from '../config/store'
import { createClient, chatRequestDefaults } from './providers'
import {
  buildChatCompletionTools,
  type McpToolsSelection,
  ToolCallAccumulator,
  executeToolCall,
  buildToolResultMessages
} from './tools'
import { resolveToolSelection } from './tool-selection'
import { ThinkTagParser } from './reasoning'
import { formatApiError } from './format-error'

const MAX_TOOL_STEPS = 10

/**
 * One AbortController per in-flight chat turn, keyed by chatId.
 * Aborting cancels the OpenAI stream *and* any pending MCP tool calls
 * (the signal is threaded through executeToolCall → McpManager.callTool).
 */
const activeAbortControllers = new Map<string, AbortController>()

const CHAT_ERROR_UI_MAX = 1200

function clipForChatUi(full: string): string {
  if (full.length <= CHAT_ERROR_UI_MAX) return full
  return `${full.slice(0, CHAT_ERROR_UI_MAX)}…\n\n(Full error is in the terminal / main process log.)`
}

export interface ChatStreamEvent {
  type: 'text-delta' | 'reasoning-delta' | 'tool-call-start' | 'tool-call-result' | 'tool-selection' | 'usage' | 'error' | 'finish'
  chatId: string
  messageId: string
  data?: unknown
}

export async function handleChatSend(
  chatId: string,
  message: string,
  options: {
    providerId: string
    modelId: string
    mcpToolsMode?: 'all' | 'pick' | 'semantic' | 'agentic'
    enabledTools: string[]
    messages: Array<{ role: string; content: string }>
    messageId?: string
    systemPrompt?: string
    agenticSystemPrompt?: string
    toolSelectionConfig?: Partial<ToolSelectionConfig>
  }
): Promise<void> {
  const store = getConfigStore()
  const providers = store.get('llmProviders')
  const provider = providers.find((p) => p.id === options.providerId)
  if (!provider) throw new Error(`Provider not found: ${options.providerId}`)

  const client = createClient(provider)
  const messageId = options.messageId ?? `msg-${Date.now()}`
  const abortController = new AbortController()
  activeAbortControllers.set(chatId, abortController)

  const broadcast = (event: ChatStreamEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('llm:stream', event)
    }
  }

  try {
    const mode = options.mcpToolsMode ?? 'all'
    let selection: McpToolsSelection

    if (mode === 'semantic' || mode === 'agentic') {
      const tsConfig: ToolSelectionConfig = {
        ...DEFAULT_TOOL_SELECTION_CONFIG,
        ...options.toolSelectionConfig
      }
      const result = await resolveToolSelection({
        mode,
        config: tsConfig,
        agenticSystemPrompt: options.agenticSystemPrompt ?? '',
        messages: options.messages,
        currentMessage: message,
        signal: abortController.signal
      })

      broadcast({ type: 'tool-selection', chatId, messageId, data: result.trace })

      selection = { mode: 'pick', keys: result.keys }
    } else {
      selection = mode === 'all' ? { mode: 'all' } : { mode: 'pick', keys: options.enabledTools }
    }

    const { tools, serverMap } = buildChatCompletionTools(selection)

    const messages: ChatCompletionMessageParam[] = []

    if (options.systemPrompt?.trim()) {
      messages.push({ role: 'system', content: options.systemPrompt.trim() })
    }

    for (const m of options.messages) {
      messages.push({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content
      })
    }
    messages.push({ role: 'user', content: message })

    const defaults = chatRequestDefaults(provider)
    let totalInputTokens = 0
    let totalOutputTokens = 0

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      if (abortController.signal.aborted) break

      const stream = await client.chat.completions.create(
        {
          model: options.modelId,
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          stream: true,
          ...defaults
        },
        { signal: abortController.signal }
      )

      const accumulator = new ToolCallAccumulator()
      const thinkParser = step === 0 ? new ThinkTagParser() : null
      let assistantContent = ''

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break

        const choice = chunk.choices[0]

        // Usage arrives in the final chunk (when stream_options.include_usage is set)
        if (chunk.usage) {
          totalInputTokens += chunk.usage.prompt_tokens ?? 0
          totalOutputTokens += chunk.usage.completion_tokens ?? 0
        }

        if (!choice) continue
        const delta = choice.delta

        // Native reasoning (o-series models)
        const reasoningContent = (delta as Record<string, unknown>).reasoning_content
        if (typeof reasoningContent === 'string' && reasoningContent) {
          broadcast({ type: 'reasoning-delta', chatId, messageId, data: reasoningContent })
        }

        // Text content (with think-tag extraction on the first step)
        if (delta.content) {
          if (thinkParser) {
            const { text, reasoning } = thinkParser.push(delta.content)
            if (reasoning) {
              broadcast({ type: 'reasoning-delta', chatId, messageId, data: reasoning })
            }
            if (text) {
              broadcast({ type: 'text-delta', chatId, messageId, data: text })
              assistantContent += text
            }
          } else {
            broadcast({ type: 'text-delta', chatId, messageId, data: delta.content })
            assistantContent += delta.content
          }
        }

        // Tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            accumulator.feed(tc)
          }
        }
      }

      // Flush any remaining buffered think-tag content
      if (thinkParser) {
        const { text, reasoning } = thinkParser.flush()
        if (reasoning) broadcast({ type: 'reasoning-delta', chatId, messageId, data: reasoning })
        if (text) {
          broadcast({ type: 'text-delta', chatId, messageId, data: text })
          assistantContent += text
        }
      }

      // If no tool calls were made, we're done
      const toolCalls = accumulator.getAll()
      if (toolCalls.length === 0) break

      // Execute tool calls and broadcast events
      const toolResults: Array<{ toolCallId: string; content: string }> = []

      for (const call of toolCalls) {
        if (abortController.signal.aborted) break

        let args: Record<string, unknown>
        try {
          args = JSON.parse(call.arguments || '{}')
        } catch {
          args = {}
        }

        broadcast({
          type: 'tool-call-start',
          chatId,
          messageId,
          data: { toolCallId: call.id, toolName: call.name, args }
        })

        try {
          const { toolCallId, toolName, result, content } = await executeToolCall(
            call,
            serverMap,
            { signal: abortController.signal }
          )
          toolResults.push({ toolCallId, content })

          broadcast({
            type: 'tool-call-result',
            chatId,
            messageId,
            data: { toolCallId, toolName, result }
          })
        } catch (err) {
          if (abortController.signal.aborted) break
          const errMsg = err instanceof Error ? err.message : String(err)
          toolResults.push({ toolCallId: call.id, content: `Error: ${errMsg}` })

          broadcast({
            type: 'tool-call-result',
            chatId,
            messageId,
            data: { toolCallId: call.id, toolName: call.name, result: `Error: ${errMsg}` }
          })
        }
      }

      // Thread tool results into the conversation for the next iteration
      const threadMsgs = buildToolResultMessages(toolCalls, toolResults, assistantContent)
      messages.push(...threadMsgs)
      assistantContent = ''
    }

    // Broadcast usage
    broadcast({
      type: 'usage',
      chatId,
      messageId,
      data: {
        promptTokens: totalInputTokens,
        completionTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens
      }
    })

    broadcast({ type: 'finish', chatId, messageId })
  } catch (err) {
    if (!abortController.signal.aborted) {
      const full = formatApiError(err)
      console.error(`[llm:chat] chatId=${chatId} messageId=${messageId}\n${full}`)
      broadcast({
        type: 'error',
        chatId,
        messageId,
        data: clipForChatUi(full)
      })
    }
    broadcast({ type: 'finish', chatId, messageId })
  } finally {
    activeAbortControllers.delete(chatId)
  }
}

/** Abort a running chat turn. Safe to call even if no turn is active for the given chatId. */
export function stopChat(chatId: string): void {
  const controller = activeAbortControllers.get(chatId)
  if (controller) {
    controller.abort()
    activeAbortControllers.delete(chatId)
  }
}

export type LlmTestPayload =
  | { providerId: string; modelId?: string }
  | { provider: LlmProviderConfig; modelId?: string }

export type LlmTestResult =
  | { ok: true; modelId: string; replySnippet: string }
  | { ok: false; error: string }

const TEST_USER_MESSAGE =
  'Reply with a single short word only (no punctuation): the word "pong" in lowercase.'

export async function testLlmConnection(payload: LlmTestPayload): Promise<LlmTestResult> {
  try {
    let provider: LlmProviderConfig
    if ('provider' in payload) {
      provider = payload.provider
    } else {
      const store = getConfigStore()
      const p = store.get('llmProviders').find((x) => x.id === payload.providerId)
      if (!p) {
        return { ok: false, error: `Provider not found: ${payload.providerId}` }
      }
      provider = p
    }

    const modelId = payload.modelId ?? provider.models[0]
    if (!modelId?.trim()) {
      return {
        ok: false,
        error:
          'No model to test. Add at least one model ID (comma-separated) or pick a model in chat first.'
      }
    }

    const client = createClient(provider)
    const completion = await client.chat.completions.create({
      model: modelId.trim(),
      max_tokens: 32,
      messages: [{ role: 'user', content: TEST_USER_MESSAGE }]
    })

    const text = completion.choices[0]?.message?.content ?? ''
    const snippet = text.trim().slice(0, 200)
    return { ok: true, modelId: modelId.trim(), replySnippet: snippet || '(empty reply)' }
  } catch (err) {
    return { ok: false, error: formatApiError(err) }
  }
}
