import { useState } from 'react'
import { useSettingsStore, type EmbeddingsProvider } from '@/stores/settingsStore'
import { Plus, Pencil, Trash2, X, Check, Loader2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ModelPicker } from './ModelPicker'

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'fireworks', label: 'Fireworks' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'voyage', label: 'Voyage AI' },
  { value: 'voyage-mongo', label: 'Voyage AI (MongoDB Atlas)' }
] as const

const DEFAULT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  azure: '',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  voyage: 'https://api.voyageai.com/v1',
  'voyage-mongo': 'https://ai.mongodb.com/v1'
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
      type: 'openai',
      baseUrl: DEFAULT_URLS.openai,
      apiKey: '',
      models: []
    }
  )
  const [formTestBusy, setFormTestBusy] = useState(false)
  const [formTestMessage, setFormTestMessage] = useState<string | null>(null)

  const update = (patch: Partial<EmbeddingsProvider>) => {
    const next = { ...form, ...patch }
    if (patch.type && !initial) {
      next.baseUrl = DEFAULT_URLS[patch.type] ?? ''
    }
    setForm(next)
  }

  const handleSave = () => {
    onSave(form)
  }

  const runFormTest = async () => {
    setFormTestMessage(null)
    if (!form.baseUrl.trim()) {
      setFormTestMessage('Set a base URL before testing.')
      return
    }
    if (form.models.length === 0) {
      setFormTestMessage('Add at least one model to run a test.')
      return
    }
    setFormTestBusy(true)
    try {
      const result = await window.api.embeddingsTestConnection({
        provider: form,
        modelId: form.models[0]
      })
      if (result.ok) {
        const tok =
          result.totalTokens != null ? `, ${result.totalTokens} token(s) billed` : ''
        setFormTestMessage(
          `OK — model "${result.modelId}" returned a ${result.dimensions}-dimensional vector${tok}`
        )
      } else {
        setFormTestMessage(result.error)
      }
    } catch (e) {
      setFormTestMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setFormTestBusy(false)
    }
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
            form.type === 'azure'
              ? 'e.g. https://your-resource.openai.azure.com'
              : DEFAULT_URLS[form.type] || 'https://api.openai.com/v1'
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

      {form.type === 'azure' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">API Version</span>
          <input
            type="text"
            value={form.apiVersion ?? ''}
            onChange={(e) => update({ apiVersion: e.target.value || undefined })}
            placeholder="2025-03-01-preview"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      )}

      <ModelPicker
        models={form.models}
        onChange={(models) => update({ models })}
        providerConfig={{
          type: form.type,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          apiVersion: form.apiVersion
        }}
      />

      {formTestMessage && (
        <p
          className={cn(
            'text-xs rounded-md border px-2 py-1.5',
            formTestMessage.startsWith('OK —')
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
              : 'border-destructive/30 bg-destructive/5 text-destructive'
          )}
        >
          {formTestMessage}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={runFormTest}
          disabled={formTestBusy}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
        >
          {formTestBusy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Zap className="size-3.5" />
          )}
          Test connection
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="size-3.5" /> Cancel
        </button>
        <button
          type="button"
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
  const [editingInitial, setEditingInitial] = useState<EmbeddingsProvider | null>(null)
  const [testBusyId, setTestBusyId] = useState<string | null>(null)
  const [testModelFor, setTestModelFor] = useState<Record<string, string>>({})
  const [testBanner, setTestBanner] = useState<{
    providerId: string
    ok: boolean
    text: string
  } | null>(null)

  const startEditing = async (id: string) => {
    const provider = providers.find((p) => p.id === id)
    if (!provider) return
    const secrets = await window.api.getSecrets({ type: 'embeddings', id })
    setEditingInitial({ ...provider, apiKey: secrets.apiKey ?? '' })
    setEditingId(id)
  }

  const handleSave = (provider: EmbeddingsProvider) => {
    if (editingId) {
      updateProvider(editingId, provider)
      setEditingId(null)
      setEditingInitial(null)
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

  const runSavedProviderTest = async (provider: EmbeddingsProvider) => {
    if (provider.models.length === 0) {
      setTestBanner({
        providerId: provider.id,
        ok: false,
        text: 'Add at least one model ID before testing.'
      })
      return
    }
    const modelId = testModelFor[provider.id] ?? provider.models[0]
    setTestBusyId(provider.id)
    setTestBanner(null)
    try {
      const result = await window.api.embeddingsTestConnection({
        providerId: provider.id,
        modelId
      })
      if (result.ok) {
        const tok =
          result.totalTokens != null ? `, ${result.totalTokens} token(s) billed` : ''
        setTestBanner({
          providerId: provider.id,
          ok: true,
          text: `Model "${result.modelId}" — ${result.dimensions} dimensions${tok}`
        })
      } else {
        setTestBanner({ providerId: provider.id, ok: false, text: result.error })
      }
    } catch (e) {
      setTestBanner({
        providerId: provider.id,
        ok: false,
        text: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setTestBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">Embeddings Providers</h3>
          <p className="text-sm text-muted-foreground">
            Configure embedding models for search and retrieval.
            Use <span className="font-medium text-foreground">Test</span> or{' '}
            <span className="font-medium text-foreground">Test connection</span> to request one
            embedding and confirm auth and the model ID.
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
                initial={editingInitial ?? provider}
                onSave={handleSave}
                onCancel={() => { setEditingId(null); setEditingInitial(null) }}
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
                  {testBanner?.providerId === provider.id && (
                    <p
                      className={cn(
                        'text-xs mt-2 rounded-md border px-2 py-1.5',
                        testBanner.ok
                          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
                          : 'border-destructive/30 bg-destructive/5 text-destructive'
                      )}
                    >
                      {testBanner.ok ? `Connection OK — ${testBanner.text}` : testBanner.text}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                  {provider.models.length > 1 && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="whitespace-nowrap">Test model</span>
                      <select
                        value={testModelFor[provider.id] ?? provider.models[0]}
                        onChange={(e) =>
                          setTestModelFor((m) => ({ ...m, [provider.id]: e.target.value }))
                        }
                        className="max-w-[180px] rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                      >
                        {provider.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Request one embedding to verify the endpoint"
                      onClick={() => runSavedProviderTest(provider)}
                      disabled={testBusyId === provider.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {testBusyId === provider.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Zap className="size-3.5" />
                      )}
                      Test
                    </button>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => void startEditing(provider.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(provider.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
