import { useState, useRef, useCallback } from 'react'
import { History, Blocks, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore } from '@/stores/mcpStore'
import { ServerRail } from './ServerRail'
import { ItemBrowser } from './ItemBrowser'
import { ToolDetail } from './ToolDetail'
import { ResourceDetail } from './ResourceDetail'
import { PromptDetail } from './PromptDetail'
import { CallHistory } from './CallHistory'

const MIN_RAIL_W = 140
const MAX_RAIL_W = 280
const DEFAULT_RAIL_W = 180
const MIN_BROWSER_W = 200
const MAX_BROWSER_W = 420
const DEFAULT_BROWSER_W = 260

export function ExplorerLayout() {
  const selection = useMcpStore((s) => s.selection)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_W)
  const [browserWidth, setBrowserWidth] = useState(DEFAULT_BROWSER_W)

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
          <h2 className="text-sm font-semibold">MCP Explorer</h2>
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
          <ServerRail />
        </div>

        {/* Resize handle: rail */}
        <div
          className="w-px shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
          onMouseDown={(e) => onMouseDown('rail', e)}
        />

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
