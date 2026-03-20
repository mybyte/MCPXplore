import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LlmProviderConfig } from './LlmProviderConfig'
import { EmbeddingsProviderConfig } from './EmbeddingsProviderConfig'
import { McpServerConfig } from './McpServerConfig'
import { MongoConfig } from './MongoConfig'

type SettingsTab = 'llm' | 'embeddings' | 'mcp' | 'mongodb'

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'llm', label: 'LLM Providers' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'mcp', label: 'MCP Servers' },
  { id: 'mongodb', label: 'MongoDB' }
]

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm')

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">Settings</h2>
      </div>

      <div className="border-b border-border px-6">
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'border-b-2 px-1 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'llm' && <LlmProviderConfig />}
        {activeTab === 'embeddings' && <EmbeddingsProviderConfig />}
        {activeTab === 'mcp' && <McpServerConfig />}
        {activeTab === 'mongodb' && <MongoConfig />}
      </div>
    </div>
  )
}
