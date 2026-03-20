import { useState } from 'react'
import { useSettingsStore, type McpServerConfig as McpServerConfigType } from '@/stores/settingsStore'
import { argsToLine, parseArgsLine } from '@/lib/parseArgsLine'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'

const TRANSPORT_TYPES = [
  { value: 'stdio', label: 'Stdio (local)' },
  { value: 'streamable-http', label: 'Streamable HTTP' },
  { value: 'sse', label: 'SSE (legacy)' }
] as const

function ServerForm({
  initial,
  onSave,
  onCancel
}: {
  initial?: McpServerConfigType
  onSave: (server: McpServerConfigType) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<McpServerConfigType>(
    initial ?? {
      id: `mcp-${Date.now()}`,
      name: '',
      transport: 'stdio',
      command: '',
      args: [],
      url: '',
      env: {}
    }
  )
  const [argsText, setArgsText] = useState(argsToLine(form.args ?? []))
  const [envText, setEnvText] = useState(
    Object.entries(form.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')
  )

  const update = (patch: Partial<McpServerConfigType>) => setForm({ ...form, ...patch })

  const handleSave = () => {
    const args = parseArgsLine(argsText.trim())
    const env: Record<string, string> = {}
    envText
      .split('\n')
      .filter(Boolean)
      .forEach((line) => {
        const eqIdx = line.indexOf('=')
        if (eqIdx > 0) {
          env[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim()
        }
      })
    onSave({ ...form, args, env })
  }

  const isRemote = form.transport === 'sse' || form.transport === 'streamable-http'

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. filesystem"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Transport</span>
          <select
            value={form.transport}
            onChange={(e) => update({ transport: e.target.value as McpServerConfigType['transport'] })}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          >
            {TRANSPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isRemote ? (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">URL</span>
          <input
            type="url"
            value={form.url ?? ''}
            onChange={(e) => update({ url: e.target.value })}
            placeholder="https://mcp-server.example.com"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Command</span>
            <input
              type="text"
              value={form.command ?? ''}
              onChange={(e) => update({ command: e.target.value })}
              placeholder="e.g. npx, node, python"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Arguments (space-separated)
            </span>
            <input
              type="text"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
        </>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">
          Environment Variables (KEY=VALUE, one per line)
        </span>
        <textarea
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          rows={2}
          placeholder="SOME_API_KEY=abc123"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring resize-none font-mono"
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
          disabled={!form.name || (isRemote ? !form.url : !form.command)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Check className="size-3.5" /> Save
        </button>
      </div>
    </div>
  )
}

export function McpServerConfig() {
  const servers = useSettingsStore((s) => s.mcpServers)
  const addServer = useSettingsStore((s) => s.addMcpServer)
  const updateServer = useSettingsStore((s) => s.updateMcpServer)
  const removeServer = useSettingsStore((s) => s.removeMcpServer)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleSave = (server: McpServerConfigType) => {
    const current = useSettingsStore.getState().mcpServers
    if (editingId) {
      updateServer(editingId, server)
      void window.api.setMcpServers(current.map((s) => (s.id === editingId ? server : s)))
      setEditingId(null)
    } else {
      addServer(server)
      void window.api.setMcpServers([...current, server])
      setShowForm(false)
    }
  }

  const handleDelete = (id: string) => {
    const current = useSettingsStore.getState().mcpServers
    removeServer(id)
    void window.api.setMcpServers(current.filter((s) => s.id !== id))
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">MCP Servers</h3>
          <p className="text-sm text-muted-foreground">
            Add MCP servers to access their tools and resources. Supports stdio, Streamable HTTP,
            and SSE transports.
          </p>
        </div>
        {!showForm && !editingId && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-3.5" /> Add Server
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4">
          <ServerForm onSave={handleSave} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {servers.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No MCP servers configured yet.
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server) =>
            editingId === server.id ? (
              <ServerForm
                key={server.id}
                initial={server}
                onSave={handleSave}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={server.id}
                className="group flex items-center justify-between rounded-lg border border-border p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{server.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {server.transport}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {server.transport === 'stdio'
                      ? `${server.command} ${(server.args ?? []).join(' ')}`
                      : server.url}
                  </p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingId(server.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(server.id)}
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
