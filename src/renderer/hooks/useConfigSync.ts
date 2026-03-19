import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useMcpStore, type McpServer } from '@/stores/mcpStore'

export function useConfigSync() {
  const setLlmProviders = useSettingsStore((s) => s.setLlmProviders)
  const setEmbeddingsProviders = useSettingsStore((s) => s.setEmbeddingsProviders)
  const setMcpServerConfigs = useSettingsStore((s) => s.setMcpServers)
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
        }

        // Load existing MCP statuses
        const statuses = await window.api.mcpGetStatuses()
        if (Array.isArray(statuses)) {
          setMcpServers(statuses as McpServer[])
        }
      } catch (err) {
        console.error('Failed to load config:', err)
      }
    }
    loadConfig()

    // Listen for MCP status updates from main process
    const cleanup = window.api.onMcpStatus((event) => {
      if (Array.isArray(event)) {
        setMcpServers(event as McpServer[])
      }
    })

    return cleanup
  }, [setLlmProviders, setEmbeddingsProviders, setMcpServerConfigs, setMcpServers])
}
