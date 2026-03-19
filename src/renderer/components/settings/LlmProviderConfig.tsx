import { useState } from 'react'
import { useSettingsStore, type LlmProvider } from '@/stores/settingsStore'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure', label: 'Azure OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI-Compatible' }
] as const

const DEFAULT_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  azure: '',
  'openai-compatible': ''
}

function ProviderForm({
  initial,
  onSave,
  onCancel
}: {
  initial?: LlmProvider
  onSave: (provider: LlmProvider) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<LlmProvider>(
    initial ?? {
      id: `llm-${Date.now()}`,
      name: '',
      type: 'openai',
      baseUrl: DEFAULT_URLS.openai,
      apiKey: '',
      models: []
    }
  )
  const [modelsText, setModelsText] = useState(form.models.join(', '))

  const update = (patch: Partial<LlmProvider>) => {
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
            placeholder="e.g. My OpenAI"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          <select
            value={form.type}
            onChange={(e) => update({ type: e.target.value as LlmProvider['type'] })}
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
            form.type === 'openai-compatible'
              ? 'e.g. http://localhost:11434/v1'
              : form.type === 'azure'
                ? 'e.g. https://your-resource.openai.azure.com'
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
          placeholder="sk-..."
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
          placeholder="gpt-4o, gpt-4o-mini, o1"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

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

export function LlmProviderConfig() {
  const providers = useSettingsStore((s) => s.llmProviders)
  const addProvider = useSettingsStore((s) => s.addLlmProvider)
  const updateProvider = useSettingsStore((s) => s.updateLlmProvider)
  const removeProvider = useSettingsStore((s) => s.removeLlmProvider)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleSave = (provider: LlmProvider) => {
    if (editingId) {
      updateProvider(editingId, provider)
      setEditingId(null)
    } else {
      addProvider(provider)
      setShowForm(false)
    }
    window.api.setLlmProviders(
      editingId
        ? providers.map((p) => (p.id === editingId ? provider : p))
        : [...providers, provider]
    )
  }

  const handleDelete = (id: string) => {
    removeProvider(id)
    window.api.setLlmProviders(providers.filter((p) => p.id !== id))
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">LLM Providers</h3>
          <p className="text-sm text-muted-foreground">
            Configure OpenAI, Azure, or any OpenAI-compatible endpoint (Fireworks, Ollama,
            llama.cpp).
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
          No providers configured yet. Add one to start chatting.
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
