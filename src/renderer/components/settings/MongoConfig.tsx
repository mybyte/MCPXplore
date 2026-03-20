import { useEffect, useState, useCallback } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Loader2, Database, Zap, Plus, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export function MongoConfig() {
  const stored = useSettingsStore((s) => s.mongo)
  const setMongo = useSettingsStore((s) => s.setMongo)

  const [connectionUri, setConnectionUri] = useState(stored.connectionUri)
  const [revealed, setRevealed] = useState(false)
  const [chatDatabase, setChatDatabase] = useState(stored.chatDatabase)
  const [databases, setDatabases] = useState<string[]>([])
  const [testBusy, setTestBusy] = useState(false)
  const [testMessage, setTestMessage] = useState<string | null>(null)
  const [ensureBusy, setEnsureBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)

  useEffect(() => {
    setConnectionUri(stored.connectionUri)
    setChatDatabase(stored.chatDatabase)
    setRevealed(false)
  }, [stored.connectionUri, stored.chatDatabase])

  const revealUri = useCallback(async () => {
    const secrets = await window.api.getSecrets({ type: 'mongo' })
    setConnectionUri(secrets.connectionUri ?? '')
    setRevealed(true)
  }, [])

  const hideUri = useCallback(() => {
    setConnectionUri(stored.connectionUri)
    setRevealed(false)
  }, [stored.connectionUri])

  const resolveUri = useCallback(async (): Promise<string> => {
    if (revealed) return connectionUri.trim()
    const secrets = await window.api.getSecrets({ type: 'mongo' })
    return (secrets.connectionUri ?? '').trim()
  }, [revealed, connectionUri])

  const runTest = async () => {
    setTestMessage(null)
    setTestBusy(true)
    try {
      const uri = await resolveUri()
      const result = await window.api.mongoTestConnection(uri)
      if (result.ok) {
        setDatabases(result.databases)
        setTestMessage(`Connected — ${result.databases.length} database(s) listed below.`)
      } else {
        setTestMessage(result.error)
        setDatabases([])
      }
    } catch (e) {
      setTestMessage(e instanceof Error ? e.message : String(e))
      setDatabases([])
    } finally {
      setTestBusy(false)
    }
  }

  const runEnsureDatabase = async () => {
    setTestMessage(null)
    const db = chatDatabase.trim()
    if (!db) {
      setTestMessage('Enter a database name first.')
      return
    }
    setEnsureBusy(true)
    try {
      const uri = await resolveUri()
      const result = await window.api.mongoEnsureDatabase({
        connectionUri: uri,
        databaseName: db
      })
      if (result.ok) {
        await runTest()
        setTestMessage((prev) =>
          prev
            ? `${prev} · Database "${db}" is ready (collection mcpxplore_chats).`
            : `Database "${db}" is ready.`
        )
      } else {
        setTestMessage(result.error)
      }
    } catch (e) {
      setTestMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setEnsureBusy(false)
    }
  }

  const saveSettings = async () => {
    setSaveBusy(true)
    try {
      const uri = await resolveUri()
      const next = {
        connectionUri: uri,
        chatDatabase: chatDatabase.trim()
      }
      setMongo(next)
      await window.api.setMongo(next)
      setRevealed(false)
      setTestMessage('Settings saved.')
    } catch (e) {
      setTestMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSaveBusy(false)
    }
  }

  const hasUri = !!connectionUri.trim()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h3 className="font-medium">MongoDB</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Store chat history in MongoDB. Chats are saved in the{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">mcpxplore_chats</code> collection.
          Test the connection, pick or create a database, then save.
        </p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Connection URI</span>
            {hasUri && !revealed && (
              <button
                type="button"
                onClick={() => void revealUri()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Eye className="size-3" /> Reveal
              </button>
            )}
            {revealed && (
              <button
                type="button"
                onClick={hideUri}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <EyeOff className="size-3" /> Hide
              </button>
            )}
          </div>
          <textarea
            value={connectionUri}
            onChange={(e) => { setConnectionUri(e.target.value); if (!revealed) setRevealed(true) }}
            placeholder="mongodb://user:pass@host:27017 or mongodb+srv://..."
            rows={3}
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring resize-y min-h-[4.5rem]',
              !revealed && hasUri && 'text-muted-foreground'
            )}
            readOnly={!revealed && hasUri}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testBusy || !hasUri}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50'
            )}
          >
            {testBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
            Test connection
          </button>
        </div>

        {testMessage && (
          <p
            className={cn(
              'text-sm rounded-md px-3 py-2',
              testMessage.startsWith('Connected') ||
              testMessage === 'Settings saved.' ||
              testMessage.includes('is ready')
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-destructive/10 text-destructive'
            )}
          >
            {testMessage}
          </p>
        )}

        {databases.length > 0 && (
          <label className="space-y-1 block">
            <span className="text-xs font-medium text-muted-foreground">Existing databases</span>
            <select
              value={databases.includes(chatDatabase) ? chatDatabase : ''}
              onChange={(e) => {
                const v = e.target.value
                if (v) setChatDatabase(v)
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Select —</option>
              {databases.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="space-y-1 block">
          <span className="text-xs font-medium text-muted-foreground">Chat history database</span>
          <input
            type="text"
            value={chatDatabase}
            onChange={(e) => setChatDatabase(e.target.value)}
            placeholder="e.g. mcpxplore"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring"
            spellCheck={false}
          />
          <span className="text-[11px] text-muted-foreground">
            Type a new name and use &quot;Create database&quot; if it does not exist yet.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runEnsureDatabase()}
            disabled={ensureBusy || !hasUri || !chatDatabase.trim()}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
          >
            {ensureBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Create database
          </button>

          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saveBusy}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saveBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
            Save settings
          </button>
        </div>
      </div>
    </div>
  )
}
