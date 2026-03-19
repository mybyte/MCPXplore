import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useChatStore } from '@/stores/chatStore'

export function useKeyboardShortcuts() {
  const setView = useAppStore((s) => s.setView)
  const createChat = useChatStore((s) => s.createChat)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleWorkingsPanel = useAppStore((s) => s.toggleWorkingsPanel)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === 'n') {
        e.preventDefault()
        createChat()
        setView('chat')
      }

      if (meta && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }

      if (meta && e.shiftKey && e.key === 'W') {
        e.preventDefault()
        toggleWorkingsPanel()
      }

      if (meta && e.key === ',') {
        e.preventDefault()
        setView('settings')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setView, createChat, toggleSidebar, toggleWorkingsPanel])
}
