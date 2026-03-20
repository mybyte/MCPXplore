import type { ToolSelectionConfig } from '../config/store'
import { getConfigStore } from '../config/store'
import { createClient, maxTokensParam } from './providers'
import { searchTools, type ToolSearchResult } from '../mongo/tool-search'

// ── Types ─────────────────────────────────────────────────────────────

export interface ToolSelectionInput {
  mode: 'semantic' | 'agentic'
  config: ToolSelectionConfig
  agenticSystemPrompt: string
  /** Conversation messages (user/assistant pairs), newest last. */
  messages: Array<{ role: string; content: string }>
  /** The latest user message (not yet in `messages`). */
  currentMessage: string
  signal?: AbortSignal
}

export interface ToolSearchResultItem {
  serverId: string
  name: string
  score: number
  description?: string
}

export interface SemanticTraceData {
  type: 'semantic'
  contextCharsSent: number
  embeddingFieldName: string
  durationMs: number
  results: ToolSearchResultItem[]
}

export interface AgenticTraceData {
  type: 'agentic'
  systemPrompt: string
  contextCharsSent: number
  justification: string
  composedQuery: string
  searchMode: string
  durationMs: number
  subAgentDurationMs: number
  /** Sub-agent reasoning/thinking content (model-dependent, may be empty). */
  subAgentReasoning: string
  /** Sub-agent text response outside the tool call (usually empty with forced tool_choice). */
  subAgentTextResponse: string
  subAgentUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  results: ToolSearchResultItem[]
}

export type ToolSelectionTraceData = SemanticTraceData | AgenticTraceData

export interface ToolSelectionResult {
  /** `serverId:toolName` keys to pass into buildChatCompletionTools as pick mode. */
  keys: string[]
  trace: ToolSelectionTraceData
}

// ── Helpers ───────────────────────────────────────────────────────────

const APPROX_CHARS_PER_TOKEN = 4

function extractConversationTail(
  messages: Array<{ role: string; content: string }>,
  currentMessage: string,
  tokenBudget: number
): string {
  const charBudget = tokenBudget * APPROX_CHARS_PER_TOKEN
  let text = currentMessage
  for (let i = messages.length - 1; i >= 0 && text.length < charBudget; i--) {
    const m = messages[i]
    const prefix = m.role === 'user' ? 'User: ' : 'Assistant: '
    text = prefix + m.content + '\n\n' + text
  }
  if (text.length > charBudget) {
    text = text.slice(text.length - charBudget)
  }
  return text
}

function mapResults(results: ToolSearchResult[]): ToolSearchResultItem[] {
  return results.map((r) => ({
    serverId: r.serverId,
    name: r.name,
    score: r.score,
    description: r.description
  }))
}

function resultKeys(results: ToolSearchResult[], scoreCutoff: number): string[] {
  return results
    .filter((r) => r.score >= scoreCutoff)
    .map((r) => `${r.serverId}:${r.name}`)
}

// ── Semantic resolution ───────────────────────────────────────────────

async function resolveSemantic(input: ToolSelectionInput): Promise<ToolSelectionResult> {
  const { config, messages, currentMessage } = input
  const start = Date.now()

  if (!config.semanticEmbeddingFieldName) {
    throw new Error('Semantic mode requires an embedding config to be selected.')
  }

  const tail = extractConversationTail(messages, currentMessage, config.semanticContextTokens)

  const results = await searchTools({
    query: tail,
    mode: 'vector',
    embeddingFieldName: config.semanticEmbeddingFieldName,
    limit: config.semanticToolLimit
  })

  const filtered = results.filter((r) => r.score >= config.semanticScoreCutoff)

  return {
    keys: resultKeys(results, config.semanticScoreCutoff),
    trace: {
      type: 'semantic',
      contextCharsSent: tail.length,
      embeddingFieldName: config.semanticEmbeddingFieldName,
      durationMs: Date.now() - start,
      results: mapResults(filtered)
    }
  }
}

// ── Agentic resolution ────────────────────────────────────────────────

const DEFAULT_AGENTIC_SYSTEM_PROMPT = `You are a tool-selection assistant. You will be given a conversation excerpt between a user and an AI assistant that has access to MCP (Model Context Protocol) tools.

Your ONLY job is to analyze the conversation and compose a concise search query that will be used to find the most relevant tools for the assistant's next response.

Focus on:
- What the user is asking for or trying to accomplish
- What kind of tools would be needed (e.g. database queries, file operations, API calls, code execution)
- Key domain terms and action verbs

Output a focused search query — not a sentence, but keywords and phrases that would match tool names and descriptions.`

const SEARCH_TOOLS_FUNCTION = {
  type: 'function' as const,
  function: {
    name: 'search_tools',
    description: 'Search for relevant MCP tools based on the conversation context.',
    parameters: {
      type: 'object',
      properties: {
        justification: {
          type: 'string',
          description: 'Brief explanation of why you chose this query — what the user needs, what capabilities are required, and your reasoning.'
        },
        query: {
          type: 'string',
          description: 'The search query to find relevant tools. Use keywords and phrases that match tool names and descriptions.'
        }
      },
      required: ['justification', 'query']
    }
  }
}

async function resolveAgentic(input: ToolSelectionInput): Promise<ToolSelectionResult> {
  const { config, messages, currentMessage, agenticSystemPrompt, signal } = input
  const overallStart = Date.now()

  const store = getConfigStore()
  const providers = store.get('llmProviders')
  const provider = providers.find((p) => p.id === config.agenticProviderId)
  if (!provider) {
    throw new Error(`Agentic sub-agent provider not found: ${config.agenticProviderId}`)
  }
  if (!config.agenticModelId) {
    throw new Error('Agentic sub-agent model is not configured.')
  }

  const systemPrompt = agenticSystemPrompt.trim() || DEFAULT_AGENTIC_SYSTEM_PROMPT
  const tail = extractConversationTail(messages, currentMessage, config.agenticContextTokens)

  const client = createClient(provider)
  const subAgentStart = Date.now()

  const completion = await client.chat.completions.create(
    {
      model: config.agenticModelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the conversation excerpt:\n\n${tail}` }
      ],
      tools: [SEARCH_TOOLS_FUNCTION],
      tool_choice: { type: 'function', function: { name: 'search_tools' } },
      ...maxTokensParam(provider, 512)
    },
    { signal }
  )

  const subAgentDuration = Date.now() - subAgentStart

  const choice = completion.choices[0]
  const message = choice?.message

  const subAgentReasoning = typeof (message as Record<string, unknown> | undefined)?.reasoning_content === 'string'
    ? (message as Record<string, unknown>).reasoning_content as string
    : ''
  const subAgentTextResponse = message?.content ?? ''

  const subAgentUsage = completion.usage
    ? {
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        totalTokens: completion.usage.total_tokens ?? 0
      }
    : undefined

  const toolCall = message?.tool_calls?.[0]
  if (!toolCall || toolCall.function.name !== 'search_tools') {
    throw new Error('Agentic sub-agent did not produce a search_tools call.')
  }

  let composedQuery: string
  let justification: string
  try {
    const parsed = JSON.parse(toolCall.function.arguments)
    justification = String(parsed.justification ?? '')
    composedQuery = String(parsed.query ?? '')
  } catch {
    justification = ''
    composedQuery = toolCall.function.arguments
  }

  if (!composedQuery.trim()) {
    throw new Error('Agentic sub-agent produced an empty search query.')
  }

  const needsEmbedding = config.agenticSearchMode === 'vector' || config.agenticSearchMode === 'hybrid'
  if (needsEmbedding && !config.agenticEmbeddingFieldName) {
    throw new Error('Agentic vector/hybrid search requires an embedding config to be selected.')
  }

  const results = await searchTools({
    query: composedQuery,
    mode: config.agenticSearchMode,
    embeddingFieldName: needsEmbedding ? config.agenticEmbeddingFieldName : undefined,
    limit: config.agenticToolLimit,
    ...(config.agenticSearchMode === 'hybrid'
      ? {
          hybrid: {
            fusionType: 'rank' as const,
            weights: config.agenticHybridWeights
          }
        }
      : {})
  })

  const filtered = results.filter((r) => r.score >= config.agenticScoreCutoff)

  return {
    keys: resultKeys(results, config.agenticScoreCutoff),
    trace: {
      type: 'agentic',
      systemPrompt,
      contextCharsSent: tail.length,
      justification,
      composedQuery,
      searchMode: config.agenticSearchMode,
      durationMs: Date.now() - overallStart,
      subAgentDurationMs: subAgentDuration,
      subAgentReasoning,
      subAgentTextResponse,
      subAgentUsage,
      results: mapResults(filtered)
    }
  }
}

// ── Public entry point ────────────────────────────────────────────────

export async function resolveToolSelection(input: ToolSelectionInput): Promise<ToolSelectionResult> {
  switch (input.mode) {
    case 'semantic':
      return resolveSemantic(input)
    case 'agentic':
      return resolveAgentic(input)
    default:
      throw new Error(`Unknown tool selection mode: ${input.mode}`)
  }
}

export { DEFAULT_AGENTIC_SYSTEM_PROMPT }
