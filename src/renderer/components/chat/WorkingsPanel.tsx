import { useState } from 'react'
import {
  Brain,
  Wrench,
  BarChart3,
  ChevronDown,
  ChevronRight,
  X,
  Cpu,
  MessageSquare
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { McpToolSettings, type McpToolSettingsProps } from './McpToolSettings'
import type { McpToolsMode } from '@/stores/chatStore'

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
  }>
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  model?: string
}

type SideTab = 'reply' | 'tools'

interface WorkingsPanelProps {
  data: WorkingsData
  open: boolean
  onClose: () => void
  mcpToolsMode: McpToolsMode
  enabledTools: string[]
  onMcpModeChange: (mode: McpToolsMode) => void
  onMcpToolsChange: (tools: string[]) => void
}

export function WorkingsPanel({
  data,
  open,
  onClose,
  mcpToolsMode,
  enabledTools,
  onMcpModeChange,
  onMcpToolsChange
}: WorkingsPanelProps) {
  const [tab, setTab] = useState<SideTab>('reply')

  if (!open) return null

  const toolSettingsProps: McpToolSettingsProps = {
    mcpToolsMode,
    enabledTools,
    onModeChange: onMcpModeChange,
    onToolsChange: onMcpToolsChange
  }

  const toolsTabActive = mcpToolsMode === 'pick'

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
            aria-selected={tab === 'reply'}
            onClick={() => setTab('reply')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
              tab === 'reply' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            <MessageSquare className="size-3 shrink-0" />
            <span className="truncate">Last reply</span>
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
        {tab === 'reply' ? (
          <WorkingsReplyTab data={data} />
        ) : (
          <McpToolSettings {...toolSettingsProps} />
        )}
      </div>
    </div>
  )
}

function WorkingsReplyTab({ data }: { data: WorkingsData }) {
  const hasContent =
    data.reasoning || data.toolCalls.length > 0 || data.usage || data.model

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Reasoning, tool calls, and usage for the latest assistant response
      </p>
      <div className="space-y-3">
        {!hasContent && (
          <p className="text-center text-xs text-muted-foreground py-8">
            Send a message to see the model&apos;s workings here.
          </p>
        )}

        {data.model && (
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
            <Cpu className="size-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{data.model}</span>
          </div>
        )}

        {data.reasoning && <ReasoningSection text={data.reasoning} />}

        {data.toolCalls.map((tc) => (
          <ToolCallSection key={tc.id} toolCall={tc} />
        ))}

        {data.usage && <UsageSection usage={data.usage} />}
      </div>
    </div>
  )
}

function ReasoningSection({ text }: { text: string }) {
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
        <span className="text-xs font-medium">Reasoning</span>
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
    toolCall.startTime && toolCall.endTime ? toolCall.endTime - toolCall.startTime : undefined

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
