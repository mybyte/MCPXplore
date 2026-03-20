import { useState, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Code, FormInput, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  default?: unknown
  description?: string
  title?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  allOf?: JsonSchema[]
  const?: unknown
}

type SchemaFormProps = {
  schema: JsonSchema
  value: Record<string, unknown>
  onChange: (value: Record<string, unknown>) => void
  disabled?: boolean
}

export function SchemaForm({ schema, value, onChange, disabled }: SchemaFormProps) {
  const [rawMode, setRawMode] = useState(false)
  const [rawJson, setRawJson] = useState(() => JSON.stringify(value, null, 2))
  const [rawError, setRawError] = useState<string | null>(null)
  const lastFormValueRef = useRef(value)

  useEffect(() => {
    if (!rawMode && value !== lastFormValueRef.current) {
      setRawJson(JSON.stringify(value, null, 2))
      lastFormValueRef.current = value
    }
  }, [value, rawMode])

  const handleRawChange = useCallback(
    (text: string) => {
      setRawJson(text)
      try {
        const parsed = JSON.parse(text)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          setRawError(null)
          lastFormValueRef.current = parsed
          onChange(parsed)
        } else {
          setRawError('Must be a JSON object')
        }
      } catch {
        setRawError('Invalid JSON')
      }
    },
    [onChange]
  )

  const switchToRaw = () => {
    setRawJson(JSON.stringify(value, null, 2))
    setRawError(null)
    setRawMode(true)
  }

  const switchToForm = () => {
    try {
      const parsed = JSON.parse(rawJson)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        onChange(parsed)
      }
    } catch {
      // keep form value as-is
    }
    setRawMode(false)
  }

  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const hasProperties = Object.keys(properties).length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Arguments
        </span>
        <button
          onClick={rawMode ? switchToForm : switchToRaw}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
          disabled={disabled}
        >
          {rawMode ? (
            <>
              <FormInput className="size-3" /> Form
            </>
          ) : (
            <>
              <Code className="size-3" /> JSON
            </>
          )}
        </button>
      </div>

      {rawMode ? (
        <div className="space-y-1">
          <textarea
            value={rawJson}
            onChange={(e) => handleRawChange(e.target.value)}
            disabled={disabled}
            rows={Math.min(20, Math.max(4, rawJson.split('\n').length + 1))}
            spellCheck={false}
            className={cn(
              'w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring resize-y',
              rawError ? 'border-destructive' : 'border-input'
            )}
          />
          {rawError && <p className="text-xs text-destructive">{rawError}</p>}
        </div>
      ) : !hasProperties ? (
        <p className="text-xs text-muted-foreground italic">No parameters defined. Switch to JSON to provide arguments manually.</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(properties).map(([key, propSchema]) => (
            <SchemaFormField
              key={key}
              name={key}
              schema={propSchema}
              value={value[key]}
              required={required.has(key)}
              onChange={(v) => {
                const next = { ...value }
                if (v === undefined || v === '') {
                  delete next[key]
                } else {
                  next[key] = v
                }
                onChange(next)
              }}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function resolveType(schema: JsonSchema): string {
  if (schema.const !== undefined) return typeof schema.const === 'string' ? 'string' : 'string'
  if (schema.enum) return 'enum'
  if (typeof schema.type === 'string') return schema.type
  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.filter((t) => t !== 'null')
    return nonNull[0] ?? 'string'
  }
  if (schema.properties) return 'object'
  if (schema.items) return 'array'
  if (schema.oneOf || schema.anyOf) return 'string'
  return 'string'
}

function SchemaFormField({
  name,
  schema,
  value,
  required,
  onChange,
  disabled,
  depth = 0
}: {
  name: string
  schema: JsonSchema
  value: unknown
  required: boolean
  onChange: (v: unknown) => void
  disabled?: boolean
  depth?: number
}) {
  const type = resolveType(schema)
  const label = schema.title ?? name
  const description = schema.description

  return (
    <div className={cn('space-y-1', depth > 0 && 'pl-3 border-l border-border/50')}>
      <label className="flex items-baseline gap-1 text-xs font-medium">
        <span className="font-mono text-foreground">{label}</span>
        {required && <span className="text-destructive">*</span>}
        <span className="text-muted-foreground font-normal">
          {type === 'enum' ? '' : type}
        </span>
      </label>
      {description && (
        <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
      )}
      <FieldInput
        type={type}
        schema={schema}
        value={value}
        onChange={onChange}
        disabled={disabled}
        depth={depth}
      />
    </div>
  )
}

function FieldInput({
  type,
  schema,
  value,
  onChange,
  disabled,
  depth
}: {
  type: string
  schema: JsonSchema
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
  depth: number
}) {
  switch (type) {
    case 'enum':
      return (
        <select
          value={value != null ? String(value) : ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return onChange(undefined)
            const enumVal = schema.enum?.find((v) => String(v) === raw)
            onChange(enumVal ?? raw)
          }}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">-- select --</option>
          {schema.enum?.map((v) => (
            <option key={String(v)} value={String(v)}>
              {String(v)}
            </option>
          ))}
        </select>
      )

    case 'boolean':
      return (
        <button
          type="button"
          onClick={() => onChange(value === true ? false : true)}
          disabled={disabled}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            value === true ? 'bg-primary' : 'bg-muted'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm transition-transform',
              value === true ? 'translate-x-4' : 'translate-x-0'
            )}
          />
        </button>
      )

    case 'number':
    case 'integer':
      return (
        <input
          type="number"
          value={value != null ? String(value) : ''}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') return onChange(undefined)
            onChange(type === 'integer' ? parseInt(raw, 10) : parseFloat(raw))
          }}
          min={schema.minimum}
          max={schema.maximum}
          step={type === 'integer' ? 1 : undefined}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
          placeholder={schema.default != null ? `default: ${schema.default}` : undefined}
        />
      )

    case 'array':
      return (
        <ArrayField
          schema={schema}
          value={value}
          onChange={onChange}
          disabled={disabled}
          depth={depth}
        />
      )

    case 'object':
      return (
        <ObjectField
          schema={schema}
          value={value}
          onChange={onChange}
          disabled={disabled}
          depth={depth}
        />
      )

    default: {
      const isLong =
        (schema.maxLength && schema.maxLength > 200) ||
        schema.format === 'textarea' ||
        (schema.description?.toLowerCase().includes('multiline'))
      if (isLong) {
        return (
          <textarea
            value={value != null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            disabled={disabled}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-y"
            placeholder={schema.default != null ? `default: ${schema.default}` : undefined}
          />
        )
      }
      return (
        <input
          type="text"
          value={value != null ? String(value) : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring"
          placeholder={schema.default != null ? `default: ${schema.default}` : undefined}
        />
      )
    }
  }
}

function ArrayField({
  schema,
  value,
  onChange,
  disabled,
  depth
}: {
  schema: JsonSchema
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
  depth: number
}) {
  const items = Array.isArray(value) ? value : []
  const itemSchema = schema.items ?? { type: 'string' }

  const addItem = () => {
    onChange([...items, getDefaultForSchema(itemSchema)])
  }

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index)
    onChange(next.length > 0 ? next : undefined)
  }

  const updateItem = (index: number, v: unknown) => {
    const next = [...items]
    next[index] = v
    onChange(next)
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <div className="flex-1">
            <SchemaFormField
              name={`[${i}]`}
              schema={itemSchema}
              value={item}
              required={false}
              onChange={(v) => updateItem(i, v)}
              disabled={disabled}
              depth={depth + 1}
            />
          </div>
          <button
            onClick={() => removeItem(i)}
            disabled={disabled}
            className="mt-5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}
      <button
        onClick={addItem}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
      >
        <Plus className="size-3" /> Add item
      </button>
    </div>
  )
}

function ObjectField({
  schema,
  value,
  onChange,
  disabled,
  depth
}: {
  schema: JsonSchema
  value: unknown
  onChange: (v: unknown) => void
  disabled?: boolean
  depth: number
}) {
  const [expanded, setExpanded] = useState(true)
  const obj = (typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : {}) as Record<string, unknown>
  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])

  if (Object.keys(properties).length === 0) {
    return (
      <textarea
        value={typeof value === 'object' ? JSON.stringify(value, null, 2) : ''}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value))
          } catch {
            // let user keep typing
          }
        }}
        disabled={disabled}
        rows={3}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono outline-none focus:ring-1 focus:ring-ring resize-y"
        placeholder="{}"
      />
    )
  }

  return (
    <div className="rounded-md border border-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {Object.keys(properties).length} fields
      </button>
      {expanded && (
        <div className="space-y-2 px-2 pb-2">
          {Object.entries(properties).map(([key, propSchema]) => (
            <SchemaFormField
              key={key}
              name={key}
              schema={propSchema}
              value={obj[key]}
              required={required.has(key)}
              onChange={(v) => {
                const next = { ...obj }
                if (v === undefined || v === '') {
                  delete next[key]
                } else {
                  next[key] = v
                }
                onChange(Object.keys(next).length > 0 ? next : undefined)
              }}
              disabled={disabled}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function getDefaultForSchema(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return schema.default
  const type = resolveType(schema)
  switch (type) {
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'array':
      return []
    case 'object':
      return {}
    case 'enum':
      return schema.enum?.[0]
    default:
      return ''
  }
}
