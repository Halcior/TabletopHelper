import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../battle/engine'
import { startMissionAction } from '../battle/missionActions'
import type { BattlePhase, BattleSession } from '../battle/types'
import { requestReactionHold } from '../stratagems/battleIntegration'
import type { StratagemDefinition } from '../stratagems/types'
import { advanceCauldronPhase, dispatchCauldronBattleEvent } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { CAULDRON_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { buildBattleContext } from './contextEngine'
import type { ContextRulesByPlayer } from './types'

const phases: BattlePhase[] = ['COMMAND', 'MOVEMENT', 'SHOOTING', 'CHARGE', 'FIGHT', 'END_TURN']

function game(...cards: SecondaryId[]): BattleSession {
  const requested = [...new Set(cards)]
  const deck = [...requested, ...CAULDRON_SECONDARY_IDS.filter((card) => !requested.includes(card))]
  return testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
}

function toPhase(session: BattleSession, phase: BattlePhase): BattleSession {
  let current = session
  while (current.state.phase !== phase) current = advanceCauldronPhase(current)
  return current
}

function definition(input: Partial<StratagemDefinition> & Pick<StratagemDefinition, 'id' | 'name'>): StratagemDefinition {
  return {
    kind: 'STRATAGEM',
    description: 'Structured metadata only.',
    ownerScope: 'ANY_PLAYER',
    phases: ['ANY'],
    triggers: ['PHASE_START'],
    reaction: false,
    source: 'test',
    cpCost: 1,
    ...input,
  }
}

function rules(records: Array<{
  definition: StratagemDefinition
  classification?: 'ACTIVE' | 'REACTION' | 'BOTH'
  manual?: boolean
}>, playerId = 'p-a'): ContextRulesByPlayer {
  return {
    [playerId]: {
      stratagems: records.map((record) => ({
        definition: record.definition,
        classification: record.classification ?? 'ACTIVE',
        manualConfirmationRequired: record.manual ?? false,
        fullyAutomatedTiming: !(record.manual ?? false),
      })),
    },
  }
}

function source(context: ReturnType<typeof buildBattleContext>, value: string) {
  return context.sections.flatMap((section) => section.items).filter((item) => item.source === value)
}

describe('Context Engine phase priorities', () => {
  it('derives Command refill, mulligan, and Operational Plan availability', () => {
    const session = dispatchBattleEvent(game('SILA_OGNIA', 'SKANOWANIE_SYGNALU'), {
      type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 1 },
    })
    const context = buildBattleContext({ session })
    expect(context.phase).toBe('COMMAND')
    expect(context.priorities.some((item) => item.type === 'SECONDARY_MULLIGAN')).toBe(true)
    expect(source(context, 'SECONDARY').some((item) => item.type === 'SECONDARY_REFILL' && item.status === 'DONE')).toBe(true)
    expect(source(context, 'OPERATIONAL_PLAN')[0].actions[0]?.type).toBe('CHANGE_OPERATIONAL_PLAN')
  })

  it('shows a Movement Mission Action opportunity and hides an irrelevant Shooting goal', () => {
    const context = buildBattleContext({ session: toPhase(game('SKANOWANIE_SYGNALU', 'SILA_OGNIA'), 'MOVEMENT') })
    const goals = source(context, 'SECONDARY')
    expect(goals.some((item) => item.relatedSecondaryId === 'SKANOWANIE_SYGNALU')).toBe(true)
    expect(goals.find((item) => item.relatedSecondaryId === 'SKANOWANIE_SYGNALU')?.actions[0].type).toBe('START_MISSION_ACTION')
    expect(goals.some((item) => item.relatedSecondaryId === 'SILA_OGNIA')).toBe(false)
  })

  it('shows the Shooting goal, current Rival action, and cannot-shoot warning', () => {
    let session = toPhase(game('SILA_OGNIA', 'SKANOWANIE_SYGNALU'), 'MOVEMENT')
    session = startMissionAction(session, {
      id: 'scan', playerId: 'p-a', unitId: 'infantry', type: 'SCAN_SIGNAL', name: 'Scanning Signal',
      locationType: 'BATTLEFIELD_CENTRE', linkedSecondaryCardId: 'SKANOWANIE_SYGNALU', unknownConditionsConfirmed: true,
    })
    session = advanceCauldronPhase(session)
    const context = buildBattleContext({ session })
    const firepower = source(context, 'SECONDARY').find((item) => item.relatedSecondaryId === 'SILA_OGNIA')
    expect(firepower?.actions[0]).toMatchObject({ type: 'OPEN_RIVAL_ARMY', playerId: 'p-b' })
    expect(source(context, 'MISSION_ACTION')[0].shortDescription).toMatch(/Cannot Shoot/)
  })

  it('shows cannot-charge in Charge and Walka w Zwarciu in Fight', () => {
    let charge = toPhase(game('WALKA_W_ZWARCIU', 'SKANOWANIE_SYGNALU'), 'MOVEMENT')
    charge = startMissionAction(charge, {
      id: 'scan', playerId: 'p-a', unitId: 'infantry', type: 'SCAN_SIGNAL', name: 'Scanning Signal',
      locationType: 'BATTLEFIELD_CENTRE', linkedSecondaryCardId: 'SKANOWANIE_SYGNALU', unknownConditionsConfirmed: true,
    })
    charge = advanceCauldronPhase(advanceCauldronPhase(charge))
    expect(source(buildBattleContext({ session: charge }), 'MISSION_ACTION')[0].shortDescription).toMatch(/Cannot declare a charge/)
    const fight = advanceCauldronPhase(charge)
    expect(source(buildBattleContext({ session: fight }), 'SECONDARY').some((item) => item.relatedSecondaryId === 'WALKA_W_ZWARCIU')).toBe(true)
  })

  it('only emits known phases', () => {
    expect(phases).toContain(buildBattleContext({ session: game('SILA_OGNIA') }).phase)
  })
})

describe('Context Engine cross-system progress', () => {
  it('updates Presja Taktyczna and Ziemia Niczyja immediately after objective control changes', () => {
    let session = toPhase(game('PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA'), 'MOVEMENT')
    let context = buildBattleContext({ session })
    expect(source(context, 'SECONDARY').find((item) => item.relatedSecondaryId === 'ZIEMIA_NICZYJA')?.shortDescription).toContain('0 / 2')
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' } })
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'N2', controllerPlayerId: 'p-a' } })
    context = buildBattleContext({ session })
    expect(source(context, 'SECONDARY').find((item) => item.relatedSecondaryId === 'ZIEMIA_NICZYJA')?.shortDescription).toContain('2 / 2')
    expect(source(context, 'SECONDARY').find((item) => item.relatedSecondaryId === 'PRESJA_TAKTYCZNA')?.shortDescription).toContain('You 2; Rival 0')
  })

  it('derives current-phase Stratagems, excludes unrelated phases, and labels manual timing', () => {
    const session = toPhase(game('SILA_OGNIA'), 'SHOOTING')
    const rulesData = rules([
      { definition: definition({ id: 'shoot', name: 'Shooting option', phases: ['SHOOTING'] }) },
      { definition: definition({ id: 'move', name: 'Movement option', phases: ['MOVEMENT'] }) },
      { definition: definition({ id: 'manual', name: 'Manual option', phases: ['SHOOTING'], triggers: ['CUSTOM_CONFIRMATION'] }), manual: true },
    ])
    const context = buildBattleContext({ session, rulesDataByPlayer: rulesData })
    expect(context.relevantStratagems.map((option) => option.definition.id)).toEqual(['shoot', 'manual'])
    expect(source(context, 'STRATAGEM')[0].shortDescription).toMatch(/requires player confirmation/i)
    expect(context.blockingItems.some((item) => item.source === 'STRATAGEM')).toBe(false)
  })
})

describe('Context Engine reactions and blockers', () => {
  it('keeps a zero-reaction status compact and non-blocking', () => {
    const context = buildBattleContext({ session: toPhase(game('SILA_OGNIA'), 'SHOOTING') })
    expect(context.reactions[0].title).toBe('No reactions available')
    expect(context.reactions[0].status).toBe('INFO')
    expect(context.blockingItems).toHaveLength(0)
  })

  it('marks a Guided hard reaction window as blocking and exposes Pass', () => {
    let session = toPhase(game('SILA_OGNIA'), 'SHOOTING')
    const reaction = definition({
      id: 'return-fire', name: 'Return Fire', phases: ['SHOOTING'], triggers: ['CUSTOM_CONFIRMATION'], reaction: true,
    })
    session = requestReactionHold(session, 'p-b', {
      trigger: 'CUSTOM_CONFIRMATION',
      definitionsByPlayer: { 'p-a': [], 'p-b': [reaction], 'p-c': [] },
      timestamp: '2026-09-01T12:00:00.000Z',
    })
    const context = buildBattleContext({ session, rulesDataByPlayer: rules([{ definition: reaction, classification: 'REACTION', manual: true }], 'p-b') })
    expect(context.blockingItems.some((item) => item.source === 'REACTION')).toBe(true)
    expect(context.reactions[0].actions.some((item) => item.type === 'PASS_REACTION')).toBe(true)
  })

  it('blocks an unresolved elimination choice but not an optional Mission Action', () => {
    let session = toPhase(game('SILA_OGNIA', 'ZNISZCZ_KOLOSA'), 'SHOOTING')
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a' },
    })
    expect(buildBattleContext({ session }).blockingItems.some((item) => item.type === 'SECONDARY_DECISION')).toBe(true)

    const movement = toPhase(game('SKANOWANIE_SYGNALU', 'PRESJA_TAKTYCZNA'), 'MOVEMENT')
    const movementContext = buildBattleContext({ session: movement })
    expect(movementContext.availableActions.some((item) => item.type === 'START_MISSION_ACTION')).toBe(true)
    expect(movementContext.blockingItems).toHaveLength(0)
  })

  it('blocks required Cel Priorytetowy target selection', () => {
    const context = buildBattleContext({ session: game('CEL_PRIORYTETOWY', 'PRESJA_TAKTYCZNA') })
    const blocker = context.blockingItems.find((item) => item.relatedSecondaryId === 'CEL_PRIORYTETOWY')
    expect(blocker?.actions[0].type).toBe('SELECT_PRIORITY_TARGET')
  })

  it('aggregates completed Secondary, active Mission Action and incomplete review at End Turn', () => {
    let session = toPhase(game('SILA_OGNIA', 'SKANOWANIE_SYGNALU'), 'MOVEMENT')
    session = startMissionAction(session, {
      id: 'scan', playerId: 'p-a', unitId: 'infantry', type: 'SCAN_SIGNAL', name: 'Scanning Signal',
      locationType: 'BATTLEFIELD_CENTRE', linkedSecondaryCardId: 'SKANOWANIE_SYGNALU', unknownConditionsConfirmed: true,
    })
    session = advanceCauldronPhase(session)
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })
    session = toPhase(session, 'END_TURN')
    const context = buildBattleContext({ session })
    expect(context.automaticEvents.some((item) => item.title.includes('Siła Ognia'))).toBe(true)
    expect(source(context, 'MISSION_ACTION').some((item) => item.title.includes('Scanning Signal'))).toBe(true)
    expect(context.blockingItems.some((item) => item.type === 'END_TURN_REVIEW')).toBe(true)
    expect(source(context, 'SECONDARY').some((item) => item.relatedSecondaryId === 'SKANOWANIE_SYGNALU')).toBe(true)
  })
})
