import { BrowserWindow } from 'electron'
import { generateText, streamText, type LanguageModelV1 } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAzure } from '@ai-sdk/azure'
import { getConfigStore, type LlmProviderConfig } from '../config/store'
import { getMcpManager } from '../mcp/manager'
import { formatAiSdkApiError } from './format-ai-sdk-error'

const activeAbortControllers = new Map<string, AbortController>()

/** Keep chat bubbles readable; full text is always logged in the main process. */
const CHAT_ERROR_UI_MAX = 1200

function clipForChatUi(full: string): string {
  if (full.length <= CHAT_ERROR_UI_MAX) return full
  return `${full.slice(0, CHAT_ERROR_UI_MAX)}…\n\n(Full error is in the terminal / main process log.)`
}

function createModel(provider: LlmProviderConfig, modelId: string): LanguageModelV1 {
  // `openai(modelId)` / `azure(modelId)` use OpenAI's Responses API (`/v1/responses`). Most
  // OpenAI-compatible hosts (Fireworks, Ollama, etc.) only implement chat completions (`/v1/chat/completions`).
  switch (provider.type) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl })
      return openai.chat(modelId)
    }
    case 'azure': {
      const azure = createAzure({ apiKey: provider.apiKey, baseURL: provider.baseUrl })
      return azure.chat(modelId)
    }
    case 'openai-compatible': {
      const compat = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        compatibility: 'compatible'
      })
      return compat.chat(modelId)
    }
    default:
      throw new Error(`Unknown provider type: ${provider.type}`)
  }
}

function buildMcpTools(enabledTools: string[]): Record<string, { description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<unknown> }> {
  const mcpManager = getMcpManager()
  const allStatuses = mcpManager.getAllStatuses()
  const tools: Record<string, { description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<unknown> }> = {}

  for (const server of allStatuses) {
    if (server.status !== 'connected') continue
    for (const tool of server.tools) {
      const toolKey = `${server.id}:${tool.name}`
      if (enabledTools.length > 0 && !enabledTools.includes(toolKey)) continue

      tools[tool.name] = {
        description: tool.description ?? tool.name,
        parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        execute: async (args: Record<string, unknown>) => {
          const result = await mcpManager.callTool(server.id, tool.name, args)
          return result
        }
      }
    }
  }
  return tools
}

export interface ChatStreamEvent {
  type: 'text-delta' | 'reasoning-delta' | 'tool-call-start' | 'tool-call-result' | 'usage' | 'error' | 'finish'
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
    enabledTools: string[]
    messages: Array<{ role: string; content: string }>
    /** Must match the assistant placeholder id in the renderer so stream events apply to the right bubble. */
    messageId?: string
  }
): Promise<void> {
  const store = getConfigStore()
  const providers = store.get('llmProviders')
  const provider = providers.find((p) => p.id === options.providerId)
  if (!provider) throw new Error(`Provider not found: ${options.providerId}`)

  const model = createModel(provider, options.modelId)
  const messageId = options.messageId ?? `msg-${Date.now()}`
  const abortController = new AbortController()
  activeAbortControllers.set(chatId, abortController)

  const broadcast = (event: ChatStreamEvent) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('llm:stream', event)
    }
  }

  try {
    const mcpTools = buildMcpTools(options.enabledTools)

    // Build message history for AI SDK
    const aiMessages = options.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content
    }))
    aiMessages.push({ role: 'user', content: message })

    const result = streamText({
      model,
      messages: aiMessages,
      tools: mcpTools as never,
      maxSteps: 10,
      abortSignal: abortController.signal
    })

    for await (const part of result.fullStream) {
      if (abortController.signal.aborted) break

      switch (part.type) {
        case 'text-delta':
          broadcast({ type: 'text-delta', chatId, messageId, data: part.text })
          break
        case 'reasoning-delta':
          broadcast({ type: 'reasoning-delta', chatId, messageId, data: part.text })
          break
        case 'tool-call':
          broadcast({
            type: 'tool-call-start',
            chatId,
            messageId,
            data: {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args
            }
          })
          break
        case 'tool-result':
          broadcast({
            type: 'tool-call-result',
            chatId,
            messageId,
            data: {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              result: part.result
            }
          })
          break
        case 'error': {
          const errText = formatAiSdkApiError(part.error)
          console.error(`[llm:chat:stream] chatId=${chatId} messageId=${messageId}\n${errText}`)
          broadcast({ type: 'error', chatId, messageId, data: clipForChatUi(errText) })
          break
        }
      }
    }

    const usage = await result.usage
    const inputTok = usage.inputTokens ?? 0
    const outputTok = usage.outputTokens ?? 0
    const totalTok = usage.totalTokens ?? inputTok + outputTok
    broadcast({
      type: 'usage',
      chatId,
      messageId,
      data: {
        promptTokens: inputTok,
        completionTokens: outputTok,
        totalTokens: totalTok
      }
    })

    broadcast({ type: 'finish', chatId, messageId })
  } catch (err) {
    if (!abortController.signal.aborted) {
      const full = formatAiSdkApiError(err)
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

/** Minimal chat completion to verify API key, URL, and model ID. */
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

    const model = createModel(provider, modelId.trim())
    const { text } = await generateText({
      model,
      maxOutputTokens: 32,
      maxRetries: 0,
      messages: [{ role: 'user', content: TEST_USER_MESSAGE }]
    })
    const snippet = (text ?? '').trim().slice(0, 200)
    return { ok: true, modelId: modelId.trim(), replySnippet: snippet || '(empty reply)' }
  } catch (err) {
    return { ok: false, error: formatAiSdkApiError(err) }
  }
}
