import type { CapabilityFingerprints, CapabilityChanges, ItemChanges } from './types'

/**
 * Diff two fingerprint maps (keyed by item name/URI) and classify each
 * entry as added, removed, or modified.
 */
function diffFingerprints(
  prev: Record<string, string> | undefined,
  curr: Record<string, string>
): ItemChanges {
  const prevMap = prev ?? {}
  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []

  for (const key of Object.keys(curr)) {
    if (!(key in prevMap)) {
      added.push(key)
    } else if (prevMap[key] !== curr[key]) {
      modified.push(key)
    }
  }

  for (const key of Object.keys(prevMap)) {
    if (!(key in curr)) {
      removed.push(key)
    }
  }

  return { added: added.sort(), removed: removed.sort(), modified: modified.sort() }
}

/**
 * Compare a previous and current set of capability fingerprints and produce
 * a structured description of what changed.
 *
 * When `prev` is `null` (first observation, e.g. initial connect) every
 * current item is reported as "added".
 */
export function diffCapabilities(
  serverId: string,
  serverName: string,
  prev: CapabilityFingerprints | null,
  curr: CapabilityFingerprints
): CapabilityChanges {
  return {
    serverId,
    serverName,
    previousFingerprint: prev?.server ?? null,
    currentFingerprint: curr.server,
    tools: diffFingerprints(prev?.tools, curr.tools),
    resources: diffFingerprints(prev?.resources, curr.resources),
    resourceTemplates: diffFingerprints(prev?.resourceTemplates, curr.resourceTemplates),
    prompts: diffFingerprints(prev?.prompts, curr.prompts)
  }
}

/** Returns true when the change set contains at least one added/removed/modified item. */
export function hasChanges(changes: CapabilityChanges): boolean {
  for (const category of [changes.tools, changes.resources, changes.resourceTemplates, changes.prompts]) {
    if (category.added.length > 0 || category.removed.length > 0 || category.modified.length > 0) {
      return true
    }
  }
  return false
}
