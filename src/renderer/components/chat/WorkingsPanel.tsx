import { useState } from 'react'
import {
  Brain,
  Wrench,
  BarChart3,
  ChevronDown,
  ChevronRight,
  X,
  Cpu,
  MessageSquare,
  SearchIcon,
  Timer,
  History,
  Radio
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { McpToolSettings, type McpToolSettingsProps } from './McpToolSettings'
import type { McpToolsMode, ToolSelectionConfig, MessageDurations } from '@/stores/chatStore'

export interface ToolSearchTraceItem {
  serverId: string
  name: string
  score: number
  description?: string
}

export interface ToolSearchTrace {
  type: 'semantic' | 'agentic'
  contextCharsSent: number
  durationMs: number
  results: ToolSearchTraceItem[]
  embeddingFieldName?: string
  systemPrompt?: string
  justification?: string
  composedQuery?: string
  searchMode?: string
  subAgentDurationMs?: number
  subAgentReasoning?: string
  subAgentTextResponse?: string
  subAgentUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export interface WorkingsData {
  reasoning: string
  toolCalls: Array<{
    id: string
    name: string
    args: Record<string, unknown>
    result?: unknown
    status: 'pending' | 'success' | 'error'
    startTime?: number
    endTime?: number
    durationMs?: number
  }>
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  durations?: MessageDurations
  model?: string
  toolSearchTrace?: ToolSearchTrace
}

export interface HistoricalTurn {
  _id: string
  chatId: string
  model?: string
  timestamp: number
  content?: string
  reasoning?: string
  toolSelection?: ToolSearchTrace
  toolCalls?: WorkingsData['toolCalls']
  usage?: WorkingsData['usage']
  durations?: MessageDurations
  error?: string
}

type SideTab = 'history' | 'tools'

interface WorkingsPanelProps {
  data: WorkingsData
  historicalTurns: HistoricalTurn[]
  isStreaming: boolean
  open: boolean
  onClose: () => void
  mcpToolsMode: McpToolsMode
  enabledTools: string[]
  systemPrompt: string
  agenticSystemPrompt: string
  toolSelectionConfig: ToolSelectionConfig
  onMcpModeChange: (mode: McpToolsMode) => void
  onMcpToolsChange: (tools: string[]) => void
  onSystemPromptChange: (value: string) => void
  onAgenticSystemPromptChange: (value: string) => void
  onToolSelectionConfigChange: (patch: Partial<ToolSelectionConfig>) => void
}

export function WorkingsPanel({
  data,
  historicalTurns,
  isStreaming,
  open,
  onClose,
  mcpToolsMode,
  enabledTools,
  systemPrompt,
  agenticSystemPrompt,
  toolSelectionConfig,
  onMcpModeChange,
  onMcpToolsChange,
  onSystemPromptChange,
  onAgenticSystemPromptChange,
  onToolSelectionConfigChange
}: WorkingsPanelProps) {
  const [tab, setTab] = useState<SideTab>('history')

  if (!open) return null

  const toolSettingsProps: McpToolSettingsProps = {
    mcpToolsMode,
    enabledTools,
    systemPrompt,
    agenticSystemPrompt,
    toolSelectionConfig,
    onModeChange: onMcpModeChange,
    onToolsChange: onMcpToolsChange,
    onSystemPromptChange,
    onAgenticSystemPromptChange,
    onToolSelectionConfigChange
  }

  const toolsTabActive = mcpToolsMode !== 'all'

  return (
    <div className="flex h-full min-h-0 w-[22rem] shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div
          className="flex min-w-0 flex-1 gap-0.5 rounded-md bg-muted/50 p-0.5"
          role="tablist"
          aria-label="Panel section"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            onClick={() => setTab('history')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
              tab === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            <History className="size-3 shrink-0" />
            <span className="truncate">History</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tools'}
            onClick={() => setTab('tools')}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
              tab === 'tools' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            <Wrench className="size-3 shrink-0" />
            <span className="truncate">MCP tools</span>
            {toolsTabActive ? (
              <span
                className="absolute right-1 top-1 size-1.5 rounded-full bg-primary"
                aria-hidden
              />
            ) : null}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
          aria-label="Close panel"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {tab === 'history' ? (
          <WorkingsHistoryTab data={data} historicalTurns={historicalTurns} isStreaming={isStreaming} />
        ) : (
          <McpToolSettings {...toolSettingsProps} />
        )}
      </div>
    </div>
  )
}

function WorkingsHistoryTab({
  data,
  historicalTurns,
  isStreaming
}: {
  data: WorkingsData
  historicalTurns: HistoricalTurn[]
  isStreaming: boolean
}) {
  const liveHasContent =
    data.reasoning || data.toolCalls.length > 0 || data.usage || data.durations || data.model || data.toolSearchTrace
  const showLive = isStreaming || liveHasContent

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      {!showLive && historicalTurns.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">
          Send a message to see the model&apos;s workings here.
        </p>
      )}

      {showLive && (
        <TurnCard
          label={isStreaming ? 'Streaming...' : 'Latest turn'}
          model={data.model}
          timestamp={undefined}
          defaultExpanded
          isLive={isStreaming}
        >
          <TurnWorkings
            reasoning={data.reasoning}
            toolCalls={data.toolCalls}
            usage={data.usage}
            durations={data.durations}
            toolSearchTrace={data.toolSearchTrace}
          />
        </TurnCard>
      )}

      {historicalTurns.map((t) => (
        <TurnCard
          key={t._id}
          label={undefined}
          model={t.model}
          timestamp={t.timestamp}
          defaultExpanded={!showLive && historicalTurns[0]?._id === t._id}
          isLive={false}
        >
          <TurnWorkings
            reasoning={t.reasoning}
            toolCalls={t.toolCalls ?? []}
            usage={t.usage}
            durations={t.durations}
            toolSearchTrace={t.toolSelection}
            error={t.error}
          />
        </TurnCard>
      ))}
    </div>
  )
}

function TurnCard({
  label,
  model,
  timestamp,
  defaultExpanded,
  isLive,
  children
}: {
  label?: string
  model?: string
  timestamp?: number
  defaultExpanded: boolean
  isLive: boolean
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const timeStr = timestamp ? new Date(timestamp).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }) : undefined

  return (
    <div className={cn('mb-2 rounded-lg border', isLive ? 'border-primary/40' : 'border-border')}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        {isLive ? (
          <Radio className="size-3 text-primary animate-pulse" />
        ) : (
          <MessageSquare className="size-3 text-muted-foreground" />
        )}
        <span className="flex-1 min-w-0">
          {label && <span className="text-xs font-medium">{label}</span>}
          {!label && model && (
            <span className="block truncate text-[11px] text-muted-foreground">{model}</span>
          )}
          {timeStr && (
            <span className="block text-[10px] text-muted-foreground/70">{timeStr}</span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 py-2.5 space-y-3">
          {model && label && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
              <Cpu className="size-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{model}</span>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}

function TurnWorkings({
  reasoning,
  toolCalls,
  usage,
  durations,
  toolSearchTrace,
  error
}: {
  reasoning?: string
  toolCalls: WorkingsData['toolCalls']
  usage?: WorkingsData['usage']
  durations?: MessageDurations
  toolSearchTrace?: ToolSearchTrace
  error?: string
}) {
  return (
    <>
      {durations && <DurationsSection durations={durations} />}
      {toolSearchTrace && <ToolSearchSection trace={toolSearchTrace} />}
      {reasoning && <ReasoningSection text={reasoning} durationMs={durations?.reasoningMs} />}
      {toolCalls.map((tc) => (
        <ToolCallSection key={tc.id} toolCall={tc} />
      ))}
      {usage && <UsageSection usage={usage} />}
      {error && (
        <div className="rounded-md border border-red-500/30 px-2.5 py-2">
          <p className="text-[10px] font-medium text-red-500 mb-1">Error</p>
          <p className="text-[10px] text-muted-foreground whitespace-pre-wrap">{error}</p>
        </div>
      )}
    </>
  )
}

// ── Tool search trace ─────────────────────────────────────────────────

function ToolSearchSection({ trace }: { trace: ToolSearchTrace }) {
  const [expanded, setExpanded] = useState(true)
  const label = trace.type === 'semantic' ? 'Semantic tool search' : 'Agentic tool search'

  return (
    <div className="rounded-md border border-indigo-500/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <SearchIcon className="size-3 text-indigo-500" />
        <span className="flex-1 text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground">{trace.durationMs}ms</span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          {trace.type === 'agentic' && (
            <>
              {trace.systemPrompt && (
                <TraceField label="Sub-agent system prompt">
                  <pre className="max-h-24 overflow-y-auto rounded bg-muted p-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                    {trace.systemPrompt}
                  </pre>
                </TraceField>
              )}
              {trace.subAgentReasoning && (
                <TraceField label="Sub-agent reasoning">
                  <pre className="max-h-32 overflow-y-auto rounded bg-purple-500/5 border border-purple-500/20 p-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                    {trace.subAgentReasoning}
                  </pre>
                </TraceField>
              )}
              {trace.subAgentTextResponse && (
                <TraceField label="Sub-agent text response">
                  <pre className="max-h-24 overflow-y-auto rounded bg-muted p-1.5 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
                    {trace.subAgentTextResponse}
                  </pre>
                </TraceField>
              )}
              {trace.justification && (
                <TraceField label="Justification">
                  <p className="rounded bg-muted p-1.5 text-[10px] leading-relaxed">
                    {trace.justification}
                  </p>
                </TraceField>
              )}
              {trace.composedQuery && (
                <TraceField label="Composed query">
                  <p className="rounded bg-muted p-1.5 font-mono text-[10px] leading-relaxed">
                    {trace.composedQuery}
                  </p>
                </TraceField>
              )}
              <div className="flex flex-wrap gap-3">
                {trace.searchMode && (
                  <TraceField label="Search mode">
                    <p className="text-[10px]">{trace.searchMode}</p>
                  </TraceField>
                )}
                {trace.subAgentDurationMs !== undefined && (
                  <TraceField label="Sub-agent time">
                    <p className="text-[10px]">{trace.subAgentDurationMs}ms</p>
                  </TraceField>
                )}
                {trace.subAgentUsage && (
                  <TraceField label="Sub-agent tokens">
                    <p className="text-[10px]">{trace.subAgentUsage.promptTokens}in / {trace.subAgentUsage.completionTokens}out</p>
                  </TraceField>
                )}
              </div>
            </>
          )}

          {trace.type === 'semantic' && trace.embeddingFieldName && (
            <TraceField label="Embedding config">
              <p className="text-[10px]">{trace.embeddingFieldName}</p>
            </TraceField>
          )}

          <TraceField label="Context sent">
            <p className="text-[10px]">~{Math.round(trace.contextCharsSent / 4)} tokens ({trace.contextCharsSent} chars)</p>
          </TraceField>

          <TraceField label={`Selected tools (${trace.results.length})`}>
            {trace.results.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">No tools matched.</p>
            ) : (
              <div className="space-y-1">
                {trace.results.map((r) => (
                  <div key={`${r.serverId}:${r.name}`} className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono text-[10px]">{r.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {r.score.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </TraceField>
        </div>
      )}
    </div>
  )
}

function TraceField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

// ── Existing sections (unchanged) ─────────────────────────────────────

function ReasoningSection({ text, durationMs }: { text: string; durationMs?: number }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <Brain className="size-3 text-purple-500" />
        <span className="flex-1 text-xs font-medium">Reasoning</span>
        {durationMs !== undefined && (
          <span className="text-[10px] text-muted-foreground">{fmtMs(durationMs)}</span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  )
}

function ToolCallSection({
  toolCall
}: {
  toolCall: WorkingsData['toolCalls'][number]
}) {
  const [expanded, setExpanded] = useState(true)
  const duration =
    toolCall.durationMs ?? (toolCall.startTime && toolCall.endTime ? toolCall.endTime - toolCall.startTime : undefined)

  return (
    <div
      className={cn(
        'rounded-md border',
        toolCall.status === 'pending' && 'border-yellow-500/30',
        toolCall.status === 'success' && 'border-border',
        toolCall.status === 'error' && 'border-red-500/30'
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <Wrench className="size-3 text-blue-500" />
        <span className="flex-1 truncate font-mono text-xs font-medium">{toolCall.name}</span>
        {duration !== undefined && (
          <span className="text-[10px] text-muted-foreground">{duration}ms</span>
        )}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border px-2.5 py-2">
          <div>
            <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Arguments</p>
            <pre className="overflow-x-auto rounded bg-muted p-1.5 font-mono text-[10px] leading-relaxed">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Result</p>
              <pre className="max-h-32 overflow-x-auto overflow-y-auto rounded bg-muted p-1.5 font-mono text-[10px] leading-relaxed">
                {typeof toolCall.result === 'string'
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function UsageSection({ usage }: { usage: NonNullable<WorkingsData['usage']> }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <BarChart3 className="size-3 text-green-500" />
        <span className="text-xs font-medium">Token usage</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground">Input</p>
          <p className="text-xs font-mono">{(usage.promptTokens ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Output</p>
          <p className="text-xs font-mono">{(usage.completionTokens ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">Total</p>
          <p className="text-xs font-mono">{(usage.totalTokens ?? 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  )
}

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

interface TimelineStep {
  label: string
  ms: number
  color: string
}

const STEP_COLORS: Record<string, string> = {
  'Tool selection': 'bg-indigo-500',
  Reasoning: 'bg-purple-500',
  'Text generation': 'bg-sky-500',
  'Tool calls': 'bg-blue-500',
  'Output generation': 'bg-emerald-500'
}

function DurationsSection({ durations }: { durations: MessageDurations }) {
  const [expanded, setExpanded] = useState(true)

  const steps: TimelineStep[] = []
  if (durations.toolSelectionMs !== undefined) {
    steps.push({ label: 'Tool selection', ms: durations.toolSelectionMs, color: STEP_COLORS['Tool selection'] })
  }
  if (durations.reasoningMs !== undefined) {
    steps.push({ label: 'Reasoning', ms: durations.reasoningMs, color: STEP_COLORS['Reasoning'] })
  }
  if (durations.generationMs !== undefined) {
    steps.push({ label: 'Text generation', ms: durations.generationMs, color: STEP_COLORS['Text generation'] })
  }
  if (durations.toolCallsMs > 0) {
    steps.push({ label: 'Tool calls', ms: durations.toolCallsMs, color: STEP_COLORS['Tool calls'] })
  }
  if (durations.outputMs !== undefined) {
    steps.push({ label: 'Output generation', ms: durations.outputMs, color: STEP_COLORS['Output generation'] })
  }

  const maxMs = Math.max(...steps.map((s) => s.ms), 1)

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <Timer className="size-3 text-amber-500" />
        <span className="flex-1 text-xs font-medium">Timeline</span>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {fmtMs(durations.totalMs)}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 py-2.5">
          {durations.firstTokenMs !== undefined && (
            <div className="mb-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Time to first token</span>
              <span className="font-mono tabular-nums">{fmtMs(durations.firstTokenMs)}</span>
            </div>
          )}

          {steps.length > 0 && (
            <div className="relative ml-[3px]">
              <div className="absolute left-0 top-[5px] bottom-[5px] w-px bg-border" />
              <div className="space-y-2.5">
                {steps.map((step) => {
                  const widthPct = Math.max((step.ms / maxMs) * 100, 6)
                  return (
                    <div key={step.label} className="relative pl-4">
                      <div className={cn('absolute left-[-2.5px] top-[5px] size-[6px] rounded-full', step.color)} />
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] text-muted-foreground">{step.label}</span>
                        <span className="text-[10px] font-mono tabular-nums text-foreground">
                          {fmtMs(step.ms)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', step.color)}
                          style={{ width: `${widthPct}%`, opacity: 0.7 }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
