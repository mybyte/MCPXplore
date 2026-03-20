/** Split a command line respecting double-quoted segments (shell-like, minimal). */
export function parseArgsLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (quote) {
      if (c === quote) {
        quote = null
      } else {
        cur += c
      }
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (/\s/.test(c)) {
      if (cur.length) {
        out.push(cur)
        cur = ''
      }
    } else {
      cur += c
    }
  }
  if (cur.length) out.push(cur)
  return out
}

/** Join args for display; quote segments that contain whitespace or quotes. */
export function argsToLine(args: string[]): string {
  return args
    .map((a) => {
      if (a === '') return '""'
      if (/[\s"'\\]/.test(a)) {
        return `"${a.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      }
      return a
    })
    .join(' ')
}
