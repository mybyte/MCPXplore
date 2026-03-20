import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ModelPickerProps {
  models: string[]
  onChange: (models: string[]) => void
  providerConfig: { type: string; baseUrl: string; apiKey: string; apiVersion?: string }
  disabled?: boolean
}

export function ModelPicker({ models, onChange, providerConfig, disabled }: ModelPickerProps) {
  const [query, setQuery] = useState('')
  const [available, setAvailable] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const canFetch = !!providerConfig.apiKey && !!providerConfig.type

  const filtered = available.filter(
    (id) => !models.includes(id) && id.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setHighlightIdx(0)
  }, [query, filtered.length])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const doFetch = useCallback(async () => {
    if (!canFetch) return
    setFetching(true)
    setFetchError(null)
    try {
      const result = await window.api.fetchModels(providerConfig)
      setAvailable(result)
      setHasFetched(true)
      if (result.length > 0) setOpen(true)
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }, [providerConfig.type, providerConfig.baseUrl, providerConfig.apiKey, providerConfig.apiVersion, canFetch])

  const addModel = (id: string) => {
    const trimmed = id.trim()
    if (!trimmed || models.includes(trimmed)) return
    onChange([...models, trimmed])
    setQuery('')
    setOpen(false)
  }

  const removeModel = (id: string) => {
    onChange(models.filter((m) => m !== id))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && filtered[highlightIdx]) {
        addModel(filtered[highlightIdx])
      } else if (query.trim()) {
        addModel(query)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showDropdown = open && filtered.length > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Models</span>
        <button
          type="button"
          onClick={doFetch}
          disabled={disabled || fetching || !canFetch}
          title={canFetch ? 'Fetch available models from provider' : 'Enter an API key first'}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {fetching ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          {hasFetched ? 'Refresh' : 'Fetch models'}
        </button>
        {hasFetched && !fetchError && (
          <span className="text-xs text-muted-foreground">
            {available.length} available
          </span>
        )}
      </div>

      {fetchError && (
        <p className="text-xs rounded-md border border-destructive/30 bg-destructive/5 text-destructive px-2 py-1.5">
          {fetchError}
        </p>
      )}

      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            if (available.length > 0) setOpen(true)
          }}
          onFocus={() => {
            if (available.length > 0) setOpen(true)
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            hasFetched
              ? 'Search models or type a custom name…'
              : 'Type a model name or fetch available models…'
          }
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        {showDropdown && (
          <ul
            ref={listRef}
            className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-md"
          >
            {filtered.map((id, i) => (
              <li
                key={id}
                onMouseDown={(e) => {
                  e.preventDefault()
                  addModel(id)
                }}
                onMouseEnter={() => setHighlightIdx(i)}
                className={cn(
                  'cursor-pointer px-3 py-1.5 text-sm',
                  i === highlightIdx
                    ? 'bg-accent text-accent-foreground'
                    : 'text-popover-foreground hover:bg-accent/50'
                )}
              >
                {id}
              </li>
            ))}
          </ul>
        )}
      </div>

      {models.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {models.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs"
            >
              {id}
              <button
                type="button"
                onClick={() => removeModel(id)}
                disabled={disabled}
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
