import { useState } from 'react'
import {
  Brain,
  Wrench,
  BarChart3,
  ChevronDown,
  ChevronRight,
  X,
  Cpu
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface WorkingsPanelProps {
  data: WorkingsData
  open: boolean
  onClose: () => void
}

export function WorkingsPanel({ data, open, onClose }: WorkingsPanelProps) {
  if (!open) return null

  const hasContent =
    data.reasoning || data.toolCalls.length > 0 || data.usage || data.model

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Workings
        </span>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!hasContent && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Send a message to see the model's workings here.
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
          <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {text}
          </p>
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
    toolCall.startTime && toolCall.endTime
      ? toolCall.endTime - toolCall.startTime
      : undefined

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
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <Wrench className="size-3 text-blue-500" />
        <span className="text-xs font-mono font-medium flex-1 truncate">{toolCall.name}</span>
        {duration !== undefined && (
          <span className="text-[10px] text-muted-foreground">{duration}ms</span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 py-2 space-y-2">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Arguments</p>
            <pre className="overflow-x-auto rounded bg-muted p-1.5 font-mono text-[10px] leading-relaxed">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          </div>
          {toolCall.result !== undefined && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Result</p>
              <pre className="overflow-x-auto rounded bg-muted p-1.5 font-mono text-[10px] leading-relaxed max-h-32 overflow-y-auto">
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

function UsageSection({
  usage
}: {
  usage: NonNullable<WorkingsData['usage']>
}) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <BarChart3 className="size-3 text-green-500" />
        <span className="text-xs font-medium">Token Usage</span>
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
