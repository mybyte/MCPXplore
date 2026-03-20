import { Layout } from '@/components/layout/Layout'
import { useConfigSync } from '@/hooks/useConfigSync'
import { useMongoChatSync } from '@/hooks/useMongoChatSync'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export function App() {
  useConfigSync()
  useMongoChatSync()
  useKeyboardShortcuts()
  return <Layout />
}
