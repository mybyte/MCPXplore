import { Sidebar } from './Sidebar'
import { useAppStore } from '@/stores/appStore'
import { ChatView } from '@/components/chat/ChatView'
import { McpExplorer } from '@/components/mcp/McpExplorer'
import { SettingsPanel } from '@/components/settings/SettingsPanel'

export function Layout() {
  const currentView = useAppStore((s) => s.currentView)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {currentView === 'chat' && <ChatView />}
        {currentView === 'mcp-explorer' && <McpExplorer />}
        {currentView === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}
