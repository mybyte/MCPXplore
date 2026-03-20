import { useState, useCallback } from 'react'
import { Play, Loader2, RotateCcw, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore, type McpTool, type CallHistoryEntry } from '@/stores/mcpStore'
import { logUiError } from '@/lib/rendererLog'
import { SchemaForm } from './SchemaForm'
import { OutputRenderer, type McpCallResult } from './OutputRenderer'

export function ToolDetail() {
  const selection = useMcpStore((s) => s.selection)
  const servers = useMcpStore((s) => s.servers)
  const addHistoryEntry = useMcpStore((s) => s.addHistoryEntry)

  if (selection?.type !== 'tool') return null

  const server = servers.find((s) => s.id === selection.serverId)
  const tool = server?.tools.find((t) => t.name === selection.name)

  if (!tool || !server) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">Tool not found</p>
      </div>
    )
  }

  return (
    <ToolDetailInner
      key={`${selection.serverId}:${selection.name}`}
      tool={tool}
      serverId={selection.serverId}
      serverName={server.name}
      addHistoryEntry={addHistoryEntry}
    />
  )
}

function ToolDetailInner({
  tool,
  serverId,
  serverName,
  addHistoryEntry
}: {
  tool: McpTool
  serverId: string
  serverName: string
  addHistoryEntry: (entry: CallHistoryEntry) => void
}) {
  const [args, setArgs] = useState<Record<string, unknown>>({})
  const [result, setResult] = useState<McpCallResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState<number | undefined>()
  const [timestamp, setTimestamp] = useState<number | undefined>()

  const schema = (tool.inputSchema ?? { type: 'object', properties: {} }) as {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
  }

  const handleRun = useCallback(async () => {
    setRunning(true)
    setResult(null)
    setError(null)
    const start = Date.now()
    const ts = start
    try {
      const res = await window.api.mcpCallTool(serverId, tool.name, args)
      const dur = Date.now() - start
      setResult(res as McpCallResult)
      setElapsed(dur)
      setTimestamp(ts)
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'tool',
        itemName: tool.name,
        args: { ...args },
        result: res,
        elapsed: dur
      })
    } catch (err) {
      const dur = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setElapsed(dur)
      setTimestamp(ts)
      logUiError('ToolDetail.run', err, { serverId, tool: tool.name })
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'tool',
        itemName: tool.name,
        args: { ...args },
        result: null,
        error: msg,
        elapsed: dur
      })
    } finally {
      setRunning(false)
    }
  }, [serverId, tool.name, args, serverName, addHistoryEntry])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-muted-foreground" />
          <h3 className="font-mono text-sm font-semibold">{tool.name}</h3>
        </div>
        {tool.description && (
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{tool.description}</p>
        )}
      </div>

      {/* Form + Output */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Arguments form */}
          <SchemaForm
            schema={schema as never}
            value={args}
            onChange={setArgs}
            disabled={running}
          />

          {/* Run button */}
          <div className="flex items-center gap-2">
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
              {running ? 'Running...' : 'Run'}
            </button>
            {result && !running && (
              <button
                onClick={handleRun}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                <RotateCcw className="size-3" /> Re-run
              </button>
            )}
          </div>

          {/* Output */}
          {(result || error) && (
            <div className="border-t border-border pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Result
              </p>
              <OutputRenderer
                result={result}
                error={error}
                elapsed={elapsed}
                serverName={serverName}
                timestamp={timestamp}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
