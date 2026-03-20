import { useState } from 'react'
import { useMcpStore, type McpTool, type McpResource } from '@/stores/mcpStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useAppStore } from '@/stores/appStore'
import {
  Blocks,
  Plug,
  Unplug,
  Play,
  ChevronDown,
  ChevronRight,
  FileText,
  Wrench,
  Circle,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logUiError } from '@/lib/rendererLog'

export function McpExplorer() {
  const servers = useMcpStore((s) => s.servers)
  const mcpConfigs = useSettingsStore((s) => s.mcpServers)
  const setView = useAppStore((s) => s.setView)
  const [connectingIds, setConnectingIds] = useState<Set<string>>(new Set())

  if (mcpConfigs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <Blocks className="size-12 opacity-30" />
        <p className="text-lg">No MCP servers configured</p>
        <button
          onClick={() => setView('settings')}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add MCP Server
        </button>
      </div>
    )
  }

  const handleConnect = async (id: string) => {
    setConnectingIds((s) => new Set(s).add(id))
    try {
      await window.api.mcpConnect(id)
    } catch (err) {
      logUiError('McpExplorer.connect', err, { serverId: id })
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
      logUiError('McpExplorer.disconnect', err, { serverId: id })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">MCP Explorer</h2>
        <p className="text-sm text-muted-foreground">
          Connect to servers, inspect tools, call them, and browse resources.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-4">
          {mcpConfigs.map((config) => {
            const server = servers.find((s) => s.id === config.id)
            const isConnecting = connectingIds.has(config.id)
            const isConnected = server?.status === 'connected'

            return (
              <ServerCard
                key={config.id}
                name={config.name}
                transport={config.transport}
                status={server?.status ?? 'disconnected'}
                error={server?.error}
                tools={server?.tools ?? []}
                resources={server?.resources ?? []}
                isConnecting={isConnecting}
                onConnect={() => handleConnect(config.id)}
                onDisconnect={() => handleDisconnect(config.id)}
                serverId={config.id}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ServerCard({
  name,
  transport,
  status,
  error,
  tools,
  resources,
  isConnecting,
  onConnect,
  onDisconnect,
  serverId
}: {
  name: string
  transport: string
  status: string
  error?: string
  tools: McpTool[]
  resources: McpResource[]
  isConnecting: boolean
  onConnect: () => void
  onDisconnect: () => void
  serverId: string
}) {
  const [expanded, setExpanded] = useState(true)
  const [activeTab, setActiveTab] = useState<'tools' | 'resources'>('tools')

  return (
    <div className="rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground">
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
          <div className="flex items-center gap-2">
            <Circle
              className={cn(
                'size-2 fill-current',
                status === 'connected' && 'text-green-500',
                status === 'connecting' && 'text-yellow-500',
                status === 'error' && 'text-red-500',
                status === 'disconnected' && 'text-muted-foreground/40'
              )}
            />
            <span className="font-medium text-sm">{name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {transport}
            </span>
          </div>
        </div>
        <div>
          {status === 'connected' ? (
            <button
              onClick={onDisconnect}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              <Unplug className="size-3" /> Disconnect
            </button>
          ) : (
            <button
              onClick={onConnect}
              disabled={isConnecting}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isConnecting ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plug className="size-3" />
              )}
              Connect
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {expanded && status === 'connected' && (
        <div className="border-t border-border">
          {/* Tab bar */}
          <div className="flex gap-4 px-4 border-b border-border">
            <button
              onClick={() => setActiveTab('tools')}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors',
                activeTab === 'tools'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Wrench className="size-3" /> Tools ({tools.length})
            </button>
            <button
              onClick={() => setActiveTab('resources')}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors',
                activeTab === 'resources'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <FileText className="size-3" /> Resources ({resources.length})
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'tools' && <ToolsList tools={tools} serverId={serverId} />}
            {activeTab === 'resources' && (
              <ResourcesList resources={resources} serverId={serverId} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolsList({ tools, serverId }: { tools: McpTool[]; serverId: string }) {
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [argsJson, setArgsJson] = useState('{}')
  const [result, setResult] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  if (tools.length === 0) {
    return <p className="text-xs text-muted-foreground">No tools available.</p>
  }

  const handleRun = async () => {
    if (!selectedTool) return
    setRunning(true)
    setResult(null)
    try {
      const args = JSON.parse(argsJson)
      const res = await window.api.mcpCallTool(serverId, selectedTool, args)
      setResult(JSON.stringify(res, null, 2))
    } catch (err) {
      logUiError('McpExplorer.mcpCallTool', err, { serverId, tool: selectedTool })
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      {tools.map((tool) => (
        <div
          key={tool.name}
          className={cn(
            'rounded-md border px-3 py-2 cursor-pointer transition-colors',
            selectedTool === tool.name
              ? 'border-primary bg-primary/5'
              : 'border-border/50 bg-muted/30 hover:border-border'
          )}
          onClick={() => {
            setSelectedTool(tool.name)
            setResult(null)
          }}
        >
          <p className="text-sm font-mono font-medium">{tool.name}</p>
          {tool.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
          )}

          {selectedTool === tool.name && (
            <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
              {tool.inputSchema && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Schema</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px]">
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                </details>
              )}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Arguments (JSON)</span>
                <textarea
                  value={argsJson}
                  onChange={(e) => setArgsJson(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </label>
              <button
                onClick={handleRun}
                disabled={running}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {running ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Play className="size-3" />
                )}
                Run
              </button>
              {result && (
                <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px] max-h-48 overflow-y-auto">
                  {result}
                </pre>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ResourcesList({
  resources,
  serverId
}: {
  resources: McpResource[]
  serverId: string
}) {
  const [selectedUri, setSelectedUri] = useState<string | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (resources.length === 0) {
    return <p className="text-xs text-muted-foreground">No resources available.</p>
  }

  const handleFetch = async (uri: string) => {
    setSelectedUri(uri)
    setLoading(true)
    setContent(null)
    try {
      const res = await window.api.mcpReadResource(serverId, uri)
      setContent(JSON.stringify(res, null, 2))
    } catch (err) {
      logUiError('McpExplorer.mcpReadResource', err, { serverId, uri })
      setContent(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      {resources.map((resource) => (
        <div key={resource.uri} className="rounded-md border border-border/50 bg-muted/30 px-3 py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-mono">{resource.name}</p>
              <p className="text-xs text-muted-foreground">{resource.uri}</p>
            </div>
            <button
              onClick={() => handleFetch(resource.uri)}
              disabled={loading && selectedUri === resource.uri}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
            >
              {loading && selectedUri === resource.uri ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                'Fetch'
              )}
            </button>
          </div>
          {selectedUri === resource.uri && content && (
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-[11px] max-h-48 overflow-y-auto">
              {content}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
