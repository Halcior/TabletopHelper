import type { BattlePhase } from '../battle/types'
import type { StratagemDefinition, TimingTrigger } from './types'

export type ReactionContextRequirements = {
  matchingDefinitionIds: string[]
  requiresTriggerSubject: boolean
  requiresMoveType: boolean
  requiresTargetUnit: boolean
}

function phaseMatches(definition: StratagemDefinition, phase: BattlePhase): boolean {
  return definition.phases.includes('ANY') || definition.phases.includes(phase)
}

/**
 * Describes which pieces of tabletop context are required before a structured
 * reaction timing can be evaluated. Restriction IDs are adapter-owned metadata;
 * this helper never guesses legality or rules text.
 */
export function getReactionContextRequirements(
  definitions: readonly StratagemDefinition[],
  phase: BattlePhase,
  trigger: TimingTrigger,
): ReactionContextRequirements {
  const matching = definitions.filter((definition) => (
    definition.reaction
    && phaseMatches(definition, phase)
    && definition.triggers.includes(trigger)
  ))
  const restrictionIds = matching.flatMap((definition) => (
    definition.restrictions?.map((restriction) => restriction.id) ?? []
  ))

  return {
    matchingDefinitionIds: matching.map((definition) => definition.id),
    requiresTriggerSubject: restrictionIds.some((id) => id.startsWith('40kdc-trigger-subject-')),
    requiresMoveType: restrictionIds.includes('40kdc-trigger-move-type'),
    requiresTargetUnit: restrictionIds.includes('40kdc-target-keywords'),
  }
}

export function reactionContextIsComplete(requirements: ReactionContextRequirements, context: {
  triggerSubjectPlayerId?: string
  triggerSubjectUnitId?: string
  moveType?: string
  targetPlayerId?: string
  targetUnitId?: string
  targetKeywords?: readonly string[]
}): boolean {
  if (requirements.requiresTriggerSubject && (!context.triggerSubjectPlayerId || !context.triggerSubjectUnitId)) return false
  if (requirements.requiresMoveType && !context.moveType) return false
  if (requirements.requiresTargetUnit && (
    !context.targetPlayerId
    || !context.targetUnitId
    || !context.targetKeywords
  )) return false
  return true
}
