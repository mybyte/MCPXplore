import { History, Wrench, FileText, MessageSquare, AlertCircle, Trash2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore, type CallHistoryEntry } from '@/stores/mcpStore'

type CallHistoryProps = {
  onRestore?: (entry: CallHistoryEntry) => void
}

export function CallHistory({ onRestore }: CallHistoryProps) {
  const history = useMcpStore((s) => s.callHistory)
  const clearHistory = useMcpStore((s) => s.clearHistory)
  const setSelection = useMcpStore((s) => s.setSelection)
  const setExplorerTab = useMcpStore((s) => s.setExplorerTab)
  const setActiveServer = useMcpStore((s) => s.setActiveServer)

  if (history.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <History className="size-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">No calls yet</p>
      </div>
    )
  }

  const handleNavigate = (entry: CallHistoryEntry) => {
    setActiveServer(entry.serverId)
    if (entry.kind === 'tool') {
      setExplorerTab('tools')
      setSelection({ type: 'tool', serverId: entry.serverId, name: entry.itemName })
    } else if (entry.kind === 'resource') {
      setExplorerTab('resources')
      const uri = (entry.args as Record<string, string>).uri ?? (entry.args as Record<string, string>).uriTemplate ?? entry.itemName
      setSelection({ type: 'resource', serverId: entry.serverId, uri })
    } else if (entry.kind === 'prompt') {
      setExplorerTab('prompts')
      setSelection({ type: 'prompt', serverId: entry.serverId, name: entry.itemName })
    }
    onRestore?.(entry)
  }

  const kindIcon = (kind: string) => {
    switch (kind) {
      case 'tool':
        return <Wrench className="size-3" />
      case 'resource':
        return <FileText className="size-3" />
      case 'prompt':
        return <MessageSquare className="size-3" />
      default:
        return null
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          History
        </span>
        <button
          onClick={clearHistory}
          className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
          title="Clear history"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {history.map((entry) => (
          <button
            key={entry.id}
            onClick={() => handleNavigate(entry)}
            className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors group"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{kindIcon(entry.kind)}</span>
              <span className="flex-1 text-xs font-mono font-medium truncate">
                {entry.itemName}
              </span>
              {entry.error && <AlertCircle className="size-3 text-destructive shrink-0" />}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              <span>{entry.serverName}</span>
              <span>{entry.elapsed < 1000 ? `${entry.elapsed}ms` : `${(entry.elapsed / 1000).toFixed(1)}s`}</span>
              <span>{formatTime(entry.timestamp)}</span>
              <RotateCcw className="size-2.5 opacity-0 group-hover:opacity-100 ml-auto transition-opacity" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
