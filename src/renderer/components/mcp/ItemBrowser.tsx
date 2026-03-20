import { useState } from 'react'
import {
  Wrench,
  FileText,
  MessageSquare,
  Search
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore, type ExplorerTab } from '@/stores/mcpStore'

export function ItemBrowser() {
  const activeServerId = useMcpStore((s) => s.activeServerId)
  const servers = useMcpStore((s) => s.servers)
  const explorerTab = useMcpStore((s) => s.explorerTab)
  const setExplorerTab = useMcpStore((s) => s.setExplorerTab)
  const selection = useMcpStore((s) => s.selection)
  const setSelection = useMcpStore((s) => s.setSelection)
  const [search, setSearch] = useState('')

  const server = servers.find((s) => s.id === activeServerId)

  if (!server) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          Select a server from the left to browse its capabilities
        </p>
      </div>
    )
  }

  if (server.status !== 'connected') {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-muted-foreground text-center">
          Connect to <span className="font-medium text-foreground">{server.name}</span> to browse
        </p>
      </div>
    )
  }

  const lowerSearch = search.toLowerCase()
  const matchesSearch = (name: string, desc?: string) => {
    if (!search) return true
    return name.toLowerCase().includes(lowerSearch) || desc?.toLowerCase().includes(lowerSearch)
  }

  const tabs: { key: ExplorerTab; label: string; icon: typeof Wrench; count: number }[] = [
    { key: 'tools', label: 'Tools', icon: Wrench, count: server.tools.length },
    { key: 'resources', label: 'Resources', icon: FileText, count: server.resources.length + server.resourceTemplates.length },
    { key: 'prompts', label: 'Prompts', icon: MessageSquare, count: server.prompts.length }
  ]

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setExplorerTab(tab.key)
              setSearch('')
            }}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1 border-b-2 py-2 text-xs font-medium transition-colors',
              explorerTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="size-3" />
            {tab.count}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-7 pr-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {explorerTab === 'tools' && (
          <ToolList
            tools={server.tools.filter((t) => matchesSearch(t.name, t.description))}
            serverId={server.id}
            selection={selection}
            onSelect={setSelection}
          />
        )}
        {explorerTab === 'resources' && (
          <ResourceList
            resources={server.resources.filter((r) => matchesSearch(r.name, r.description))}
            templates={server.resourceTemplates.filter((r) => matchesSearch(r.name, r.description))}
            serverId={server.id}
            selection={selection}
            onSelect={setSelection}
          />
        )}
        {explorerTab === 'prompts' && (
          <PromptList
            prompts={server.prompts.filter((p) => matchesSearch(p.name, p.description))}
            serverId={server.id}
            selection={selection}
            onSelect={setSelection}
          />
        )}
      </div>
    </div>
  )
}

function ToolList({
  tools,
  serverId,
  selection,
  onSelect
}: {
  tools: { name: string; description?: string }[]
  serverId: string
  selection: ReturnType<typeof useMcpStore.getState>['selection']
  onSelect: (sel: ReturnType<typeof useMcpStore.getState>['selection']) => void
}) {
  if (tools.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground italic">No tools found</p>
  }
  return (
    <>
      {tools.map((tool) => {
        const isSelected =
          selection?.type === 'tool' &&
          selection.serverId === serverId &&
          selection.name === tool.name
        return (
          <button
            key={tool.name}
            onClick={() => onSelect({ type: 'tool', serverId, name: tool.name })}
            className={cn(
              'w-full text-left px-3 py-2 transition-colors',
              isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
          >
            <p className="text-xs font-mono font-medium truncate">{tool.name}</p>
            {tool.description && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {tool.description}
              </p>
            )}
          </button>
        )
      })}
    </>
  )
}

function ResourceList({
  resources,
  templates,
  serverId,
  selection,
  onSelect
}: {
  resources: { uri: string; name: string; description?: string; mimeType?: string }[]
  templates: { uriTemplate: string; name: string; description?: string }[]
  serverId: string
  selection: ReturnType<typeof useMcpStore.getState>['selection']
  onSelect: (sel: ReturnType<typeof useMcpStore.getState>['selection']) => void
}) {
  if (resources.length === 0 && templates.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground italic">No resources found</p>
  }
  return (
    <>
      {resources.map((resource) => {
        const isSelected =
          selection?.type === 'resource' &&
          selection.serverId === serverId &&
          selection.uri === resource.uri
        return (
          <button
            key={resource.uri}
            onClick={() => onSelect({ type: 'resource', serverId, uri: resource.uri })}
            className={cn(
              'w-full text-left px-3 py-2 transition-colors',
              isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
          >
            <p className="text-xs font-mono font-medium truncate">{resource.name}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
              {resource.uri}
            </p>
            {resource.mimeType && (
              <span className="inline-block mt-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {resource.mimeType}
              </span>
            )}
          </button>
        )
      })}
      {templates.length > 0 && (
        <>
          <div className="px-3 py-1.5 mt-1 border-t border-border">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Templates
            </span>
          </div>
          {templates.map((tmpl) => (
            <button
              key={tmpl.uriTemplate}
              onClick={() =>
                onSelect({ type: 'resource', serverId, uri: tmpl.uriTemplate })
              }
              className={cn(
                'w-full text-left px-3 py-2 transition-colors',
                selection?.type === 'resource' &&
                  selection.serverId === serverId &&
                  selection.uri === tmpl.uriTemplate
                  ? 'bg-accent text-accent-foreground'
                  : 'hover:bg-accent/50'
              )}
            >
              <p className="text-xs font-mono font-medium truncate">{tmpl.name}</p>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-mono">
                {tmpl.uriTemplate}
              </p>
            </button>
          ))}
        </>
      )}
    </>
  )
}

function PromptList({
  prompts,
  serverId,
  selection,
  onSelect
}: {
  prompts: { name: string; description?: string }[]
  serverId: string
  selection: ReturnType<typeof useMcpStore.getState>['selection']
  onSelect: (sel: ReturnType<typeof useMcpStore.getState>['selection']) => void
}) {
  if (prompts.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground italic">No prompts found</p>
  }
  return (
    <>
      {prompts.map((prompt) => {
        const isSelected =
          selection?.type === 'prompt' &&
          selection.serverId === serverId &&
          selection.name === prompt.name
        return (
          <button
            key={prompt.name}
            onClick={() => onSelect({ type: 'prompt', serverId, name: prompt.name })}
            className={cn(
              'w-full text-left px-3 py-2 transition-colors',
              isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
            )}
          >
            <p className="text-xs font-mono font-medium truncate">{prompt.name}</p>
            {prompt.description && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {prompt.description}
              </p>
            )}
          </button>
        )
      })}
    </>
  )
}
