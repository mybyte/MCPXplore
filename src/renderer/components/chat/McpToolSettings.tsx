import { useEffect, useMemo, useState } from 'react'
import { useMcpStore } from '@/stores/mcpStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { McpToolsMode, ToolSelectionConfig } from '@/stores/chatStore'
import { DEFAULT_TOOL_SELECTION_CONFIG } from '@/stores/chatStore'
import { Check, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface McpToolSettingsProps {
  mcpToolsMode: McpToolsMode
  enabledTools: string[]
  systemPrompt: string
  agenticSystemPrompt: string
  toolSelectionConfig: ToolSelectionConfig
  onModeChange: (mode: McpToolsMode) => void
  onToolsChange: (tools: string[]) => void
  onSystemPromptChange: (value: string) => void
  onAgenticSystemPromptChange: (value: string) => void
  onToolSelectionConfigChange: (patch: Partial<ToolSelectionConfig>) => void
  className?: string
}

type TopMode = 'always' | 'semantic' | 'agentic'

function topModeFromToolsMode(m: McpToolsMode): TopMode {
  if (m === 'semantic') return 'semantic'
  if (m === 'agentic') return 'agentic'
  return 'always'
}

export function McpToolSettings({
  mcpToolsMode,
  enabledTools,
  systemPrompt,
  agenticSystemPrompt,
  toolSelectionConfig,
  onModeChange,
  onToolsChange,
  onSystemPromptChange,
  onAgenticSystemPromptChange,
  onToolSelectionConfigChange,
  className
}: McpToolSettingsProps) {
  const servers = useMcpStore((s) => s.servers)
  const connectedServers = servers.filter((s) => s.status === 'connected')
  const [query, setQuery] = useState('')
  const [promptsOpen, setPromptsOpen] = useState(false)
  const [defaultAgenticPrompt, setDefaultAgenticPrompt] = useState('')

  const topMode = topModeFromToolsMode(mcpToolsMode)
  const isAlwaysSubPick = mcpToolsMode === 'pick'

  useEffect(() => {
    window.api.getDefaultAgenticSystemPrompt().then(setDefaultAgenticPrompt).catch(() => {})
  }, [])

  const allToolKeys = useMemo(
    () => connectedServers.flatMap((s) => s.tools.map((t) => `${s.id}:${t.name}`)),
    [connectedServers]
  )

  const q = query.trim().toLowerCase()

  const handleTopModeChange = (m: TopMode) => {
    if (m === 'always') onModeChange('all')
    else if (m === 'semantic') onModeChange('semantic')
    else onModeChange('agentic')
  }

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

  const toolMatches = (_serverId: string, toolName: string, description?: string) => {
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
      {/* System prompts collapsible */}
      <div className="shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => setPromptsOpen(!promptsOpen)}
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
        >
          {promptsOpen ? (
            <ChevronDown className="size-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">System prompts</span>
          {(systemPrompt.trim() || agenticSystemPrompt.trim()) && (
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          )}
        </button>
        {promptsOpen && (
          <div className="space-y-3 px-3 pb-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                Conversation system prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => onSystemPromptChange(e.target.value)}
                placeholder="Optional — prepended as system message to every LLM request"
                rows={3}
                className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                Agentic sub-agent system prompt
              </label>
              <textarea
                value={agenticSystemPrompt}
                onChange={(e) => onAgenticSystemPromptChange(e.target.value)}
                placeholder={defaultAgenticPrompt || 'Default: instructs the model to compose a tool search query'}
                rows={3}
                className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        )}
      </div>

      {/* Mode selector */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="mb-2 text-xs font-medium">MCP tool selection (this chat)</p>
        <div
          className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
          role="tablist"
          aria-label="Tool selection mode"
        >
          {(['always', 'semantic', 'agentic'] as TopMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={topMode === m}
              className={cn(
                'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                topMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              )}
              onClick={() => handleTopModeChange(m)}
            >
              {m === 'always' ? 'Always' : m === 'semantic' ? 'Semantic' : 'Agentic'}
            </button>
          ))}
        </div>
      </div>

      {/* Mode-specific config */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {topMode === 'always' && (
          <AlwaysModePanel
            isPickMode={isAlwaysSubPick}
            onSwitchToPick={startCustomize}
            onModeChange={onModeChange}
            enabledTools={enabledTools}
            allToolKeys={allToolKeys}
            connectedServers={connectedServers}
            query={query}
            setQuery={setQuery}
            q={q}
            toggleTool={toggleTool}
            toggleServer={toggleServer}
            pickSelectAll={pickSelectAll}
            pickSelectNone={pickSelectNone}
            serverCheckboxState={serverCheckboxState}
            toolMatches={toolMatches}
            serverVisible={serverVisible}
          />
        )}
        {topMode === 'semantic' && (
          <SemanticModePanel
            config={toolSelectionConfig}
            onChange={onToolSelectionConfigChange}
          />
        )}
        {topMode === 'agentic' && (
          <AgenticModePanel
            config={toolSelectionConfig}
            onChange={onToolSelectionConfigChange}
          />
        )}
      </div>
    </div>
  )
}

// ── Always mode (all / pick) ──────────────────────────────────────────

interface AlwaysPanelProps {
  isPickMode: boolean
  onSwitchToPick: () => void
  onModeChange: (mode: McpToolsMode) => void
  enabledTools: string[]
  allToolKeys: string[]
  connectedServers: Array<{
    id: string
    name: string
    tools: Array<{ name: string; description?: string }>
  }>
  query: string
  setQuery: (v: string) => void
  q: string
  toggleTool: (key: string) => void
  toggleServer: (serverId: string) => void
  pickSelectAll: () => void
  pickSelectNone: () => void
  serverCheckboxState: (serverId: string) => { checked: boolean; indeterminate: boolean }
  toolMatches: (serverId: string, name: string, desc?: string) => boolean
  serverVisible: (serverId: string, name: string, tools: Array<{ name: string; description?: string }>) => boolean
}

function AlwaysModePanel({
  isPickMode,
  onSwitchToPick,
  onModeChange,
  enabledTools,
  allToolKeys,
  connectedServers,
  query,
  setQuery,
  q,
  toggleTool,
  toggleServer,
  pickSelectAll,
  pickSelectNone,
  serverCheckboxState,
  toolMatches,
  serverVisible
}: AlwaysPanelProps) {
  if (!isPickMode) {
    return (
      <div className="space-y-3 px-3 py-3">
        <div className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
          <button
            type="button"
            className="flex-1 rounded bg-background px-2 py-1.5 text-xs font-medium text-foreground shadow-sm"
            onClick={() => onModeChange('all')}
          >
            All connected
          </button>
          <button
            type="button"
            className="flex-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground"
            onClick={onSwitchToPick}
          >
            Choose…
          </button>
        </div>
        {connectedServers.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">No MCP servers connected.</p>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            The model can use every tool from connected servers ({allToolKeys.length} total).
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="shrink-0 px-3 pt-3 pb-1">
        <div className="flex gap-0.5 rounded-md border border-border bg-muted/40 p-0.5 mb-2">
          <button
            type="button"
            className="flex-1 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground"
            onClick={() => onModeChange('all')}
          >
            All connected
          </button>
          <button
            type="button"
            className="flex-1 rounded bg-background px-2 py-1.5 text-xs font-medium text-foreground shadow-sm"
          >
            Choose…
          </button>
        </div>
      </div>

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
          <button type="button" onClick={pickSelectAll} className="text-xs text-primary hover:underline">All</button>
          <button type="button" onClick={pickSelectNone} className="text-xs text-muted-foreground hover:underline">None</button>
        </div>
      </div>

      <p className="shrink-0 px-3 pt-2 text-[10px] text-muted-foreground">
        Only checked tools are sent to the model ({enabledTools.length}/{allToolKeys.length}).
        {enabledTools.length === 0 && allToolKeys.length > 0 && (
          <span className="mt-1 block">None selected — use All or enable servers/tools below.</span>
        )}
      </p>

      <div className="p-1">
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
                    ref={(el) => { if (el) el.indeterminate = indeterminate }}
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
                          enabled ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
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
  )
}

// ── Semantic mode panel ───────────────────────────────────────────────

function SemanticModePanel({
  config,
  onChange
}: {
  config: ToolSelectionConfig
  onChange: (patch: Partial<ToolSelectionConfig>) => void
}) {
  const toolEmbeddings = useSettingsStore((s) => s.toolEmbeddings)

  return (
    <div className="space-y-4 px-3 py-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Embeds the conversation tail and uses vector search to find the most relevant tools automatically.
      </p>

      <FieldGroup label="Context window (tokens)">
        <input
          type="number"
          min={50}
          max={50000}
          step={50}
          value={config.semanticContextTokens}
          onChange={(e) => onChange({ semanticContextTokens: Number(e.target.value) || DEFAULT_TOOL_SELECTION_CONFIG.semanticContextTokens })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        />
      </FieldGroup>

      <FieldGroup label="Tool limit">
        <input
          type="number"
          min={1}
          max={100}
          value={config.semanticToolLimit}
          onChange={(e) => onChange({ semanticToolLimit: Number(e.target.value) || DEFAULT_TOOL_SELECTION_CONFIG.semanticToolLimit })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        />
      </FieldGroup>

      <FieldGroup label="Score cutoff">
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={config.semanticScoreCutoff}
          onChange={(e) => onChange({ semanticScoreCutoff: Number(e.target.value) || 0 })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        />
      </FieldGroup>

      <FieldGroup label="Embedding config">
        {toolEmbeddings.length === 0 ? (
          <p className="text-[10px] text-destructive">
            No tool embedding configs found. Configure one in Settings &gt; Embeddings.
          </p>
        ) : (
          <select
            value={config.semanticEmbeddingFieldName}
            onChange={(e) => onChange({ semanticEmbeddingFieldName: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
          >
            <option value="">Select…</option>
            {toolEmbeddings.map((te) => (
              <option key={te.fieldName} value={te.fieldName}>
                {te.model} ({te.dimensions}d)
              </option>
            ))}
          </select>
        )}
      </FieldGroup>
    </div>
  )
}

// ── Agentic mode panel ────────────────────────────────────────────────

function AgenticModePanel({
  config,
  onChange
}: {
  config: ToolSelectionConfig
  onChange: (patch: Partial<ToolSelectionConfig>) => void
}) {
  const llmProviders = useSettingsStore((s) => s.llmProviders)
  const toolEmbeddings = useSettingsStore((s) => s.toolEmbeddings)
  const currentProvider = llmProviders.find((p) => p.id === config.agenticProviderId)
  const needsEmbedding = config.agenticSearchMode === 'vector' || config.agenticSearchMode === 'hybrid'

  return (
    <div className="space-y-4 px-3 py-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        A sub-agent LLM analyzes the conversation and composes a search query to find relevant tools.
      </p>

      <FieldGroup label="Sub-agent provider">
        <select
          value={config.agenticProviderId}
          onChange={(e) => {
            const pid = e.target.value
            onChange({ agenticProviderId: pid })
            const prov = llmProviders.find((p) => p.id === pid)
            if (prov?.models.length) onChange({ agenticModelId: prov.models[0] })
          }}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        >
          <option value="">Select…</option>
          {llmProviders.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </FieldGroup>

      {currentProvider && currentProvider.models.length > 0 && (
        <FieldGroup label="Sub-agent model">
          <select
            value={config.agenticModelId}
            onChange={(e) => onChange({ agenticModelId: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
          >
            {currentProvider.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldGroup>
      )}

      <FieldGroup label="Context window (tokens)">
        <input
          type="number"
          min={50}
          max={50000}
          step={100}
          value={config.agenticContextTokens}
          onChange={(e) => onChange({ agenticContextTokens: Number(e.target.value) || DEFAULT_TOOL_SELECTION_CONFIG.agenticContextTokens })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        />
      </FieldGroup>

      <FieldGroup label="Search mode">
        <select
          value={config.agenticSearchMode}
          onChange={(e) => onChange({ agenticSearchMode: e.target.value as 'keyword' | 'vector' | 'hybrid' })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        >
          <option value="keyword">Keyword</option>
          <option value="vector">Vector</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </FieldGroup>

      {config.agenticSearchMode === 'hybrid' && (
        <div className="grid grid-cols-2 gap-2">
          <FieldGroup label="Keyword weight">
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={config.agenticHybridWeights.keyword}
              onChange={(e) => onChange({ agenticHybridWeights: { ...config.agenticHybridWeights, keyword: Number(e.target.value) || 1 } })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
            />
          </FieldGroup>
          <FieldGroup label="Vector weight">
            <input
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={config.agenticHybridWeights.vector}
              onChange={(e) => onChange({ agenticHybridWeights: { ...config.agenticHybridWeights, vector: Number(e.target.value) || 1 } })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
            />
          </FieldGroup>
        </div>
      )}

      {needsEmbedding && (
        <FieldGroup label="Embedding config">
          {toolEmbeddings.length === 0 ? (
            <p className="text-[10px] text-destructive">
              No tool embedding configs found. Configure one in Settings &gt; Embeddings.
            </p>
          ) : (
            <select
              value={config.agenticEmbeddingFieldName}
              onChange={(e) => onChange({ agenticEmbeddingFieldName: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
            >
              <option value="">Select…</option>
              {toolEmbeddings.map((te) => (
                <option key={te.fieldName} value={te.fieldName}>
                  {te.model} ({te.dimensions}d)
                </option>
              ))}
            </select>
          )}
        </FieldGroup>
      )}

      <FieldGroup label="Tool limit">
        <input
          type="number"
          min={1}
          max={100}
          value={config.agenticToolLimit}
          onChange={(e) => onChange({ agenticToolLimit: Number(e.target.value) || DEFAULT_TOOL_SELECTION_CONFIG.agenticToolLimit })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        />
      </FieldGroup>

      <FieldGroup label="Score cutoff">
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={config.agenticScoreCutoff}
          onChange={(e) => onChange({ agenticScoreCutoff: Number(e.target.value) || 0 })}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
        />
      </FieldGroup>
    </div>
  )
}

// ── Shared ────────────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
