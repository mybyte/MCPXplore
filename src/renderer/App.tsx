import { Layout } from '@/components/layout/Layout'
import { useConfigSync } from '@/hooks/useConfigSync'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

export function App() {
  useConfigSync()
  useKeyboardShortcuts()
  return <Layout />
}
