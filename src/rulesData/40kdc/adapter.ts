import type { Army } from '../../domain/army/types'
import type {
  OwnerScope,
  StratagemDefinition,
  TimingPhase,
  TimingRestriction,
  TimingTrigger,
  UsageLimit,
} from '../../domain/stratagems/types'
import type {
  ResolvedStratagem,
  RulesDataProvider,
  RulesDataResolution,
  StratagemClassification,
  StructuredTargetRestrictions,
} from '../types'
import type {
  FortyKdcAbilityRecord,
  FortyKdcPhase,
  FortyKdcPlayerTurn,
  FortyKdcSource,
  FortyKdcStratagemRecord,
  FortyKdcTargetRestrictions,
} from './sourceTypes'

const SOURCE_NAME = '40kdc-data'

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '')
}

function mapPhase(phase: FortyKdcPhase): TimingPhase {
  switch (phase) {
    case 'command': return 'COMMAND'
    case 'movement': return 'MOVEMENT'
    case 'shooting': return 'SHOOTING'
    case 'charge': return 'CHARGE'
    case 'fight': return 'FIGHT'
  }
}

function mapOwnerScope(playerTurn: FortyKdcPlayerTurn): OwnerScope {
  switch (playerTurn) {
    case 'your-turn': return 'ACTIVE_PLAYER'
    case 'opponent-turn': return 'OPPONENT'
    case 'either': return 'ANY_PLAYER'
  }
}

function mapClassification(
  playerTurn: FortyKdcPlayerTurn,
  ability: FortyKdcAbilityRecord | undefined,
): StratagemClassification {
  if (playerTurn === 'either') return 'BOTH'
  if (playerTurn === 'opponent-turn' || ability?.behavior === 'reactive') return 'REACTION'
  return 'ACTIVE'
}

function mapUsageLimit(timing: FortyKdcStratagemRecord['timing']): UsageLimit[] {
  switch (timing) {
    case 'once-per-phase': return ['ONCE_PER_PHASE']
    case 'once-per-turn': return ['ONCE_PER_TURN']
    case 'once-per-battle': return ['ONCE_PER_BATTLE']
    case 'unlimited': return []
  }
}

function mapEvent(event: string, phases: readonly FortyKdcPhase[]): TimingTrigger | undefined {
  switch (event) {
    case 'start-of-phase':
    case 'start-of-command-phase': return 'PHASE_START'
    case 'end-of-phase': return 'PHASE_END'
    case 'selected-to-advance': return 'UNIT_SELECTED_TO_MOVE'
    case 'normal-move':
    case 'advance-move':
    case 'advances':
    case 'fall-back-move':
    case 'falls-back':
    case 'enemy-unit-ended-move':
    case 'enemy-unit-fell-back': return 'UNIT_FINISHED_MOVE'
    case 'selected-to-shoot': return 'UNIT_SELECTED_TO_SHOOT'
    case 'after-enemy-unit-fires': return 'SHOOTING_ATTACK_RESOLVED'
    case 'charge-declaration': return 'CHARGE_DECLARED'
    case 'after-charge-roll': return 'CHARGE_ROLL_MADE'
    case 'charge-move':
    case 'end-of-charge-move': return 'CHARGE_COMPLETED'
    case 'selected-to-fight': return 'UNIT_SELECTED_TO_FIGHT'
    case 'on-unit-destroyed':
    case 'enemy-unit-destroyed-in-melee': return 'UNIT_DESTROYED'
    case 'after-unit-resolves-attacks': {
      if (phases.length === 1 && phases[0] === 'shooting') return 'SHOOTING_ATTACK_RESOLVED'
      if (phases.length === 1 && phases[0] === 'fight') return 'FIGHT_RESOLVED'
      return undefined
    }
    default: return undefined
  }
}

function structuredRestrictions(
  input: FortyKdcTargetRestrictions | undefined,
): StructuredTargetRestrictions | undefined {
  if (!input) return undefined
  const result = {
    requiredKeywords: input.requiredKeywords ?? [],
    requiredAnyKeywords: input.requiredAnyKeywords ?? [],
    excludedKeywords: input.excludedKeywords ?? [],
  }
  return result.requiredKeywords.length
    || result.requiredAnyKeywords.length
    || result.excludedKeywords.length
    ? result
    : undefined
}

function targetRestriction(input: StructuredTargetRestrictions): TimingRestriction {
  return {
    id: '40kdc-target-keywords',
    description: 'Confirm that the selected target satisfies its keyword restrictions.',
    evaluate: ({ context }) => {
      const candidate = context.targetKeywords
      if (!Array.isArray(candidate) || !candidate.every((keyword) => typeof keyword === 'string')) {
        return { allowed: false, reason: 'Target keywords require manual confirmation.' }
      }
      const keywords = new Set(candidate.map((keyword) => normalize(keyword)))
      const hasAll = input.requiredKeywords.every((keyword) => keywords.has(normalize(keyword)))
      const hasAny = input.requiredAnyKeywords.length === 0
        || input.requiredAnyKeywords.some((keyword) => keywords.has(normalize(keyword)))
      const hasExcluded = input.excludedKeywords.some((keyword) => keywords.has(normalize(keyword)))
      return {
        allowed: hasAll && hasAny && !hasExcluded,
        reason: hasAll && hasAny && !hasExcluded
          ? undefined
          : 'The selected target does not satisfy this Stratagem\'s keyword restrictions.',
      }
    },
  }
}

function adaptStratagem(input: {
  factionId: string
  detachment: FortyKdcSource['detachments'][number]
  stratagem: FortyKdcStratagemRecord
  ability?: FortyKdcAbilityRecord
}): ResolvedStratagem {
  const { factionId, detachment, stratagem, ability } = input
  const sourceEvents = ability?.triggers.map((trigger) => trigger.event) ?? []
  const mapped = ability?.triggers
    .map((trigger) => mapEvent(trigger.event, stratagem.phases))
    .filter((trigger): trigger is TimingTrigger => Boolean(trigger)) ?? []
  const mappedTriggers = [...new Set<TimingTrigger>(mapped)]
  const unmappedEvents = sourceEvents.filter((event) => !mapEvent(event, stratagem.phases))
  if (sourceEvents.length === 0 || unmappedEvents.length > 0) mappedTriggers.push('CUSTOM_CONFIRMATION')

  const targetRestrictions = structuredRestrictions(stratagem.targetRestrictions)
  const reasons = [
    ...(sourceEvents.length === 0 ? ['No structured trigger is available from the source.'] : []),
    ...(unmappedEvents.length > 0 ? [`Unsupported source trigger: ${unmappedEvents.join(', ')}.`] : []),
    ...(ability?.triggers.some((trigger) => trigger.hasStructuredGuard)
      ? ['The source trigger contains guards that the current timing model cannot evaluate.']
      : []),
    ...(targetRestrictions ? ['Target keyword restrictions require a selected target.'] : []),
    ...(stratagem.targetRestrictions?.hasUnstructuredNotes
      ? ['The source contains an unstructured restriction that was not imported.']
      : []),
  ]
  const classification = mapClassification(stratagem.playerTurn, ability)
  const restrictions = targetRestrictions ? [targetRestriction(targetRestrictions)] : []
  const description = ability?.description?.trim()
  const definition: StratagemDefinition = {
    id: `40kdc:${stratagem.id}`,
    kind: 'STRATAGEM',
    name: stratagem.name,
    description: description || 'Detailed effect text is not available in the structured rules data.',
    ownerScope: mapOwnerScope(stratagem.playerTurn),
    timing: sourceEvents.length > 0
      ? `Structured source event: ${sourceEvents.join(', ')}`
      : 'Exact timing requires manual confirmation.',
    phases: [...new Set(stratagem.phases.map(mapPhase))],
    triggers: mappedTriggers,
    reaction: classification !== 'ACTIVE',
    restrictions,
    usageLimits: mapUsageLimit(stratagem.timing),
    source: `${SOURCE_NAME}:${factionId}/${detachment.id}`,
    cpCost: stratagem.cpCost,
  }

  return {
    definition,
    factionId,
    detachmentId: detachment.id,
    detachmentName: detachment.name,
    classification,
    sourceTriggerEvents: sourceEvents,
    mappedTriggers,
    fullyAutomatedTiming: reasons.length === 0,
    manualConfirmationRequired: reasons.length > 0,
    manualConfirmationReasons: reasons,
    targetRestrictions,
  }
}

export class FortyKdcRulesDataProvider implements RulesDataProvider {
  constructor(private readonly source: FortyKdcSource) {}

  resolveArmyStratagems(army: Pick<Army, 'faction' | 'detachments'>): RulesDataResolution {
    const factionKey = normalize(army.faction)
    const faction = this.source.factions.find((candidate) => (
      normalize(candidate.id) === factionKey || normalize(candidate.name) === factionKey
    )) ?? null
    if (!faction) {
      return {
        faction: null,
        selectedDetachments: [],
        unresolvedDetachmentNames: army.detachments.map((detachment) => detachment.name),
        stratagems: [],
        definitions: [],
        warnings: [`No exact ${SOURCE_NAME} faction match for "${army.faction}".`],
      }
    }

    const factionDetachments = this.source.detachments.filter(
      (detachment) => detachment.factionId === faction.id,
    )
    const selectedDetachments = army.detachments.flatMap((selected) => {
      const key = normalize(selected.name)
      const resolved = factionDetachments.find((candidate) => (
        normalize(candidate.id) === key || normalize(candidate.name) === key
      ))
      return resolved ? [resolved] : []
    })
    const unresolvedDetachmentNames = army.detachments
      .filter((selected) => !selectedDetachments.some((resolved) => (
        normalize(resolved.name) === normalize(selected.name)
        || normalize(resolved.id) === normalize(selected.name)
      )))
      .map((detachment) => detachment.name)

    const stratagemById = new Map(this.source.stratagems.map((stratagem) => [stratagem.id, stratagem]))
    const abilityById = new Map(this.source.abilities.map((ability) => [ability.id, ability]))
    const seen = new Set<string>()
    const resolvedStratagems = selectedDetachments.flatMap((detachment) => {
      const ids = new Set([
        ...detachment.stratagemIds,
        ...this.source.stratagems
          .filter((stratagem) => stratagem.detachmentId === detachment.id)
          .map((stratagem) => stratagem.id),
      ])
      return [...ids].flatMap((id) => {
        if (seen.has(id)) return []
        const stratagem = stratagemById.get(id)
        if (!stratagem || stratagem.detachmentId !== detachment.id) return []
        seen.add(id)
        return [adaptStratagem({
          factionId: faction.id,
          detachment,
          stratagem,
          ability: stratagem.abilityId ? abilityById.get(stratagem.abilityId) : undefined,
        })]
      })
    })

    return {
      faction,
      selectedDetachments: selectedDetachments.map(({ id, name }) => ({ id, name })),
      unresolvedDetachmentNames,
      stratagems: resolvedStratagems,
      definitions: resolvedStratagems.map(({ definition }) => definition),
      warnings: unresolvedDetachmentNames.map(
        (name) => `No exact ${SOURCE_NAME} detachment match for "${name}" in ${faction.name}.`,
      ),
    }
  }
}
