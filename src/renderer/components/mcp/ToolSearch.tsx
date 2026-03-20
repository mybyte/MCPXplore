import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Search,
  X,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  Server,
  Wrench,
  Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMcpStore } from '@/stores/mcpStore'
import { useSettingsStore } from '@/stores/settingsStore'

type SearchMode = 'keyword' | 'vector' | 'hybrid'
type FusionType = 'rank' | 'score'
type Normalization = 'none' | 'sigmoid' | 'minMaxScaler'

interface SearchResult {
  _id: string
  serverId: string
  serverName: string
  name: string
  description?: string
  score: number
  scoreDetails?: Record<string, unknown>
}

interface FacetBucket {
  _id: string
  count: number
}

const MODE_LABELS: Record<SearchMode, string> = {
  keyword: 'Keyword',
  vector: 'Semantic',
  hybrid: 'Hybrid'
}

const NORMALIZATION_OPTIONS: { value: Normalization; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sigmoid', label: 'Sigmoid' },
  { value: 'minMaxScaler', label: 'Min-Max' }
]

// ── Typeahead multi-select ─────────────────────────────────────────────

function FacetPicker({
  label,
  icon: Icon,
  buckets,
  selected,
  onToggle,
  placeholder
}: {
  label: string
  icon: typeof Server
  buckets: FacetBucket[]
  selected: Set<string>
  onToggle: (value: string) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    if (!filter) return buckets
    const lower = filter.toLowerCase()
    return buckets.filter((b) => b._id.toLowerCase().includes(lower))
  }, [buckets, filter])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFilter('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Icon className="size-3" /> {label}
      </label>
      <div ref={containerRef} className="relative">
        <div
          onClick={() => {
            setOpen(!open)
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className={cn(
            'flex flex-wrap items-center gap-1 min-h-[30px] rounded-md border bg-background px-2 py-1 cursor-pointer',
            open ? 'border-ring ring-1 ring-ring' : 'border-input'
          )}
        >
          {selected.size === 0 && !open && (
            <span className="text-xs text-muted-foreground">{placeholder}</span>
          )}
          {[...selected].map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 border border-primary/20 px-2 py-0 text-xs font-medium text-primary"
            >
              {val}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(val)
                }}
                className="hover:text-destructive"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          {open && (
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !filter && selected.size > 0) {
                  const last = [...selected].pop()!
                  onToggle(last)
                }
              }}
              className="flex-1 min-w-[80px] bg-transparent text-xs outline-none"
              placeholder="Type to filter..."
            />
          )}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground italic">No matches</p>
            )}
            {filtered.map((bucket) => {
              const isSelected = selected.has(bucket._id)
              return (
                <button
                  key={bucket._id}
                  onClick={() => {
                    onToggle(bucket._id)
                    setFilter('')
                    inputRef.current?.focus()
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors',
                    isSelected && 'bg-accent/30'
                  )}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {isSelected && <Check className="size-3 text-primary shrink-0" />}
                    <span className={cn('truncate font-mono', isSelected && 'font-medium')}>{bucket._id}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {bucket.count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export function ToolSearch({ onClose }: { onClose: () => void }) {
  const setSelection = useMcpStore((s) => s.setSelection)
  const setExplorerTab = useMcpStore((s) => s.setExplorerTab)
  const setActiveServer = useMcpStore((s) => s.setActiveServer)
  const toolEmbeddings = useSettingsStore((s) => s.toolEmbeddings)
  const mongo = useSettingsStore((s) => s.mongo)

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('keyword')
  const [limit, setLimit] = useState(20)
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set())
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set())
  const [embeddingField, setEmbeddingField] = useState(toolEmbeddings[0]?.fieldName ?? '')
  const [fusionType, setFusionType] = useState<FusionType>('rank')
  const [normalization, setNormalization] = useState<Normalization>('sigmoid')
  const [keywordWeight, setKeywordWeight] = useState(1)
  const [vectorWeight, setVectorWeight] = useState(1)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  const [serverBuckets, setServerBuckets] = useState<FacetBucket[]>([])
  const [toolBuckets, setToolBuckets] = useState<FacetBucket[]>([])
  const [facetsLoading, setFacetsLoading] = useState(false)

  const mongoConfigured = !!(mongo.connectionUri && mongo.chatDatabase)
  const needsEmbedding = mode === 'vector' || mode === 'hybrid'
  const canSearch = query.trim().length > 0 && (!needsEmbedding || embeddingField)

  useEffect(() => {
    if (!mongoConfigured) return
    setFacetsLoading(true)
    window.api.searchToolsFacets()
      .then((facets) => {
        setServerBuckets(facets.servers)
        setToolBuckets(facets.toolNames)
      })
      .catch(() => {})
      .finally(() => setFacetsLoading(false))
  }, [mongoConfigured])

  const toggleServer = useCallback((name: string) => {
    setSelectedServers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const toggleTool = useCallback((name: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const handleSearch = useCallback(async () => {
    if (!canSearch || searching) return
    setSearching(true)
    setError(null)
    setResults(null)
    setElapsed(null)

    const start = Date.now()
    try {
      const params: Record<string, unknown> = {
        query: query.trim(),
        mode,
        limit,
        serverNames: selectedServers.size > 0 ? [...selectedServers] : undefined,
        toolNames: selectedTools.size > 0 ? [...selectedTools] : undefined
      }
      if (needsEmbedding) {
        params.embeddingFieldName = embeddingField
      }
      if (mode === 'hybrid') {
        params.hybrid = {
          fusionType,
          weights: { keyword: keywordWeight, vector: vectorWeight },
          ...(fusionType === 'score' ? { normalization } : {})
        }
      }

      const raw = await window.api.searchTools(params)
      setResults(raw as SearchResult[])
      setElapsed(Date.now() - start)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setElapsed(Date.now() - start)
    } finally {
      setSearching(false)
    }
  }, [
    canSearch, searching, query, mode, limit, selectedServers,
    selectedTools, needsEmbedding, embeddingField, fusionType,
    keywordWeight, vectorWeight, normalization
  ])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSearch()
    }
  }

  const navigateToTool = (result: SearchResult) => {
    setActiveServer(result.serverId)
    setExplorerTab('tools')
    setSelection({ type: 'tool', serverId: result.serverId, name: result.name })
    onClose()
  }

  const activeFilterCount = selectedServers.size + selectedTools.size

  if (!mongoConfigured) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Tool Search</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors">
            <X className="size-4" />
          </button>
        </div>
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Configure a MongoDB connection in Settings to use tool search.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 border-b border-border p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Tool Search</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors">
            <X className="size-4" />
          </button>
        </div>

        {/* Search bar + mode + run */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search tools..."
              autoFocus
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex rounded-md border border-input">
            {(['keyword', 'vector', 'hybrid'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md',
                  mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent/50'
                )}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>

          <button
            onClick={() => void handleSearch()}
            disabled={!canSearch || searching}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Search
          </button>
        </div>

        {/* Expandable filters */}
        <button
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {filtersExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          Filters &amp; Options
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
              {activeFilterCount}
            </span>
          )}
        </button>

        {filtersExpanded && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            {facetsLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Loading facets...
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FacetPicker
                  label="Servers"
                  icon={Server}
                  buckets={serverBuckets}
                  selected={selectedServers}
                  onToggle={toggleServer}
                  placeholder="All servers"
                />
                <FacetPicker
                  label="Tools"
                  icon={Wrench}
                  buckets={toolBuckets}
                  selected={selectedTools}
                  onToggle={toggleTool}
                  placeholder="All tools"
                />
              </div>
            )}

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Limit</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
                  className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
              </label>

              {needsEmbedding && (
                <label className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Embedding</span>
                  {toolEmbeddings.length === 0 ? (
                    <span className="text-xs text-destructive">No embeddings configured</span>
                  ) : (
                    <select
                      value={embeddingField}
                      onChange={(e) => setEmbeddingField(e.target.value)}
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    >
                      {toolEmbeddings.map((cfg) => (
                        <option key={cfg.fieldName} value={cfg.fieldName}>
                          {cfg.model} ({cfg.dimensions}d)
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              )}
            </div>

            {/* Hybrid options */}
            {mode === 'hybrid' && (
              <div className="space-y-2 border-t border-border pt-2">
                <p className="text-xs font-medium text-muted-foreground">Hybrid fusion</p>
                <div className="flex items-center gap-3">
                  <div className="flex rounded-md border border-input">
                    {(['rank', 'score'] as const).map((ft) => (
                      <button
                        key={ft}
                        onClick={() => setFusionType(ft)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium transition-colors first:rounded-l-md last:rounded-r-md',
                          fusionType === ft
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-accent/50'
                        )}
                      >
                        {ft === 'rank' ? 'Rank Fusion' : 'Score Fusion'}
                      </button>
                    ))}
                  </div>

                  {fusionType === 'score' && (
                    <label className="flex items-center gap-1.5 text-xs">
                      <span className="text-muted-foreground">Normalization</span>
                      <select
                        value={normalization}
                        onChange={(e) => setNormalization(e.target.value as Normalization)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      >
                        {NORMALIZATION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Keyword weight</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={keywordWeight}
                      onChange={(e) => setKeywordWeight(Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Vector weight</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={vectorWeight}
                      onChange={(e) => setVectorWeight(Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive whitespace-pre-wrap break-words">
            {error}
          </div>
        )}

        {results !== null && !error && (
          <div className="p-4 space-y-1">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs text-muted-foreground">
                {results.length} result{results.length !== 1 ? 's' : ''}
                {elapsed != null && <span> in {elapsed}ms</span>}
              </p>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                mode === 'keyword' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                mode === 'vector' && 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
                mode === 'hybrid' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              )}>
                {MODE_LABELS[mode]}
                {mode === 'hybrid' && ` (${fusionType})`}
              </span>
            </div>

            {results.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No matching tools found.
              </div>
            )}

            {results.map((r, i) => (
              <button
                key={r._id}
                onClick={() => navigateToTool(r)}
                className="w-full text-left rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {i + 1}.
                      </span>
                      <p className="text-sm font-mono font-medium truncate">{r.name}</p>
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 pl-5">
                        {r.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                      {r.score.toFixed(4)}
                    </span>
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {r.serverName}
                    </span>
                  </div>
                </div>
                {r.scoreDetails && Object.keys(r.scoreDetails).length > 0 && (
                  <div className="mt-1.5 pl-5 flex gap-2">
                    {Object.entries(r.scoreDetails).map(([key, val]) => (
                      <span
                        key={key}
                        className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                      >
                        {key}: {typeof val === 'number' ? val.toFixed(4) : JSON.stringify(val)}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {results === null && !error && !searching && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Search className="size-8 opacity-20" />
            <p className="text-sm">Enter a query and press Search</p>
            {needsEmbedding && toolEmbeddings.length === 0 && (
              <p className="text-xs text-destructive">
                No embedding configs found. Add one in the Embeddings panel first.
              </p>
            )}
          </div>
        )}

        {searching && (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-sm">Searching...</p>
          </div>
        )}
      </div>
    </div>
  )
}
