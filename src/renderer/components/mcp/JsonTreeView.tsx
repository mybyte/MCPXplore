import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type JsonTreeViewProps = {
  data: unknown
  defaultExpanded?: number
  className?: string
}

export function JsonTreeView({ data, defaultExpanded = 2, className }: JsonTreeViewProps) {
  return (
    <div className={cn('font-mono text-xs leading-relaxed', className)}>
      <JsonNode value={data} depth={0} defaultExpanded={defaultExpanded} />
    </div>
  )
}

function JsonNode({
  value,
  depth,
  defaultExpanded
}: {
  value: unknown
  depth: number
  defaultExpanded: number
}) {
  if (value === null) return <span className="text-muted-foreground italic">null</span>
  if (value === undefined) return <span className="text-muted-foreground italic">undefined</span>

  switch (typeof value) {
    case 'string':
      return <StringValue value={value} />
    case 'number':
      return <span className="text-chart-1">{value}</span>
    case 'boolean':
      return <span className="text-chart-2">{String(value)}</span>
    default:
      break
  }

  if (Array.isArray(value)) {
    return <ArrayNode value={value} depth={depth} defaultExpanded={defaultExpanded} />
  }

  if (typeof value === 'object') {
    return (
      <ObjectNode
        value={value as Record<string, unknown>}
        depth={depth}
        defaultExpanded={defaultExpanded}
      />
    )
  }

  return <span>{String(value)}</span>
}

function StringValue({ value }: { value: string }) {
  const isLong = value.length > 120
  const [expanded, setExpanded] = useState(false)
  const display = isLong && !expanded ? value.slice(0, 120) + '...' : value

  return (
    <span className="text-chart-5">
      &quot;
      <span className="whitespace-pre-wrap break-all">{display}</span>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          {expanded ? 'less' : `+${value.length - 120}`}
        </button>
      )}
      &quot;
    </span>
  )
}

function ArrayNode({
  value,
  depth,
  defaultExpanded
}: {
  value: unknown[]
  depth: number
  defaultExpanded: number
}) {
  const [expanded, setExpanded] = useState(depth < defaultExpanded)

  const toggle = useCallback(() => setExpanded((e) => !e), [])

  if (value.length === 0) return <span className="text-muted-foreground">[]</span>

  if (!expanded) {
    return (
      <span>
        <Toggler expanded={false} onClick={toggle} />
        <span className="text-muted-foreground">
          [{value.length} item{value.length !== 1 ? 's' : ''}]
        </span>
      </span>
    )
  }

  return (
    <span>
      <Toggler expanded onClick={toggle} />
      <span className="text-muted-foreground">[</span>
      <div className="pl-4">
        {value.map((item, i) => (
          <div key={i} className="flex">
            <span className="shrink-0 select-none text-muted-foreground/50 mr-2 w-4 text-right">
              {i}
            </span>
            <JsonNode value={item} depth={depth + 1} defaultExpanded={defaultExpanded} />
            {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
      </div>
      <span className="text-muted-foreground">]</span>
    </span>
  )
}

function ObjectNode({
  value,
  depth,
  defaultExpanded
}: {
  value: Record<string, unknown>
  depth: number
  defaultExpanded: number
}) {
  const [expanded, setExpanded] = useState(depth < defaultExpanded)
  const entries = Object.entries(value)

  const toggle = useCallback(() => setExpanded((e) => !e), [])

  if (entries.length === 0) return <span className="text-muted-foreground">{'{}'}</span>

  if (!expanded) {
    return (
      <span>
        <Toggler expanded={false} onClick={toggle} />
        <span className="text-muted-foreground">
          {'{'} {entries.length} key{entries.length !== 1 ? 's' : ''} {'}'}
        </span>
      </span>
    )
  }

  return (
    <span>
      <Toggler expanded onClick={toggle} />
      <span className="text-muted-foreground">{'{'}</span>
      <div className="pl-4">
        {entries.map(([key, val], i) => (
          <div key={key} className="flex flex-wrap">
            <span className="text-chart-3 shrink-0">&quot;{key}&quot;</span>
            <span className="text-muted-foreground mr-1">:</span>
            <JsonNode value={val} depth={depth + 1} defaultExpanded={defaultExpanded} />
            {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
      </div>
      <span className="text-muted-foreground">{'}'}</span>
    </span>
  )
}

function Toggler({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center size-4 -ml-4 mr-0 text-muted-foreground hover:text-foreground transition-colors"
    >
      {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
    </button>
  )
}
