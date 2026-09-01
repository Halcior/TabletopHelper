export type FortyKdcPhase = 'command' | 'movement' | 'shooting' | 'charge' | 'fight'
export type FortyKdcPlayerTurn = 'your-turn' | 'opponent-turn' | 'either'

export type FortyKdcFactionRecord = {
  id: string
  name: string
}

export type FortyKdcDetachmentRecord = {
  id: string
  name: string
  factionId: string
  stratagemIds: readonly string[]
}

export type FortyKdcTargetRestrictions = {
  requiredKeywords?: readonly string[]
  requiredAnyKeywords?: readonly string[]
  excludedKeywords?: readonly string[]
  hasUnstructuredNotes?: boolean
}

export type FortyKdcTriggerRecord = {
  event: string
  hasStructuredGuard: boolean
}

export type FortyKdcAbilityRecord = {
  id: string
  behavior?: 'passive' | 'activated' | 'reactive' | 'aura'
  triggers: readonly FortyKdcTriggerRecord[]
  /** Community-authored plain-English approximation rendered from Ability DSL. */
  description?: string
}

export type FortyKdcStratagemRecord = {
  id: string
  name: string
  detachmentId: string | null
  cpCost: number
  phases: readonly FortyKdcPhase[]
  playerTurn: FortyKdcPlayerTurn
  timing: 'once-per-phase' | 'once-per-turn' | 'once-per-battle' | 'unlimited'
  targetRestrictions?: FortyKdcTargetRestrictions
  abilityId: string | null
}

/** Minimal snapshot consumed by the adapter; no package types cross this file. */
export type FortyKdcSource = {
  factions: readonly FortyKdcFactionRecord[]
  detachments: readonly FortyKdcDetachmentRecord[]
  stratagems: readonly FortyKdcStratagemRecord[]
  abilities: readonly FortyKdcAbilityRecord[]
}
