import { useMcpStore, type McpTool } from '@/stores/mcpStore'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolPickerProps {
  enabledTools: string[]
  onChange: (tools: string[]) => void
  open: boolean
  onClose: () => void
}

export function ToolPicker({ enabledTools, onChange, open, onClose }: ToolPickerProps) {
  const servers = useMcpStore((s) => s.servers)
  const connectedServers = servers.filter((s) => s.status === 'connected')

  if (!open) return null

  const allTools = connectedServers.flatMap((s) =>
    s.tools.map((t) => ({ ...t, key: `${s.id}:${t.name}`, serverName: s.name }))
  )

  const toggleTool = (key: string) => {
    if (enabledTools.includes(key)) {
      onChange(enabledTools.filter((t) => t !== key))
    } else {
      onChange([...enabledTools, key])
    }
  }

  const selectAll = () => onChange(allTools.map((t) => t.key))
  const selectNone = () => onChange([])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover */}
      <div className="absolute bottom-full left-0 mb-2 z-50 w-80 max-h-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-medium">
            MCP Tools ({enabledTools.length}/{allTools.length})
          </span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-primary hover:underline">
              All
            </button>
            <button onClick={selectNone} className="text-xs text-muted-foreground hover:underline">
              None
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-1">
          {connectedServers.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">
              No MCP servers connected.
            </p>
          ) : (
            connectedServers.map((server) => (
              <div key={server.id}>
                <p className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {server.name}
                </p>
                {server.tools.map((tool) => {
                  const key = `${server.id}:${tool.name}`
                  const enabled = enabledTools.includes(key)
                  return (
                    <button
                      key={key}
                      onClick={() => toggleTool(key)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                        enabled ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                    >
                      <div
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded border',
                          enabled
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input'
                        )}
                      >
                        {enabled && <Check className="size-3" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs">{tool.name}</p>
                        {tool.description && (
                          <p className="truncate text-[10px] text-muted-foreground">
                            {tool.description}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
