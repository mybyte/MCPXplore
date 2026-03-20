import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionChunk } from 'openai/resources/chat/completions'
import { getMcpManager } from '../mcp/manager'

// ── Format conversion ─────────────────────────────────────────────────

/** How MCP tools are exposed to the chat completion API (OpenAI-compatible). */
export type McpToolsSelection =
  | { mode: 'all' }
  | { mode: 'pick'; keys: string[] }

/**
 * Builds the `tools` array for a chat completion request from MCP tools on
 * connected servers. Same shape for OpenAI, Azure OpenAI, Fireworks, OpenRouter.
 *
 * @param selection  `all` — every connected tool; `pick` — only `serverId:toolName`
 *                   keys listed (empty `keys` ⇒ no tools).
 * @returns          The `tools` param and a map from tool name → serverId for routing.
 */
export function buildChatCompletionTools(selection: McpToolsSelection): {
  tools: ChatCompletionTool[]
  serverMap: Map<string, string>
} {
  const mcpManager = getMcpManager()
  const allStatuses = mcpManager.getAllStatuses()
  const tools: ChatCompletionTool[] = []
  const serverMap = new Map<string, string>()
  const keySet = selection.mode === 'pick' ? new Set(selection.keys) : null

  for (const server of allStatuses) {
    if (server.status !== 'connected') continue
    for (const tool of server.tools) {
      const toolKey = `${server.id}:${tool.name}`
      if (keySet && !keySet.has(toolKey)) continue

      tools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description ?? tool.name,
          parameters: (tool.inputSchema as Record<string, unknown>) ?? {
            type: 'object',
            properties: {}
          }
        }
      })
      serverMap.set(tool.name, server.id)
    }
  }

  return { tools, serverMap }
}

// ── Streaming tool-call accumulation ──────────────────────────────────

export interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * Collects tool-call deltas streamed across multiple `ChatCompletionChunk`s
 * into complete {@link AccumulatedToolCall} objects.
 *
 * OpenAI streams tool calls with an index-based scheme:
 *  - The first chunk for a given index carries `id` and `function.name`.
 *  - Subsequent chunks for the same index append to `function.arguments`.
 */
export class ToolCallAccumulator {
  private calls = new Map<number, AccumulatedToolCall>()

  /** Feed one delta from `chunk.choices[0].delta.tool_calls`. */
  feed(delta: ChatCompletionChunk.Choice.Delta.ToolCall): void {
    let entry = this.calls.get(delta.index)
    if (!entry) {
      entry = { id: delta.id ?? '', name: '', arguments: '' }
      this.calls.set(delta.index, entry)
    }
    if (delta.id) entry.id = delta.id
    if (delta.function?.name) entry.name += delta.function.name
    if (delta.function?.arguments) entry.arguments += delta.function.arguments
  }

  /** Returns all accumulated tool calls (order preserved by index). */
  getAll(): AccumulatedToolCall[] {
    return Array.from(this.calls.entries())
      .sort(([a], [b]) => a - b)
      .map(([, v]) => v)
  }

  get size(): number {
    return this.calls.size
  }
}

// ── Execution ─────────────────────────────────────────────────────────

/**
 * Executes a single accumulated tool call via the MCP manager and returns
 * a stringified result suitable for the `role: 'tool'` message.
 */
export async function executeToolCall(
  call: AccumulatedToolCall,
  serverMap: Map<string, string>,
  options?: { signal?: AbortSignal }
): Promise<{ toolCallId: string; toolName: string; result: unknown; content: string }> {
  const serverId = serverMap.get(call.name)
  if (!serverId) throw new Error(`No MCP server found for tool "${call.name}"`)

  const mcpManager = getMcpManager()
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.arguments || '{}')
  } catch {
    args = {}
  }

  const result = await mcpManager.callTool(serverId, call.name, args, {
    signal: options?.signal
  })
  const content = typeof result === 'string' ? result : JSON.stringify(result)

  return { toolCallId: call.id, toolName: call.name, result, content }
}

// ── Result threading ──────────────────────────────────────────────────

/**
 * Builds the assistant message (with tool_calls) and subsequent tool-result
 * messages that must be appended to the conversation before the next API call.
 */
export function buildToolResultMessages(
  calls: AccumulatedToolCall[],
  results: Array<{ toolCallId: string; content: string }>,
  assistantContent: string
): ChatCompletionMessageParam[] {
  const assistantMsg: ChatCompletionMessageParam = {
    role: 'assistant' as const,
    content: assistantContent || null,
    tool_calls: calls.map((c) => ({
      id: c.id,
      type: 'function' as const,
      function: { name: c.name, arguments: c.arguments }
    }))
  }

  const toolMsgs: ChatCompletionMessageParam[] = results.map((r) => ({
    role: 'tool' as const,
    tool_call_id: r.toolCallId,
    content: r.content
  }))

  return [assistantMsg, ...toolMsgs]
}
