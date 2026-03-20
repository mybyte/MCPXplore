import { APICallError } from '@ai-sdk/provider'

const MAX_BODY_LEN = 4000

function causeMessage(cause: unknown): string | undefined {
  if (cause instanceof Error) return cause.message
  if (
    cause != null &&
    typeof cause === 'object' &&
    'message' in cause &&
    typeof (cause as { message: unknown }).message === 'string'
  ) {
    return (cause as { message: string }).message
  }
  return undefined
}

/**
 * AI SDK throws {@link APICallError} with HTTP status, URL, and raw body, but `message` is often generic
 * (e.g. "Invalid JSON response"). This surfaces the useful fields for logs and UI.
 */
export function formatAiSdkApiError(err: unknown): string {
  if (APICallError.isInstance(err)) {
    const lines: string[] = [err.message]
    if (err.statusCode != null) lines.push(`HTTP ${err.statusCode}`)
    if (err.url) lines.push(`URL: ${err.url}`)
    const body = err.responseBody?.trim()
    if (body) {
      const clipped =
        body.length > MAX_BODY_LEN ? `${body.slice(0, MAX_BODY_LEN)}… (truncated)` : body
      lines.push(`Response body:\n${clipped}`)
    }
    const c = causeMessage(err.cause)
    if (c) lines.push(`Detail: ${c}`)
    return lines.join('\n')
  }
  if (err instanceof Error) return err.message
  return String(err)
}
