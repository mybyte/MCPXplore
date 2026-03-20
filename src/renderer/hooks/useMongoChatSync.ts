import { useEffect, useRef } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useChatStore, type Chat, type Message } from '@/stores/chatStore'
import { logUiError } from '@/lib/rendererLog'

function parseLoadedChat(raw: Record<string, unknown>): Chat | null {
  const id = String(raw.id ?? '')
  if (!id) return null
  const messages = Array.isArray(raw.messages) ? (raw.messages as Message[]) : []
  const mode = raw.mcpToolsMode === 'pick' ? 'pick' : 'all'
  const enabledTools = Array.isArray(raw.enabledTools) ? raw.enabledTools.map(String) : []
  return {
    id,
    title: String(raw.title ?? 'Chat'),
    messages,
    mcpToolsMode: mode,
    enabledTools,
    providerId: String(raw.providerId ?? ''),
    modelId: String(raw.modelId ?? ''),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  }
}

/** Loads chats from MongoDB when configured and keeps the store in sync (debounced). */
export function useMongoChatSync() {
  const hasMongoUri = useSettingsStore((s) => !!s.mongo.connectionUri)
  const databaseName = useSettingsStore((s) => s.mongo.chatDatabase)
  const resolvedUriRef = useRef('')
  const loadSessionRef = useRef(0)
  const mongoReadyRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const db = databaseName.trim()
    loadSessionRef.current += 1
    mongoReadyRef.current = false
    resolvedUriRef.current = ''

    if (!db) return

    const sid = loadSessionRef.current
    let cancelled = false

    ;(async () => {
      try {
        const secrets = await window.api.getSecrets({ type: 'mongo' })
        const uri = (secrets.connectionUri ?? '').trim()
        if (cancelled || sid !== loadSessionRef.current) return
        if (!uri) return
        resolvedUriRef.current = uri

        const rawList = await window.api.mongoLoadChats({ connectionUri: uri, databaseName: db })
        if (cancelled || sid !== loadSessionRef.current) return
        const chats = (Array.isArray(rawList) ? rawList : [])
          .map((r) => parseLoadedChat(r as Record<string, unknown>))
          .filter((c): c is Chat => c !== null)
        useChatStore.getState().replaceChats(chats)
        if (sid !== loadSessionRef.current) return
        mongoReadyRef.current = true
      } catch (err) {
        if (!cancelled && sid === loadSessionRef.current) {
          logUiError('useMongoChatSync.load', err)
          useChatStore.getState().replaceChats([])
          mongoReadyRef.current = true
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasMongoUri, databaseName])

  useEffect(() => {
    const db = databaseName.trim()
    if (!db) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      return
    }

    const runSync = () => {
      if (!mongoReadyRef.current) return
      const uri = resolvedUriRef.current
      if (!uri) return
      const chats = useChatStore.getState().chats
      void window.api
        .mongoSyncChats({
          connectionUri: uri,
          databaseName: db,
          chats: chats as unknown as Record<string, unknown>[]
        })
        .catch((err) => logUiError('useMongoChatSync.sync', err))
    }

    let prevChats = useChatStore.getState().chats
    const unsub = useChatStore.subscribe((state) => {
      if (!mongoReadyRef.current) return
      if (prevChats === state.chats) return
      prevChats = state.chats
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = setTimeout(runSync, 650)
    })

    return () => {
      unsub()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [hasMongoUri, databaseName])
}
