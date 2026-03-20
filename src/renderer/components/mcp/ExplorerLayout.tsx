import { useState, useRef, useCallback } from 'react'
import { History, Blocks, PanelRightClose, PanelRightOpen, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore } from '@/stores/mcpStore'
import { useSettingsStore, type McpServerConfig as McpServerConfigType } from '@/stores/settingsStore'
import { ServerRail } from './ServerRail'
import { ItemBrowser } from './ItemBrowser'
import { ToolDetail } from './ToolDetail'
import { ResourceDetail } from './ResourceDetail'
import { PromptDetail } from './PromptDetail'
import { CallHistory } from './CallHistory'
import { ServerForm } from '@/components/settings/McpServerConfig'

const MIN_RAIL_W = 140
const MAX_RAIL_W = 280
const DEFAULT_RAIL_W = 180
const MIN_BROWSER_W = 200
const MAX_BROWSER_W = 420
const DEFAULT_BROWSER_W = 260

type ConfigMode = null | { type: 'add' } | { type: 'edit'; serverId: string }

export function ExplorerLayout() {
  const selection = useMcpStore((s) => s.selection)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [configMode, setConfigMode] = useState<ConfigMode>(null)
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_W)
  const [browserWidth, setBrowserWidth] = useState(DEFAULT_BROWSER_W)

  const mcpServers = useSettingsStore((s) => s.mcpServers)
  const addServer = useSettingsStore((s) => s.addMcpServer)
  const updateServer = useSettingsStore((s) => s.updateMcpServer)
  const removeServer = useSettingsStore((s) => s.removeMcpServer)

  const handleSaveServer = (server: McpServerConfigType) => {
    const current = useSettingsStore.getState().mcpServers
    if (configMode?.type === 'edit') {
      updateServer(configMode.serverId, server)
      void window.api.setMcpServers(current.map((s) => (s.id === configMode.serverId ? server : s)))
    } else {
      addServer(server)
      void window.api.setMcpServers([...current, server])
    }
    setConfigMode(null)
  }

  const handleDeleteServer = (id: string) => {
    const current = useSettingsStore.getState().mcpServers
    removeServer(id)
    void window.api.setMcpServers(current.filter((s) => s.id !== id))
    setConfigMode(null)
  }

  const resizingRef = useRef<'rail' | 'browser' | null>(null)
  const startXRef = useRef(0)
  const startWRef = useRef(0)

  const onMouseDown = useCallback(
    (panel: 'rail' | 'browser', e: React.MouseEvent) => {
      e.preventDefault()
      resizingRef.current = panel
      startXRef.current = e.clientX
      startWRef.current = panel === 'rail' ? railWidth : browserWidth

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startXRef.current
        if (resizingRef.current === 'rail') {
          setRailWidth(Math.max(MIN_RAIL_W, Math.min(MAX_RAIL_W, startWRef.current + dx)))
        } else {
          setBrowserWidth(Math.max(MIN_BROWSER_W, Math.min(MAX_BROWSER_W, startWRef.current + dx)))
        }
      }

      const onMouseUp = () => {
        resizingRef.current = null
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    },
    [railWidth, browserWidth]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Blocks className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">MCP</h2>
        </div>
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
            historyOpen
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          )}
        >
          <History className="size-3.5" />
          History
          {historyOpen ? (
            <PanelRightClose className="size-3" />
          ) : (
            <PanelRightOpen className="size-3" />
          )}
        </button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Panel 1: Server Rail */}
        <div
          className="shrink-0 border-r border-border overflow-hidden"
          style={{ width: railWidth }}
        >
          <ServerRail
            onAddServer={() => setConfigMode({ type: 'add' })}
            onEditServer={(id) => setConfigMode({ type: 'edit', serverId: id })}
          />
        </div>

        {/* Resize handle: rail */}
        <div
          className="w-px shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
          onMouseDown={(e) => onMouseDown('rail', e)}
        />

        {configMode ? (
          <div className="flex-1 min-w-0 overflow-y-auto p-6">
            <div className="mx-auto max-w-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  {configMode.type === 'add' ? 'Add Server' : 'Edit Server'}
                </h3>
                {configMode.type === 'edit' && (
                  <button
                    onClick={() => handleDeleteServer(configMode.serverId)}
                    className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="size-3.5" /> Delete
                  </button>
                )}
              </div>
              <ServerForm
                initial={
                  configMode.type === 'edit'
                    ? mcpServers.find((s) => s.id === configMode.serverId)
                    : undefined
                }
                onSave={handleSaveServer}
                onCancel={() => setConfigMode(null)}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Panel 2: Item Browser */}
            <div
              className="shrink-0 border-r border-border overflow-hidden"
              style={{ width: browserWidth }}
            >
              <ItemBrowser />
            </div>

            {/* Resize handle: browser */}
            <div
              className="w-px shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
              onMouseDown={(e) => onMouseDown('browser', e)}
            />

            {/* Panel 3: Detail */}
            <div className="flex-1 min-w-0 overflow-hidden">
              <DetailPanel selection={selection} />
            </div>
          </>
        )}

        {/* History sidebar */}
        {historyOpen && (
          <>
            <div className="w-px shrink-0 bg-border" />
            <div className="w-64 shrink-0 overflow-hidden">
              <CallHistory />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function DetailPanel({
  selection
}: {
  selection: ReturnType<typeof useMcpStore.getState>['selection']
}) {
  if (!selection) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Blocks className="size-10 opacity-20" />
        <p className="text-sm">Select a tool, resource, or prompt to inspect</p>
      </div>
    )
  }

  switch (selection.type) {
    case 'tool':
      return <ToolDetail />
    case 'resource':
      return <ResourceDetail />
    case 'prompt':
      return <PromptDetail />
    default:
      return null
  }
}
