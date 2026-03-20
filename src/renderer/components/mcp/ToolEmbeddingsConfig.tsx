import { useState, useEffect } from 'react'
import { Plus, Trash2, X, Check, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettingsStore, type ToolEmbeddingConfig } from '@/stores/settingsStore'

interface BackfillStatus {
  fieldName: string
  status: 'running' | 'completed' | 'error'
  processed: number
  error?: string
}

function toFieldName(model: string, dimensions: number): string {
  return `${model.replace(/[^a-zA-Z0-9]/g, '_')}_${dimensions}`
}

function useBackfillStatuses(): Map<string, BackfillStatus> {
  const [statuses, setStatuses] = useState<Map<string, BackfillStatus>>(new Map())

  useEffect(() => {
    window.api.getBackfillStatuses().then((raw) => {
      if (Array.isArray(raw)) {
        const map = new Map<string, BackfillStatus>()
        for (const s of raw as BackfillStatus[]) map.set(s.fieldName, s)
        setStatuses(map)
      }
    })

    const cleanup = window.api.onBackfillStatus((event) => {
      if (Array.isArray(event)) {
        const map = new Map<string, BackfillStatus>()
        for (const s of event as BackfillStatus[]) map.set(s.fieldName, s)
        setStatuses(map)
      }
    })

    return cleanup
  }, [])

  return statuses
}

function BackfillBadge({ status }: { status: BackfillStatus }) {
  switch (status.status) {
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">
          <Loader2 className="size-3 animate-spin" />
          Backfilling{status.processed > 0 ? ` (${status.processed})` : ''}
        </span>
      )
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-3" />
          Done ({status.processed})
        </span>
      )
    case 'error':
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive cursor-help"
          title={status.error}
        >
          <AlertCircle className="size-3" />
          Error
        </span>
      )
    default:
      return null
  }
}

function AddForm({
  onSave,
  onCancel,
  existingFieldNames
}: {
  onSave: (config: ToolEmbeddingConfig) => void
  onCancel: () => void
  existingFieldNames: Set<string>
}) {
  const providers = useSettingsStore((s) => s.embeddingsProviders)
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '')
  const [model, setModel] = useState('')
  const [dimensions, setDimensions] = useState<number | ''>('')

  const selectedProvider = providers.find((p) => p.id === providerId)
  const fieldName =
    model && typeof dimensions === 'number' && dimensions > 0
      ? toFieldName(model, dimensions)
      : ''
  const isDuplicate = fieldName ? existingFieldNames.has(fieldName) : false
  const canSave = !!providerId && !!model.trim() && typeof dimensions === 'number' && dimensions > 0 && !isDuplicate

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Provider</span>
          <select
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value)
              setModel('')
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {providers.length === 0 && <option value="">No providers configured</option>}
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Model</span>
          {selectedProvider && selectedProvider.models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select a model</option>
              {selectedProvider.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. text-embedding-3-small"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          )}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Dimensions</span>
          <input
            type="number"
            min={1}
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value ? Number(e.target.value) : '')}
            placeholder="e.g. 1024"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Field name</span>
          <p className="px-3 py-1.5 text-sm text-muted-foreground font-mono truncate">
            {fieldName || '—'}
          </p>
        </div>
      </div>

      {isDuplicate && (
        <p className="text-xs rounded-md border border-destructive/30 bg-destructive/5 text-destructive px-2 py-1.5">
          An embedding config with field name &quot;{fieldName}&quot; already exists.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="size-3.5" /> Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              id: `te-${Date.now()}`,
              providerId,
              model: model.trim(),
              dimensions: dimensions as number,
              fieldName
            })
          }
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Check className="size-3.5" /> Add
        </button>
      </div>
    </div>
  )
}

export function ToolEmbeddingsConfig({ onClose }: { onClose: () => void }) {
  const toolEmbeddings = useSettingsStore((s) => s.toolEmbeddings)
  const setToolEmbeddings = useSettingsStore((s) => s.setToolEmbeddings)
  const providers = useSettingsStore((s) => s.embeddingsProviders)
  const mongo = useSettingsStore((s) => s.mongo)
  const [showForm, setShowForm] = useState(false)
  const backfillStatuses = useBackfillStatuses()

  const mongoConfigured = !!(mongo.connectionUri && mongo.chatDatabase)
  const existingFieldNames = new Set(toolEmbeddings.map((c) => c.fieldName))

  const providerName = (providerId: string) =>
    providers.find((p) => p.id === providerId)?.name ?? providerId

  const handleAdd = (config: ToolEmbeddingConfig) => {
    const next = [...toolEmbeddings, config]
    setToolEmbeddings(next)
    void window.api.setToolEmbeddings(next)
    setShowForm(false)
  }

  const handleRemove = (id: string) => {
    const next = toolEmbeddings.filter((c) => c.id !== id)
    setToolEmbeddings(next)
    void window.api.setToolEmbeddings(next)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Tool Embeddings</h3>
          <p className="text-sm text-muted-foreground">
            Configure embedding models to generate vector embeddings for MCP tool descriptions.
            Each config produces a field on every tool document in MongoDB.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {!mongoConfigured && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Configure a MongoDB connection in Settings before adding tool embeddings.
        </div>
      )}

      {mongoConfigured && (
        <>
          {toolEmbeddings.length === 0 && !showForm && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No tool embedding configs yet.
            </div>
          )}

          {toolEmbeddings.length > 0 && (
            <div className="space-y-2">
              {toolEmbeddings.map((config) => {
                const bf = backfillStatuses.get(config.fieldName)
                return (
                  <div
                    key={config.id}
                    className="group rounded-lg border border-border p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{config.model}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground shrink-0">
                          {config.dimensions}d
                        </span>
                        {bf && <BackfillBadge status={bf} />}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(config.id)}
                        className={cn(
                          'rounded-md p-1.5 text-muted-foreground transition-colors shrink-0',
                          'opacity-0 group-hover:opacity-100',
                          'hover:bg-destructive/10 hover:text-destructive'
                        )}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {providerName(config.providerId)} &middot;{' '}
                      <span className="font-mono">embeddings.{config.fieldName}</span>
                    </p>
                    {bf?.status === 'error' && bf.error && (
                      <p className="text-xs rounded-md border border-destructive/30 bg-destructive/5 text-destructive px-2 py-1.5 whitespace-pre-wrap break-words">
                        {bf.error}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {showForm ? (
            <AddForm
              onSave={handleAdd}
              onCancel={() => setShowForm(false)}
              existingFieldNames={existingFieldNames}
            />
          ) : (
            providers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Plus className="size-3.5" /> Add Embedding
              </button>
            )
          )}

          {providers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add an embeddings provider in Settings &rarr; Embeddings first.
            </p>
          )}
        </>
      )}
    </div>
  )
}
