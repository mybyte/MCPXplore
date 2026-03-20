import {
  MessageSquare,
  Blocks,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Trash2,
  Circle,
  Sun,
  Moon,
  Monitor
} from 'lucide-react'
import { useAppStore, type View } from '@/stores/appStore'
import { useChatStore } from '@/stores/chatStore'
import { useMcpStore } from '@/stores/mcpStore'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

const navItems: { view: View; icon: typeof MessageSquare; label: string }[] = [
  { view: 'chat', icon: MessageSquare, label: 'Chat' },
  { view: 'mcp-explorer', icon: Blocks, label: 'MCP Explorer' },
  { view: 'settings', icon: Settings, label: 'Settings' }
]

function ChatList() {
  const chats = useChatStore((s) => s.chats)
  const activeChatId = useChatStore((s) => s.activeChatId)
  const setActiveChat = useChatStore((s) => s.setActiveChat)
  const createChat = useChatStore((s) => s.createChat)
  const deleteChat = useChatStore((s) => s.deleteChat)

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => createChat()}
        className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Plus className="size-4" />
        New Chat
      </button>
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={cn(
            'group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm cursor-pointer transition-colors',
            activeChatId === chat.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          )}
          onClick={() => setActiveChat(chat.id)}
        >
          <span className="truncate flex-1">{chat.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteChat(chat.id)
            }}
            className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ServerList() {
  const servers = useMcpStore((s) => s.servers)

  if (servers.length === 0) {
    return (
      <p className="px-3 text-xs text-muted-foreground">
        No MCP servers configured. Add one in Settings.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {servers.map((server) => (
        <div
          key={server.id}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground"
        >
          <Circle
            className={cn(
              'size-2 fill-current',
              server.status === 'connected' && 'text-green-500',
              server.status === 'connecting' && 'text-yellow-500',
              server.status === 'error' && 'text-red-500',
              server.status === 'disconnected' && 'text-muted-foreground/40'
            )}
          />
          <span className="truncate">{server.name}</span>
        </div>
      ))}
    </div>
  )
}

export function Sidebar() {
  const currentView = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setView)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const { theme, toggleTheme } = useTheme()

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <aside
      className={cn(
        'flex flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-200',
        collapsed ? 'w-12' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        {!collapsed && <h1 className="text-sm font-semibold tracking-tight">MCPXplore</h1>}
        <button
          onClick={toggleSidebar}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {navItems.map(({ view, icon: Icon, label }) => (
          <button
            key={view}
            onClick={() => setView(view)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
              currentView === view
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
            )}
            title={collapsed ? label : undefined}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && label}
          </button>
        ))}
      </nav>

      {/* Contextual content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {currentView === 'chat' && (
            <>
              <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Chats
              </h2>
              <ChatList />
            </>
          )}
          {(currentView === 'mcp-explorer' || currentView === 'chat') && (
            <>
              <h2 className="mt-4 px-3 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                MCP Servers
              </h2>
              <ServerList />
            </>
          )}
        </div>
      )}

      {/* Bottom controls */}
      <div className="border-t border-sidebar-border px-2 py-2">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors"
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="size-4 shrink-0" />
          {!collapsed && <span className="text-xs capitalize">{theme}</span>}
        </button>
      </div>
    </aside>
  )
}
