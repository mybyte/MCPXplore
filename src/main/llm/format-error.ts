import { APIError, APIConnectionError, APIUserAbortError } from 'openai'

const MAX_BODY_LEN = 4000

/**
 * Formats an error thrown by the `openai` SDK into a human-readable string
 * suitable for logs and (clipped) for the chat UI.
 */
export function formatApiError(err: unknown): string {
  if (err instanceof APIUserAbortError) {
    return 'Request was aborted.'
  }

  if (err instanceof APIConnectionError) {
    const lines = ['Connection error']
    if (err.message) lines.push(err.message)
    if (err.cause instanceof Error) lines.push(`Cause: ${err.cause.message}`)
    return lines.join('\n')
  }

  if (err instanceof APIError) {
    const lines: string[] = [err.message]
    if (err.status != null) lines.push(`HTTP ${err.status}`)
    if (err.code) lines.push(`Code: ${err.code}`)
    if (err.type) lines.push(`Type: ${err.type}`)

    const body = typeof err.error === 'object' ? JSON.stringify(err.error) : String(err.error ?? '')
    if (body && body !== '{}') {
      const clipped =
        body.length > MAX_BODY_LEN ? `${body.slice(0, MAX_BODY_LEN)}… (truncated)` : body
      lines.push(`Response body:\n${clipped}`)
    }

    // Some providers (e.g. Cerebras) return 402 with no JSON body when billing/credits block usage.
    if (err.status === 402) {
      lines.push(
        '402 means Payment Required: billing may be inactive, credits exhausted, or this key cannot run inference. Check your provider account (for Cerebras: cloud.cerebras.ai and the inference docs).'
      )
    }

    return lines.join('\n')
  }

  if (err instanceof Error) return err.message
  return String(err)
}
