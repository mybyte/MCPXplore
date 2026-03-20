import { useState } from 'react'
import {
  Circle,
  Plug,
  Unplug,
  Loader2,
  PlugZap,
  Plus,
  Pencil
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore } from '@/stores/mcpStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { logUiError } from '@/lib/rendererLog'

export function ServerRail({
  onAddServer,
  onEditServer
}: {
  onAddServer: () => void
  onEditServer: (id: string) => void
}) {
  const mcpConfigs = useSettingsStore((s) => s.mcpServers)
  const servers = useMcpStore((s) => s.servers)
  const activeServerId = useMcpStore((s) => s.activeServerId)
  const setActiveServer = useMcpStore((s) => s.setActiveServer)
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set())
  const [connectingAll, setConnectingAll] = useState(false)

  const handleConnect = async (id: string) => {
    setConnectingIds((s) => new Set(s).add(id))
    try {
      await window.api.mcpConnect(id)
    } catch (err) {
      logUiError('ServerRail.connect', err, { serverId: id })
    } finally {
      setConnectingIds((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }

  const handleDisconnect = async (id: string) => {
    try {
      await window.api.mcpDisconnect(id)
    } catch (err) {
      logUiError('ServerRail.disconnect', err, { serverId: id })
    }
  }

  const handleConnectAll = async () => {
    setConnectingAll(true)
    try {
      await window.api.mcpConnectAll()
    } catch (err) {
      logUiError('ServerRail.connectAll', err)
    } finally {
      setConnectingAll(false)
    }
  }

  if (mcpConfigs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-muted-foreground">No servers configured</p>
        <button
          onClick={onAddServer}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add Server
        </button>
      </div>
    )
  }

  const hasDisconnected = mcpConfigs.some((c) => {
    const s = servers.find((sv) => sv.id === c.id)
    return !s || s.status === 'disconnected' || s.status === 'error'
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Servers
        </span>
        <div className="flex items-center gap-0.5">
          {hasDisconnected && (
            <button
              onClick={handleConnectAll}
              disabled={connectingAll}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent transition-colors"
              title="Connect all"
            >
              {connectingAll ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <PlugZap className="size-3" />
              )}
            </button>
          )}
          <button
            onClick={onAddServer}
            className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent transition-colors"
            title="Add server"
          >
            <Plus className="size-3" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {mcpConfigs.map((config) => {
          const server = servers.find((s) => s.id === config.id)
          const status = server?.status ?? 'disconnected'
          const isConnecting = connectingIds.has(config.id)
          const isActive = activeServerId === config.id
          const isConnected = status === 'connected'

          return (
            <div
              key={config.id}
              className={cn(
                'group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
              onClick={() => setActiveServer(config.id)}
            >
              <Circle
                className={cn(
                  'size-2 shrink-0 fill-current',
                  status === 'connected' && 'text-green-500',
                  status === 'connecting' && 'text-yellow-500',
                  status === 'error' && 'text-red-500',
                  status === 'disconnected' && 'text-muted-foreground/40'
                )}
              />
              <span className="flex-1 truncate text-xs font-medium">{config.name}</span>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditServer(config.id)
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit server"
                >
                  <Pencil className="size-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    isConnected ? handleDisconnect(config.id) : handleConnect(config.id)
                  }}
                  disabled={isConnecting}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  title={isConnected ? 'Disconnect' : 'Connect'}
                >
                  {isConnecting ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : isConnected ? (
                    <Unplug className="size-3" />
                  ) : (
                    <Plug className="size-3" />
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {/* Error display for active server */}
      {(() => {
        const active = servers.find((s) => s.id === activeServerId)
        if (!active?.error) return null
        return (
          <div className="border-t border-border px-3 py-2">
            <p className="text-[11px] text-destructive leading-snug truncate" title={active.error}>
              {active.error}
            </p>
          </div>
        )
      })()}
    </div>
  )
}
