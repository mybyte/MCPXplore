import { Sidebar } from './Sidebar'
import { useAppStore } from '@/stores/appStore'
import { ChatView } from '@/components/chat/ChatView'
import { McpExplorer } from '@/components/mcp/McpExplorer'
import { SettingsPanel } from '@/components/settings/SettingsPanel'

export function Layout() {
  const currentView = useAppStore((s) => s.currentView)
  const isMac = window.api.platform === 'darwin'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {isMac && (
        <div
          className="app-region-drag shrink-0 h-8 w-full"
          aria-hidden
        />
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          {currentView === 'chat' && <ChatView />}
          {currentView === 'mcp-explorer' && <McpExplorer />}
          {currentView === 'settings' && <SettingsPanel />}
        </main>
      </div>
    </div>
  )
}
