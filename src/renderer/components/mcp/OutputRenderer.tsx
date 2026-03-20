import { useState } from 'react'
import { Copy, Check, AlertCircle, Clock, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatMarkdown } from '@/components/chat/ChatMarkdown'
import { JsonTreeView } from './JsonTreeView'

export type McpContentItem = {
  type?: string
  text?: string
  data?: string
  mimeType?: string
  resource?: { uri?: string; text?: string; mimeType?: string }
}

export type McpCallResult = {
  content?: McpContentItem[]
  isError?: boolean
  _meta?: Record<string, unknown>
}

type OutputRendererProps = {
  result: McpCallResult | null
  error?: string | null
  elapsed?: number
  serverName?: string
  timestamp?: number
  className?: string
}

export function OutputRenderer({
  result,
  error,
  elapsed,
  serverName,
  timestamp,
  className
}: OutputRendererProps) {
  if (error) {
    return (
      <div className={cn('space-y-2', className)}>
        <ErrorCard message={error} />
        {elapsed != null && <MetadataBar elapsed={elapsed} serverName={serverName} timestamp={timestamp} />}
      </div>
    )
  }

  if (!result) return null

  const contentItems = result.content ?? []

  if (result.isError) {
    const errorText = contentItems
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n')
    return (
      <div className={cn('space-y-2', className)}>
        <ErrorCard message={errorText || 'Tool returned an error'} />
        {elapsed != null && <MetadataBar elapsed={elapsed} serverName={serverName} timestamp={timestamp} />}
      </div>
    )
  }

  if (contentItems.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground italic">
          Empty response
        </div>
        {elapsed != null && <MetadataBar elapsed={elapsed} serverName={serverName} timestamp={timestamp} />}
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {contentItems.map((item, i) => (
        <ContentItemRenderer key={i} item={item} />
      ))}
      {elapsed != null && <MetadataBar elapsed={elapsed} serverName={serverName} timestamp={timestamp} />}
    </div>
  )
}

function ContentItemRenderer({ item }: { item: McpContentItem }) {
  if (item.type === 'image' && item.data) {
    const mime = item.mimeType ?? 'image/png'
    return (
      <div className="space-y-1">
        <img
          src={`data:${mime};base64,${item.data}`}
          alt="Tool output"
          className="max-h-96 max-w-full rounded-md border border-border object-contain"
        />
      </div>
    )
  }

  if (item.type === 'resource' && item.resource) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 space-y-1">
        <p className="text-xs text-muted-foreground font-mono">{item.resource.uri}</p>
        {item.resource.text && <TextContentRenderer text={item.resource.text} />}
      </div>
    )
  }

  const text = item.text ?? ''
  if (!text) return null
  return <TextContentRenderer text={text} />
}

function TextContentRenderer({ text }: { text: string }) {
  const parsed = tryParseJson(text)
  if (parsed !== undefined) {
    return (
      <div className="relative rounded-md border border-border bg-muted/20 overflow-hidden">
        <CopyButton text={text} />
        <div className="p-3 pl-7 overflow-x-auto max-h-[32rem] overflow-y-auto">
          <JsonTreeView data={parsed} defaultExpanded={3} />
        </div>
      </div>
    )
  }

  if (looksLikeMarkdown(text)) {
    return (
      <div className="relative rounded-md border border-border bg-muted/20 overflow-hidden">
        <CopyButton text={text} />
        <div className="p-3 overflow-x-auto max-h-[32rem] overflow-y-auto">
          <ChatMarkdown content={text} variant="assistant" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative rounded-md border border-border bg-muted/20 overflow-hidden">
      <CopyButton text={text} />
      <pre className="p-3 overflow-x-auto max-h-[32rem] overflow-y-auto font-mono text-xs whitespace-pre-wrap break-words">
        {text}
      </pre>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors z-10"
      title="Copy to clipboard"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
      <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
      <pre className="text-xs text-destructive whitespace-pre-wrap break-words font-mono flex-1">
        {message}
      </pre>
    </div>
  )
}

function MetadataBar({
  elapsed,
  serverName,
  timestamp
}: {
  elapsed?: number
  serverName?: string
  timestamp?: number
}) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      {elapsed != null && (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`}
        </span>
      )}
      {serverName && (
        <span className="inline-flex items-center gap-1">
          <Server className="size-3" />
          {serverName}
        </span>
      )}
      {timestamp && (
        <span>
          {new Date(timestamp).toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}

function tryParseJson(text: string): unknown | undefined {
  const trimmed = text.trim()
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  return undefined
}

function looksLikeMarkdown(text: string): boolean {
  if (text.length < 10) return false
  const indicators = [
    /^#{1,6}\s/m,
    /\*\*[^*]+\*\*/,
    /\[[^\]]+\]\([^)]+\)/,
    /^[-*]\s/m,
    /^>\s/m,
    /```/,
    /^\|.*\|/m
  ]
  let matches = 0
  for (const re of indicators) {
    if (re.test(text)) matches++
  }
  return matches >= 2
}
