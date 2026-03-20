import { useState, useCallback } from 'react'
import { FileText, Download, Loader2 } from 'lucide-react'
import { useMcpStore, type CallHistoryEntry } from '@/stores/mcpStore'
import { logUiError } from '@/lib/rendererLog'
import { OutputRenderer, type McpCallResult } from './OutputRenderer'

export function ResourceDetail() {
  const selection = useMcpStore((s) => s.selection)
  const servers = useMcpStore((s) => s.servers)
  const addHistoryEntry = useMcpStore((s) => s.addHistoryEntry)

  if (selection?.type !== 'resource') return null

  const server = servers.find((s) => s.id === selection.serverId)
  if (!server) return null

  const resource = server.resources.find((r) => r.uri === selection.uri)
  const template = server.resourceTemplates.find((t) => t.uriTemplate === selection.uri)

  if (!resource && !template) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">Resource not found</p>
      </div>
    )
  }

  if (template) {
    return (
      <ResourceTemplateInner
        key={`${selection.serverId}:${template.uriTemplate}`}
        template={template}
        serverId={selection.serverId}
        serverName={server.name}
        addHistoryEntry={addHistoryEntry}
      />
    )
  }

  return (
    <ResourceInner
      key={`${selection.serverId}:${resource!.uri}`}
      resource={resource!}
      serverId={selection.serverId}
      serverName={server.name}
      addHistoryEntry={addHistoryEntry}
    />
  )
}

function ResourceInner({
  resource,
  serverId,
  serverName,
  addHistoryEntry
}: {
  resource: { uri: string; name: string; description?: string; mimeType?: string }
  serverId: string
  serverName: string
  addHistoryEntry: (entry: CallHistoryEntry) => void
}) {
  const [result, setResult] = useState<McpCallResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState<number | undefined>()
  const [timestamp, setTimestamp] = useState<number | undefined>()

  const handleFetch = useCallback(async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    const start = Date.now()
    const ts = start
    try {
      const res = await window.api.mcpReadResource(serverId, resource.uri)
      const dur = Date.now() - start
      const normalized = normalizeResourceResult(res)
      setResult(normalized)
      setElapsed(dur)
      setTimestamp(ts)
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'resource',
        itemName: resource.name,
        args: { uri: resource.uri },
        result: res,
        elapsed: dur
      })
    } catch (err) {
      const dur = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setElapsed(dur)
      setTimestamp(ts)
      logUiError('ResourceDetail.fetch', err, { serverId, uri: resource.uri })
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'resource',
        itemName: resource.name,
        args: { uri: resource.uri },
        result: null,
        error: msg,
        elapsed: dur
      })
    } finally {
      setLoading(false)
    }
  }, [serverId, resource.uri, resource.name, serverName, addHistoryEntry])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="font-mono text-sm font-semibold">{resource.name}</h3>
        </div>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{resource.uri}</p>
        {resource.description && (
          <p className="mt-1 text-xs text-muted-foreground">{resource.description}</p>
        )}
        {resource.mimeType && (
          <span className="inline-block mt-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {resource.mimeType}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <button
          onClick={handleFetch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {loading ? 'Fetching...' : 'Fetch'}
        </button>

        {(result || error) && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Content
            </p>
            <OutputRenderer
              result={result}
              error={error}
              elapsed={elapsed}
              serverName={serverName}
              timestamp={timestamp}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ResourceTemplateInner({
  template,
  serverId,
  serverName,
  addHistoryEntry
}: {
  template: { uriTemplate: string; name: string; description?: string; mimeType?: string }
  serverId: string
  serverName: string
  addHistoryEntry: (entry: CallHistoryEntry) => void
}) {
  const params = extractTemplateParams(template.uriTemplate)
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p, '']))
  )
  const [result, setResult] = useState<McpCallResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState<number | undefined>()
  const [timestamp, setTimestamp] = useState<number | undefined>()

  const resolvedUri = resolveTemplate(template.uriTemplate, values)

  const handleFetch = useCallback(async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    const start = Date.now()
    const ts = start
    try {
      const res = await window.api.mcpReadResource(serverId, resolvedUri)
      const dur = Date.now() - start
      const normalized = normalizeResourceResult(res)
      setResult(normalized)
      setElapsed(dur)
      setTimestamp(ts)
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'resource',
        itemName: template.name,
        args: { uriTemplate: template.uriTemplate, ...values },
        result: res,
        elapsed: dur
      })
    } catch (err) {
      const dur = Date.now() - start
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setElapsed(dur)
      setTimestamp(ts)
      logUiError('ResourceDetail.fetchTemplate', err, { serverId, uri: resolvedUri })
      addHistoryEntry({
        id: crypto.randomUUID(),
        timestamp: ts,
        serverId,
        serverName,
        kind: 'resource',
        itemName: template.name,
        args: { uriTemplate: template.uriTemplate, ...values },
        result: null,
        error: msg,
        elapsed: dur
      })
    } finally {
      setLoading(false)
    }
  }, [serverId, resolvedUri, template, values, serverName, addHistoryEntry])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="font-mono text-sm font-semibold">{template.name}</h3>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            template
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{template.uriTemplate}</p>
        {template.description && (
          <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {params.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Template Parameters
            </p>
            {params.map((param) => (
              <div key={param} className="space-y-1">
                <label className="text-xs font-mono font-medium">{param}</label>
                <input
                  type="text"
                  value={values[param] ?? ''}
                  onChange={(e) => setValues({ ...values, [param]: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground font-mono">{resolvedUri}</p>
          </div>
        )}

        <button
          onClick={handleFetch}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {loading ? 'Fetching...' : 'Fetch'}
        </button>

        {(result || error) && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Content
            </p>
            <OutputRenderer
              result={result}
              error={error}
              elapsed={elapsed}
              serverName={serverName}
              timestamp={timestamp}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function extractTemplateParams(template: string): string[] {
  const matches = template.match(/\{([^}]+)\}/g)
  if (!matches) return []
  return matches.map((m) => m.slice(1, -1))
}

function resolveTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, key) => values[key] ?? `{${key}}`)
}

function normalizeResourceResult(res: unknown): McpCallResult {
  if (!res || typeof res !== 'object') {
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
  }
  const obj = res as Record<string, unknown>
  if (Array.isArray(obj.contents)) {
    return {
      content: (obj.contents as Record<string, unknown>[]).map((c) => ({
        type: c.text != null ? 'text' : c.blob != null ? 'image' : 'text',
        text: c.text != null ? String(c.text) : undefined,
        data: c.blob != null ? String(c.blob) : undefined,
        mimeType: c.mimeType != null ? String(c.mimeType) : undefined
      }))
    }
  }
  return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
}
