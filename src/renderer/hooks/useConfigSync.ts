import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useMcpStore, type McpServer } from '@/stores/mcpStore'
import { logUiError } from '@/lib/rendererLog'

export function useConfigSync() {
  const setLlmProviders = useSettingsStore((s) => s.setLlmProviders)
  const setEmbeddingsProviders = useSettingsStore((s) => s.setEmbeddingsProviders)
  const setMcpServerConfigs = useSettingsStore((s) => s.setMcpServers)
  const setMongo = useSettingsStore((s) => s.setMongo)
  const setMcpServers = useMcpStore((s) => s.setServers)

  useEffect(() => {
    async function loadConfig() {
      try {
        const config = await window.api.configGetAll()
        if (config) {
          const c = config as Record<string, unknown[]>
          if (Array.isArray(c.llmProviders)) setLlmProviders(c.llmProviders as never[])
          if (Array.isArray(c.embeddingsProviders))
            setEmbeddingsProviders(c.embeddingsProviders as never[])
          if (Array.isArray(c.mcpServers)) setMcpServerConfigs(c.mcpServers as never[])
          const m = c.mongo as { connectionUri?: unknown; chatDatabase?: unknown } | undefined
          if (m && typeof m === 'object') {
            setMongo({
              connectionUri: typeof m.connectionUri === 'string' ? m.connectionUri : '',
              chatDatabase: typeof m.chatDatabase === 'string' ? m.chatDatabase : ''
            })
          }
        }

        // Reconnect servers that were connected in the previous session,
        // then fetch the resulting statuses.
        await window.api.mcpReconnectSaved().catch(() => {})
        const statuses = await window.api.mcpGetStatuses()
        if (Array.isArray(statuses)) {
          setMcpServers(statuses as McpServer[])
        }
      } catch (err) {
        logUiError('useConfigSync.loadConfig', err)
      }
    }
    loadConfig()

    // Listen for MCP status updates from main process
    const cleanup = window.api.onMcpStatus((event) => {
      if (Array.isArray(event)) {
        setMcpServers(event as McpServer[])
      }
    })

    return () => {
      cleanup()
    }
  }, [setLlmProviders, setEmbeddingsProviders, setMcpServerConfigs, setMongo, setMcpServers])
}
