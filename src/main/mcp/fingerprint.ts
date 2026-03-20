import { createHash } from 'node:crypto'
import type {
  McpToolInfo,
  McpResourceInfo,
  McpResourceTemplateInfo,
  McpPromptInfo,
  McpServerStatus,
  CapabilityFingerprints
} from './types'

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Deterministic JSON serialisation with sorted keys at every nesting level.
 * Produces identical output for semantically identical objects regardless of
 * insertion order.
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce<Record<string, unknown>>((sorted, k) => {
          sorted[k] = (val as Record<string, unknown>)[k]
          return sorted
        }, {})
    }
    return val
  })
}

export function fingerprintTool(tool: McpToolInfo): string {
  const { serverId: _, ...content } = tool
  return sha256(canonicalize(content))
}

export function fingerprintResource(resource: McpResourceInfo): string {
  const { serverId: _, ...content } = resource
  return sha256(canonicalize(content))
}

export function fingerprintResourceTemplate(template: McpResourceTemplateInfo): string {
  const { serverId: _, ...content } = template
  return sha256(canonicalize(content))
}

export function fingerprintPrompt(prompt: McpPromptInfo): string {
  const { serverId: _, ...content } = prompt
  return sha256(canonicalize(content))
}

/**
 * Compute fingerprints for every individual capability and an aggregate
 * server-level hash.  The aggregate changes whenever any single item is
 * added, removed, or modified.
 */
export function fingerprintCapabilities(status: McpServerStatus): CapabilityFingerprints {
  const tools: Record<string, string> = {}
  for (const t of status.tools) {
    tools[t.name] = fingerprintTool(t)
  }

  const resources: Record<string, string> = {}
  for (const r of status.resources) {
    resources[r.uri] = fingerprintResource(r)
  }

  const resourceTemplates: Record<string, string> = {}
  for (const rt of status.resourceTemplates) {
    resourceTemplates[rt.uriTemplate] = fingerprintResourceTemplate(rt)
  }

  const prompts: Record<string, string> = {}
  for (const p of status.prompts) {
    prompts[p.name] = fingerprintPrompt(p)
  }

  const allHashes = [
    ...Object.entries(tools).sort(byKey).map(([, h]) => h),
    ...Object.entries(resources).sort(byKey).map(([, h]) => h),
    ...Object.entries(resourceTemplates).sort(byKey).map(([, h]) => h),
    ...Object.entries(prompts).sort(byKey).map(([, h]) => h)
  ]
  const server = sha256(allHashes.join(':'))

  return { server, tools, resources, resourceTemplates, prompts }
}

function byKey(a: [string, string], b: [string, string]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0
}
