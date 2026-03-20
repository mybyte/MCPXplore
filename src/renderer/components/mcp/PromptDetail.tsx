import { useState, useCallback } from 'react'
import { MessageSquare, Play, Loader2, User, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore, type CallHistoryEntry } from '@/stores/mcpStore'
import { logUiError } from '@/lib/rendererLog'
import { ChatMarkdown } from '@/components/chat/ChatMarkdown'

type PromptMessage = {
  role: string
  content:
    | string
    | { type: string; text?: string; data?: string; mimeType?: string }
    | { type: string; text?: string; data?: string; mimeType?: string }[]
}

type GetPromptResult = {
  description?: string
  messages?: PromptMessage[]
}

export function PromptDetail() {
  const selection = useMcpStore((s) => s.selection)
  const servers = useMcpStore((s) => s.servers)
  const addHistoryEntry = useMcpStore((s) => s.addHistoryEntry)

  if (selection?.type !== 'prompt') return null

  const server = servers.find((s) => s.id === selection.serverId)
  const prompt = server?.prompts.find((p) => p.name === selection.name)

  if (!prompt || !server) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">Prompt not found</p>
      </div>
    )
  }

  return (
    <PromptDetailInner
      key={`${selection.serverId}:${selection.name}`}
      prompt={prompt}
      serverId={selection.serverId}
      serverName={server.name}
      addHistoryEntry={addHistoryEntry}
    />
  )
}

function PromptDetailInner({
  prompt,
  serverId,
  serverName,
  addHistoryEntry
}: {
  prompt: { name: string; description?: string; arguments?: { name: string; description?: string; required?: boolean }[] }
  serverId: string
  serverName: string
  addHistoryEntry: (entry: CallHistoryEntry) => void
}) {
  const args = prompt.arguments ?? []
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(args.map((a) => [a.name, '']))
  )
  const [result, setResult] = useState<GetPromptResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState<number | undefined>()

  const handleRun = useCallback(async () => {
    setRunning(true)
    setResult(null)
    setError(null)
    const start = Date.now()
    const ts = start
    try {
      const nonEmpty: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v) nonEmpty[k] = v
      }
      const res = await window.api.mcpGetPrompt(serverId, prompt.name, nonEmpty)
      const dur = Date.now() - start
      setResult(res as GetPromptResult)
      setElapsed(dur)
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'prompt',
        itemName: prompt.name,
        args: nonEmpty,
        result: res,
        elapsed: dur
      })
    } catch (err) {
      const dur = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setElapsed(dur)
      logUiError('PromptDetail.run', err, { serverId, prompt: prompt.name })
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'prompt',
        itemName: prompt.name,
        args: values,
        result: null,
        error: msg,
        elapsed: dur
      })
    } finally {
      setRunning(false)
    }
  }, [serverId, prompt.name, values, serverName, addHistoryEntry])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          <h3 className="font-mono text-sm font-semibold">{prompt.name}</h3>
        </div>
        {prompt.description && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{prompt.description}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Arguments */}
        {args.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Arguments
            </p>
            {args.map((arg) => (
              <div key={arg.name} className="space-y-1">
                <label className="flex items-baseline gap-1 text-xs font-medium">
                  <span className="font-mono">{arg.name}</span>
                  {arg.required && <span className="text-destructive">*</span>}
                </label>
                {arg.description && (
                  <p className="text-[11px] text-muted-foreground">{arg.description}</p>
                )}
                <input
                  type="text"
                  value={values[arg.name] ?? ''}
                  onChange={(e) => setValues({ ...values, [arg.name]: e.target.value })}
                  disabled={running}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            ))}
          </div>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
          )}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Play className="size-3.5" />
          )}
          {running ? 'Getting prompt...' : 'Get Prompt'}
        </button>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Result: messages */}
        {result?.messages && result.messages.length > 0 && (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Messages ({result.messages.length})
              </p>
              {elapsed != null && (
                <span className="text-[11px] text-muted-foreground">
                  {elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`}
                </span>
              )}
            </div>
            {result.messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: PromptMessage }) {
  const isUser = message.role === 'user'
  const text = extractMessageText(message.content)

  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        isUser ? 'border-primary/20 bg-primary/5' : 'border-border bg-muted/30'
      )}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {isUser ? (
          <User className="size-3 text-primary" />
        ) : (
          <Bot className="size-3 text-muted-foreground" />
        )}
        <span className="text-[11px] font-medium text-muted-foreground uppercase">
          {message.role}
        </span>
      </div>
      <div className="text-sm">
        <ChatMarkdown content={text} variant={isUser ? 'user' : 'assistant'} />
      </div>
    </div>
  )
}

function extractMessageText(
  content:
    | string
    | { type: string; text?: string }
    | { type: string; text?: string }[]
): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text!)
      .join('\n')
  }
  return content.text ?? JSON.stringify(content, null, 2)
}
