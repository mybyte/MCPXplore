/**
 * Extracts reasoning / "thinking" content from streaming deltas.
 *
 * Two sources are handled:
 *  1. Native `reasoning_content` field on the delta (o-series models).
 *  2. `<think>…</think>` tags embedded in `content` (DeepSeek R1, QwQ, etc.).
 *
 * For (2) a small state machine strips the tags from the visible text and
 * yields the enclosed content separately so the caller can emit it as
 * `reasoning-delta` events.
 */

export interface ReasoningResult {
  /** Text content to show in the chat bubble (think tags stripped). */
  text: string
  /** Reasoning content to show in the workings panel. */
  reasoning: string
}

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/**
 * Stateful parser that separates `<think>…</think>` blocks from regular text
 * across an arbitrary number of streaming chunks.  Create one per streaming
 * response and call {@link push} for every content delta.
 */
export class ThinkTagParser {
  private inside = false
  /** Partial tag characters that haven't been confirmed yet. */
  private buf = ''

  push(chunk: string): ReasoningResult {
    let text = ''
    let reasoning = ''

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i]
      this.buf += ch

      if (this.inside) {
        const closeIdx = this.buf.indexOf(CLOSE_TAG)
        if (closeIdx !== -1) {
          reasoning += this.buf.slice(0, closeIdx)
          this.buf = this.buf.slice(closeIdx + CLOSE_TAG.length)
          this.inside = false
        } else if (!CLOSE_TAG.startsWith(this.buf.slice(-CLOSE_TAG.length))) {
          // No partial match for close tag at the tail -- flush everything
          // except the last N chars that could still be a partial close tag.
          const safe = this.safeFlushLength(CLOSE_TAG)
          reasoning += this.buf.slice(0, safe)
          this.buf = this.buf.slice(safe)
        }
      } else {
        const openIdx = this.buf.indexOf(OPEN_TAG)
        if (openIdx !== -1) {
          text += this.buf.slice(0, openIdx)
          this.buf = this.buf.slice(openIdx + OPEN_TAG.length)
          this.inside = true
        } else if (!OPEN_TAG.startsWith(this.buf.slice(-OPEN_TAG.length))) {
          const safe = this.safeFlushLength(OPEN_TAG)
          text += this.buf.slice(0, safe)
          this.buf = this.buf.slice(safe)
        }
      }
    }

    return { text, reasoning }
  }

  /** Flush any remaining buffered content (call after the stream ends). */
  flush(): ReasoningResult {
    const result: ReasoningResult = {
      text: this.inside ? '' : this.buf,
      reasoning: this.inside ? this.buf : ''
    }
    this.buf = ''
    return result
  }

  /**
   * Returns the number of characters from the start of `buf` that can be
   * safely emitted without risking splitting a partial tag match at the tail.
   */
  private safeFlushLength(tag: string): number {
    for (let overlap = Math.min(tag.length - 1, this.buf.length); overlap > 0; overlap--) {
      if (tag.startsWith(this.buf.slice(-overlap))) {
        return Math.max(0, this.buf.length - overlap)
      }
    }
    return this.buf.length
  }
}
