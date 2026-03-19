/// <reference types="vite/client" />

import type { McpXploreAPI } from '../preload/index'

declare global {
  interface Window {
    api: McpXploreAPI
  }
}
