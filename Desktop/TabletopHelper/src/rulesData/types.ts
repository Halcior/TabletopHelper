import type { Army } from '../domain/army/types'
import type { StratagemDefinition, TimingTrigger } from '../domain/stratagems/types'

export type StratagemClassification = 'ACTIVE' | 'REACTION' | 'BOTH'

export type StructuredTargetRestrictions = {
  requiredKeywords: readonly string[]
  requiredAnyKeywords: readonly string[]
  excludedKeywords: readonly string[]
}

export type ResolvedStratagem = {
  definition: StratagemDefinition
  factionId: string
  detachmentId: string
  detachmentName: string
  classification: StratagemClassification
  sourceTriggerEvents: readonly string[]
  mappedTriggers: readonly TimingTrigger[]
  fullyAutomatedTiming: boolean
  manualConfirmationRequired: boolean
  manualConfirmationReasons: readonly string[]
  targetRestrictions?: StructuredTargetRestrictions
}

export type RulesDataResolution = {
  faction: { id: string; name: string } | null
  selectedDetachments: Array<{ id: string; name: string }>
  unresolvedDetachmentNames: string[]
  stratagems: ResolvedStratagem[]
  definitions: StratagemDefinition[]
  warnings: string[]
}

/** Domain-facing contract. Provider-specific types stop behind this boundary. */
export interface RulesDataProvider {
  resolveArmyStratagems(army: Pick<Army, 'faction' | 'detachments'>): RulesDataResolution
}
