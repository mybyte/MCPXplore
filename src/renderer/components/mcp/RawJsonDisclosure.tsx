import { useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JsonTreeView } from './JsonTreeView'

type RawJsonDisclosureProps = {
  title: string
  data: unknown
  defaultOpen?: boolean
  className?: string
}

export function RawJsonDisclosure({
  title,
  data,
  defaultOpen = false,
  className
}: RawJsonDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState(false)
  const jsonText = JSON.stringify(data, null, 2)

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(jsonText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [jsonText])

  return (
    <div className={cn('rounded-md border border-border', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        {title}
      </button>
      {open && (
        <div className="relative border-t border-border">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void copy()
            }}
            className="absolute top-2 right-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors z-10"
            title="Copy JSON"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          <div className="max-h-96 overflow-auto p-3 pr-10">
            <JsonTreeView data={data} defaultExpanded={2} />
          </div>
        </div>
      )}
    </div>
  )
}
