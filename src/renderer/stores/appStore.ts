import { create } from 'zustand'

export type View = 'chat' | 'mcp-explorer' | 'settings'

interface AppState {
  currentView: View
  setView: (view: View) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  workingsPanelOpen: boolean
  toggleWorkingsPanel: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'chat',
  setView: (view) => set({ currentView: view }),
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  workingsPanelOpen: false,
  toggleWorkingsPanel: () => set((s) => ({ workingsPanelOpen: !s.workingsPanelOpen }))
}))
