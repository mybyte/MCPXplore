import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { logToMain, logUiError } from '@/lib/rendererLog'
import './styles/globals.css'

function installGlobalErrorLogging(): void {
  window.addEventListener('error', (event) => {
    const err = event.error
    logToMain({
      level: 'error',
      source: 'window.error',
      message: err instanceof Error ? err.message : event.message || 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
      detail: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined
    })
  })
  window.addEventListener('unhandledrejection', (event) => {
    logUiError('unhandledrejection', event.reason)
  })
}

installGlobalErrorLogging()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
