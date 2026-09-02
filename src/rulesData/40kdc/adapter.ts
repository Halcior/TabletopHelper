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
  FortyKdcMoveType,
  FortyKdcPhase,
  FortyKdcPlayerTurn,
  FortyKdcSource,
  FortyKdcStratagemRecord,
  FortyKdcTargetRestrictions,
  FortyKdcTriggerRecord,
  FortyKdcTriggerSubject,
} from './sourceTypes'

const SOURCE_NAME = '40kdc-data'
type AutomaticTriggerSubject = Extract<FortyKdcTriggerSubject, 'friendly-unit' | 'enemy-unit' | 'any-unit'>

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
    case 'on-model-destroyed': return 'MODEL_DESTROYED'
    case 'on-unit-destroyed':
    case 'enemy-unit-destroyed-in-melee': return 'UNIT_DESTROYED'
    case 'after-battle-shock': return 'BATTLESHOCK_RESOLVED'
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
    description: 'Selected target must satisfy the structured keyword restrictions.',
    evaluate: ({ context }) => {
      const candidate = context.targetKeywords
      if (!Array.isArray(candidate) || !candidate.every((keyword) => typeof keyword === 'string')) {
        return { allowed: false, reason: 'Target keywords are not available for this timing checkpoint.' }
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

function subjectRestriction(subject: AutomaticTriggerSubject): TimingRestriction {
  return {
    id: `40kdc-trigger-subject-${subject}`,
    description: `Structured trigger subject: ${subject}.`,
    evaluate: ({ playerId, context }) => {
      if (subject === 'any-unit') return true
      const subjectPlayerId = context.triggerSubjectPlayerId
      if (typeof subjectPlayerId !== 'string') {
        return { allowed: false, reason: 'Triggering unit owner is not available for this timing checkpoint.' }
      }
      const allowed = subject === 'friendly-unit' ? subjectPlayerId === playerId : subjectPlayerId !== playerId
      return {
        allowed,
        reason: allowed ? undefined : `The triggering unit is not a valid ${subject} subject.`,
      }
    },
  }
}

function moveTypeRestriction(moveTypes: readonly FortyKdcMoveType[]): TimingRestriction {
  return {
    id: '40kdc-trigger-move-type',
    description: `Movement trigger is restricted to: ${moveTypes.join(', ')}.`,
    evaluate: ({ context }) => {
      const moveType = context.moveType
      if (typeof moveType !== 'string') {
        return { allowed: false, reason: 'Move type is not available for this timing checkpoint.' }
      }
      const allowed = moveTypes.includes(moveType as FortyKdcMoveType)
      return {
        allowed,
        reason: allowed ? undefined : 'The triggering move type does not satisfy this Stratagem.',
      }
    },
  }
}

function commonSubject(triggers: readonly FortyKdcTriggerRecord[]): {
  subject?: FortyKdcTriggerSubject
  mixed: boolean
} {
  if (triggers.length === 0) return { mixed: false }
  const values = triggers.map((trigger) => trigger.subject ?? null)
  const unique = new Set(values)
  if (unique.size !== 1) return { mixed: true }
  return { subject: values[0] ?? undefined, mixed: false }
}

function automaticSubject(subject: FortyKdcTriggerSubject | undefined): AutomaticTriggerSubject | undefined {
  return subject === 'friendly-unit' || subject === 'enemy-unit' || subject === 'any-unit' ? subject : undefined
}

function sourceBoundSubject(subject: FortyKdcTriggerSubject | undefined): boolean {
  return subject === 'self' || subject === 'bearer' || subject === 'model-in-bearer'
}

function moveTypeKey(values: readonly FortyKdcMoveType[]): string {
  return [...values].sort().join('|')
}

function commonMoveTypes(triggers: readonly FortyKdcTriggerRecord[]): {
  moveTypes: readonly FortyKdcMoveType[]
  mixed: boolean
} {
  if (triggers.length === 0) return { moveTypes: [], mixed: false }
  const first = triggers[0].moveTypes ?? []
  const key = moveTypeKey(first)
  if (triggers.some((trigger) => moveTypeKey(trigger.moveTypes ?? []) !== key)) {
    return { moveTypes: [], mixed: true }
  }
  return { moveTypes: first, mixed: false }
}

function adaptStratagem(input: {
  factionId: string
  detachment: FortyKdcSource['detachments'][number]
  stratagem: FortyKdcStratagemRecord
  ability?: FortyKdcAbilityRecord
}): ResolvedStratagem {
  const { factionId, detachment, stratagem, ability } = input
  const sourceTriggers = ability?.triggers ?? []
  const sourceEvents = sourceTriggers.map((trigger) => trigger.event)
  const mapped = sourceTriggers
    .map((trigger) => mapEvent(trigger.event, stratagem.phases))
    .filter((trigger): trigger is TimingTrigger => Boolean(trigger))
  const mappedTriggers = [...new Set<TimingTrigger>(mapped)]
  const unmappedEvents = sourceEvents.filter((event) => !mapEvent(event, stratagem.phases))
  if (sourceEvents.length === 0 || unmappedEvents.length > 0) mappedTriggers.push('CUSTOM_CONFIRMATION')

  const targetRestrictions = structuredRestrictions(stratagem.targetRestrictions)
  const subject = commonSubject(sourceTriggers)
  const autoSubject = automaticSubject(subject.subject)
  const moveTypes = commonMoveTypes(sourceTriggers)
  const reasons = [
    ...(sourceEvents.length === 0 ? ['No structured trigger is available from the source.'] : []),
    ...(unmappedEvents.length > 0 ? [`Unsupported source trigger: ${unmappedEvents.join(', ')}.`] : []),
    ...(sourceTriggers.some((trigger) => trigger.hasCondition)
      ? ['The source trigger contains a condition that the current timing model cannot evaluate.']
      : []),
    ...(sourceTriggers.some((trigger) => trigger.hasProximity)
      ? ['The source trigger contains a proximity guard that requires manual confirmation.']
      : []),
    ...(sourceTriggers.some((trigger) => trigger.hasWindow)
      ? ['The source trigger contains a timing window that requires manual confirmation.']
      : []),
    ...(subject.mixed ? ['The source uses different trigger subjects for different timing events.'] : []),
    ...(sourceBoundSubject(subject.subject)
      ? ['The trigger is bound to the Stratagem source or bearer, which is not selected automatically yet.']
      : []),
    ...(moveTypes.mixed ? ['The source uses different move-type guards for different timing events.'] : []),
    ...(stratagem.targetRestrictions?.hasUnstructuredNotes
      ? ['The source contains an unstructured restriction that was not imported.']
      : []),
  ]
  const classification = mapClassification(stratagem.playerTurn, ability)
  const restrictions: TimingRestriction[] = [
    ...(targetRestrictions ? [targetRestriction(targetRestrictions)] : []),
    ...(autoSubject && !subject.mixed ? [subjectRestriction(autoSubject)] : []),
    ...(moveTypes.moveTypes.length > 0 && !moveTypes.mixed ? [moveTypeRestriction(moveTypes.moveTypes)] : []),
  ]
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
