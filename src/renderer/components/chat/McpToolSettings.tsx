import { useMemo, useState } from 'react'
import { useMcpStore } from '@/stores/mcpStore'
import type { McpToolsMode } from '@/stores/chatStore'
import { Check, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface McpToolSettingsProps {
  mcpToolsMode: McpToolsMode
  enabledTools: string[]
  onModeChange: (mode: McpToolsMode) => void
  onToolsChange: (tools: string[]) => void
  className?: string
}

/**
 * Per-chat MCP tool allowlist UI for embedding in the chat side panel.
 */
export function McpToolSettings({
  mcpToolsMode,
  enabledTools,
  onModeChange,
  onToolsChange,
  className
}: McpToolSettingsProps) {
  const servers = useMcpStore((s) => s.servers)
  const connectedServers = servers.filter((s) => s.status === 'connected')
  const [query, setQuery] = useState('')

  const allToolKeys = useMemo(
    () => connectedServers.flatMap((s) => s.tools.map((t) => `${s.id}:${t.name}`)),
    [connectedServers]
  )

  const q = query.trim().toLowerCase()

  const toggleTool = (key: string) => {
    if (enabledTools.includes(key)) {
      onToolsChange(enabledTools.filter((t) => t !== key))
    } else {
      onToolsChange([...enabledTools, key])
    }
  }

  const pickSelectAll = () => onToolsChange([...allToolKeys])
  const pickSelectNone = () => onToolsChange([])

  const startCustomize = () => {
    onToolsChange([...allToolKeys])
    onModeChange('pick')
  }

  const keysForServer = (serverId: string) =>
    connectedServers.find((s) => s.id === serverId)?.tools.map((t) => `${serverId}:${t.name}`) ?? []

  const toggleServer = (serverId: string) => {
    const keys = keysForServer(serverId)
    const allOn = keys.length > 0 && keys.every((k) => enabledTools.includes(k))
    if (allOn) {
      onToolsChange(enabledTools.filter((k) => !keys.includes(k)))
    } else {
      const set = new Set([...enabledTools, ...keys])
      onToolsChange([...set])
    }
  }

  const serverCheckboxState = (serverId: string) => {
    const keys = keysForServer(serverId)
    if (keys.length === 0) return { checked: false, indeterminate: false }
    const n = keys.filter((k) => enabledTools.includes(k)).length
    if (n === 0) return { checked: false, indeterminate: false }
    if (n === keys.length) return { checked: true, indeterminate: false }
    return { checked: false, indeterminate: true }
  }

  const toolMatches = (serverId: string, toolName: string, description?: string) => {
    if (!q) return true
    const hay = `${toolName} ${description ?? ''}`.toLowerCase()
    return hay.includes(q)
  }

  const serverVisible = (
    serverId: string,
    serverName: string,
    tools: { name: string; description?: string }[]
  ) => {
    if (!q) return true
    if (serverName.toLowerCase().includes(q)) return true
    return tools.some((t) => toolMatches(serverId, t.name, t.description))
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="mb-2 text-xs font-medium">MCP tools (this chat)</p>
        <div
          className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
          role="tablist"
          aria-label="Tool selection mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mcpToolsMode === 'all'}
            className={cn(
              'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
              mcpToolsMode === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
            onClick={() => onModeChange('all')}
          >
            All connected
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mcpToolsMode === 'pick'}
            className={cn(
              'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
              mcpToolsMode === 'pick' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
            onClick={() => onModeChange('pick')}
          >
            Choose…
          </button>
        </div>
      </div>

      {mcpToolsMode === 'all' ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {connectedServers.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">No MCP servers connected.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The model can use every tool from connected servers ({allToolKeys.length} total).
              </p>
              <button
                type="button"
                onClick={startCustomize}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
              >
                Choose tools…
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tools…"
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={pickSelectAll} className="text-xs text-primary hover:underline">
                All
              </button>
              <button type="button" onClick={pickSelectNone} className="text-xs text-muted-foreground hover:underline">
                None
              </button>
            </div>
          </div>

          <p className="shrink-0 px-3 pt-2 text-[10px] text-muted-foreground">
            Only checked tools are sent to the model ({enabledTools.length}/{allToolKeys.length}).
            {enabledTools.length === 0 && allToolKeys.length > 0 ? (
              <span className="mt-1 block">None selected — use All or enable servers/tools below.</span>
            ) : null}
          </p>

          <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {connectedServers.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No MCP servers connected.</p>
            ) : (
              connectedServers.map((server) => {
                if (!serverVisible(server.id, server.name, server.tools)) return null
                const { checked, indeterminate } = serverCheckboxState(server.id)
                return (
                  <div key={server.id} className="mb-1">
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        ref={(el) => {
                          if (el) el.indeterminate = indeterminate
                        }}
                        onChange={() => toggleServer(server.id)}
                        className="size-3.5 shrink-0 rounded border-input accent-primary"
                        aria-label={`All tools from ${server.name}`}
                      />
                      <span className="min-w-0 flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {server.name}
                      </span>
                    </label>
                    {server.tools.map((tool) => {
                      const key = `${server.id}:${tool.name}`
                      if (!toolMatches(server.id, tool.name, tool.description)) return null
                      const enabled = enabledTools.includes(key)
                      return (
                        <button
                          key={key}
                          type="button"
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
                            aria-hidden
                          >
                            {enabled && <Check className="size-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-mono text-xs">{tool.name}</p>
                            {tool.description && (
                              <p className="truncate text-[10px] text-muted-foreground">{tool.description}</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
