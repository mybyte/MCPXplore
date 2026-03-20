export type RendererLogLevel = 'error' | 'warn' | 'info' | 'debug'

export type RendererLogEntry = {
  level: RendererLogLevel
  source: string
  message: string
  detail?: string
  stack?: string
}

function mirrorToConsole(entry: RendererLogEntry): void {
  const prefix = `[renderer:${entry.source}]`
  const rest = [entry.message, entry.detail, entry.stack].filter(Boolean)
  switch (entry.level) {
    case 'error':
      console.error(prefix, ...rest)
      break
    case 'warn':
      console.warn(prefix, ...rest)
      break
    case 'info':
      console.info(prefix, ...rest)
      break
    default:
      console.debug(prefix, ...rest)
  }
}

/** Forwards a log line to the main process (visible in the terminal when running `bun run dev`) and mirrors to DevTools. */
export function logToMain(entry: RendererLogEntry): void {
  mirrorToConsole(entry)
  if (typeof window !== 'undefined' && window.api?.logFromRenderer) {
    void window.api.logFromRenderer(entry).catch(() => {
      /* avoid recursive logging */
    })
  }
}

export function logUiError(source: string, err: unknown, extra?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined
  let detail: string | undefined
  if (extra && Object.keys(extra).length > 0) {
    try {
      detail = JSON.stringify(extra)
    } catch {
      detail = String(extra)
    }
  }
  logToMain({ level: 'error', source, message, stack, detail })
}

export function logUiWarn(source: string, message: string, extra?: Record<string, unknown>): void {
  let detail: string | undefined
  if (extra && Object.keys(extra).length > 0) {
    try {
      detail = JSON.stringify(extra)
    } catch {
      detail = String(extra)
    }
  }
  logToMain({ level: 'warn', source, message, detail })
}
