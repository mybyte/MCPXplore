import { useState } from 'react'
import { useSettingsStore, type EmbeddingsProvider } from '@/stores/settingsStore'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'

const PROVIDER_TYPES = [
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
  { value: 'voyage', label: 'Voyage AI' }
] as const

const DEFAULT_URLS: Record<string, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  voyage: 'https://api.voyageai.com/v1'
}

function ProviderForm({
  initial,
  onSave,
  onCancel
}: {
  initial?: EmbeddingsProvider
  onSave: (provider: EmbeddingsProvider) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<EmbeddingsProvider>(
    initial ?? {
      id: `emb-${Date.now()}`,
      name: '',
      type: 'openai-compatible',
      baseUrl: DEFAULT_URLS['openai-compatible'],
      apiKey: '',
      models: []
    }
  )
  const [modelsText, setModelsText] = useState(form.models.join(', '))

  const update = (patch: Partial<EmbeddingsProvider>) => {
    const next = { ...form, ...patch }
    if (patch.type && !initial) {
      next.baseUrl = DEFAULT_URLS[patch.type] ?? ''
    }
    setForm(next)
  }

  const handleSave = () => {
    const models = modelsText
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    onSave({ ...form, models })
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. OpenAI Embeddings"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          <select
            value={form.type}
            onChange={(e) => update({ type: e.target.value as EmbeddingsProvider['type'] })}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {PROVIDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Base URL</span>
        <input
          type="url"
          value={form.baseUrl}
          onChange={(e) => update({ baseUrl: e.target.value })}
          placeholder={
            form.type === 'voyage'
              ? 'https://api.voyageai.com/v1'
              : 'https://api.openai.com/v1'
          }
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">API Key</span>
        <input
          type="password"
          value={form.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Models (comma-separated)
        </span>
        <input
          type="text"
          value={modelsText}
          onChange={(e) => setModelsText(e.target.value)}
          placeholder={
            form.type === 'voyage'
              ? 'voyage-4-large, voyage-4, voyage-4-lite'
              : 'text-embedding-3-small, text-embedding-3-large'
          }
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      {form.type === 'voyage' && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
          Voyage AI uses a slightly different API format. The app handles field mapping
          automatically (output_dimension, input_type).
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="size-3.5" /> Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!form.name || !form.baseUrl}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Check className="size-3.5" /> Save
        </button>
      </div>
    </div>
  )
}

export function EmbeddingsProviderConfig() {
  const providers = useSettingsStore((s) => s.embeddingsProviders)
  const addProvider = useSettingsStore((s) => s.addEmbeddingsProvider)
  const updateProvider = useSettingsStore((s) => s.updateEmbeddingsProvider)
  const removeProvider = useSettingsStore((s) => s.removeEmbeddingsProvider)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleSave = (provider: EmbeddingsProvider) => {
    if (editingId) {
      updateProvider(editingId, provider)
      setEditingId(null)
    } else {
      addProvider(provider)
      setShowForm(false)
    }
    window.api.setEmbeddingsProviders(
      editingId
        ? providers.map((p) => (p.id === editingId ? provider : p))
        : [...providers, provider]
    )
  }

  const handleDelete = (id: string) => {
    removeProvider(id)
    window.api.setEmbeddingsProviders(providers.filter((p) => p.id !== id))
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">Embeddings Providers</h3>
          <p className="text-sm text-muted-foreground">
            Configure embedding models for search and retrieval. Supports OpenAI-compatible endpoints
            and Voyage AI.
          </p>
        </div>
        {!showForm && !editingId && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-3.5" /> Add Provider
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4">
          <ProviderForm onSave={handleSave} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {providers.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No embeddings providers configured yet.
        </div>
      ) : (
        <div className="space-y-3">
          {providers.map((provider) =>
            editingId === provider.id ? (
              <ProviderForm
                key={provider.id}
                initial={provider}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={provider.id}
                className="group flex items-center justify-between rounded-lg border border-border p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{provider.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {provider.type}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{provider.baseUrl}</p>
                  {provider.models.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Models: {provider.models.join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingId(provider.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(provider.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
