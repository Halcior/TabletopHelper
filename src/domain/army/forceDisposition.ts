import type { Army } from './types'
import type { ForceDisposition } from '../../rulesets/cauldronFFA3/duelPrimary'
import publishedData from './forceDispositionSources.json'

type Source = { date: string; url: string }
type DetachmentRule = {
  dp: number
  dispositions?: ForceDisposition[]
}
type FactionRules = {
  source: string
  detachments: Record<string, DetachmentRule>
  updates?: Record<string, DetachmentRule & { source: string; verified?: true }>
}
const factions: Record<string, FactionRules> = publishedData.factions as Record<string, FactionRules>
const sources: Record<string, Source> = publishedData.sources

function key(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function match<T>(entries: Record<string, T> | undefined, name: string): T | undefined {
  return Object.entries(entries ?? {}).find(([label]) => key(label) === key(name))?.[1]
}

export function detachmentEvidence(army: Army) {
  return army.detachments.map(detachment => {
    const faction = match(factions, detachment.faction ?? army.faction)
    const latest = match(faction?.updates, detachment.name)
    const rule = latest ?? match(faction?.detachments, detachment.name)
    return {
      name: detachment.name,
      dp: rule?.dp,
      dispositions: rule?.dispositions ?? [],
      source: sources[latest?.source ?? faction?.source ?? ''] as Source | undefined,
      status: latest?.verified ? 'verified' as const : latest ? 'partial' as const
        : rule ? 'historical' as const : 'unknown' as const,
    }
  })
}

/** In Doubles either army can provide the team's disposition. Never pool DP. */
export function assessForceDispositions(armies: (Army | undefined)[]) {
  const evidence = armies.map(army => ({
    army,
    detachments: army ? detachmentEvidence(army) : [],
  }))
  const hasCompleteEvidence = evidence.length > 0 && evidence.every(({ detachments }) =>
    detachments.length > 0 && detachments.every(rule => rule.status === 'verified'))
  const current = new Set(evidence.flatMap(({ detachments }) => detachments
    .filter(rule => rule.status === 'verified').flatMap(rule => rule.dispositions)))
  const published = new Set(evidence.flatMap(({ detachments }) => detachments.flatMap(rule => rule.dispositions)))
  return { evidence, hasCompleteEvidence, current, published }
}
