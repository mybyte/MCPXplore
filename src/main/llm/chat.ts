import { BrowserWindow } from 'electron'
import { streamText, type LanguageModelV1 } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAzure } from '@ai-sdk/azure'
import { getConfigStore, type LlmProviderConfig } from '../config/store'
import { getMcpManager } from '../mcp/manager'

const activeAbortControllers = new Map<string, AbortController>()

function createModel(provider: LlmProviderConfig, modelId: string): LanguageModelV1 {
  switch (provider.type) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: provider.apiKey, baseURL: provider.baseUrl })
      return openai(modelId)
    }
    case 'azure': {
      const azure = createAzure({ apiKey: provider.apiKey, baseURL: provider.baseUrl })
      return azure(modelId)
    }
    case 'openai-compatible': {
      const compat = createOpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseUrl,
        compatibility: 'compatible'
      })
      return compat(modelId)
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
  }
): Promise<void> {
  const store = getConfigStore()
  const providers = store.get('llmProviders')
  const provider = providers.find((p) => p.id === options.providerId)
  if (!provider) throw new Error(`Provider not found: ${options.providerId}`)

  const model = createModel(provider, options.modelId)
  const messageId = `msg-${Date.now()}`
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
          broadcast({ type: 'text-delta', chatId, messageId, data: part.textDelta })
          break
        case 'reasoning':
          broadcast({ type: 'reasoning-delta', chatId, messageId, data: part.textDelta })
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
        case 'error':
          broadcast({ type: 'error', chatId, messageId, data: String(part.error) })
          break
      }
    }

    const usage = await result.usage
    broadcast({
      type: 'usage',
      chatId,
      messageId,
      data: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens }
    })

    broadcast({ type: 'finish', chatId, messageId })
  } catch (err) {
    if (!abortController.signal.aborted) {
      broadcast({
        type: 'error',
        chatId,
        messageId,
        data: err instanceof Error ? err.message : String(err)
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
