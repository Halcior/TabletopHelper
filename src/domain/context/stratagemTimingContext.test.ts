import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../battle/engine'
import type { BattleSession } from '../battle/types'
import type { StratagemDefinition } from '../stratagems/types'
import { advanceCauldronPhase } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { buildBattleContext } from './contextEngine'
import type { ContextRulesByPlayer } from './types'

function toShooting(session: BattleSession): BattleSession {
  let current = session
  while (current.state.phase !== 'SHOOTING') current = advanceCauldronPhase(current)
  return current
}

function definition(id: string, trigger: StratagemDefinition['triggers'][number], reaction = false): StratagemDefinition {
  return {
    id,
    kind: 'STRATAGEM',
    name: id,
    description: 'Structured test option.',
    ownerScope: reaction ? 'OPPONENT' : 'ACTIVE_PLAYER',
    phases: ['SHOOTING'],
    triggers: [trigger],
    reaction,
    source: 'test',
    cpCost: 0,
  }
}

function rules(playerId: string, records: StratagemDefinition[], classification: 'ACTIVE' | 'REACTION' = 'ACTIVE'): ContextRulesByPlayer {
  return {
    [playerId]: {
      stratagems: records.map((item) => ({
        definition: item,
        classification,
        manualConfirmationRequired: false,
        fullyAutomatedTiming: true,
      })),
    },
  }
}

describe('Context Engine exact timing checkpoints', () => {
  it('shows a PHASE_START Stratagem only while phase start is the latest provable timing', () => {
    let session = toShooting(testCauldronGame())
    const phaseStart = definition('phase-start-option', 'PHASE_START')

    expect(buildBattleContext({ session, rulesDataByPlayer: rules('p-a', [phaseStart]) }).relevantStratagems)
      .toHaveLength(1)

    session = dispatchBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    }, { actorPlayerId: 'p-a' })

    expect(buildBattleContext({ session, rulesDataByPlayer: rules('p-a', [phaseStart]) }).relevantStratagems)
      .toHaveLength(0)
  })

  it('switches exact availability to the latest recorded objective checkpoint', () => {
    let session = toShooting(testCauldronGame())
    const objective = definition('objective-option', 'OBJECTIVE_CONTROL_CHANGED')
    session = dispatchBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    }, { actorPlayerId: 'p-a' })

    const context = buildBattleContext({ session, rulesDataByPlayer: rules('p-a', [objective]) })
    expect(context.relevantStratagems[0]?.availability.canUse).toBe(true)
  })

  it('surfaces unit-destroyed timing immediately after the casualty is recorded', () => {
    let session = toShooting(testCauldronGame())
    const destroyed = definition('destroyed-option', 'UNIT_DESTROYED')
    session = dispatchBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    }, { actorPlayerId: 'p-b' })

    const context = buildBattleContext({ session, rulesDataByPlayer: rules('p-a', [destroyed]) })
    expect(context.relevantStratagems[0]?.availability.canUse).toBe(true)
  })

  it('counts exact opponent reactions only when their structured trigger matches the current checkpoint', () => {
    let session = toShooting(testCauldronGame())
    const reaction = definition('reaction-option', 'UNIT_DESTROYED', true)
    const rulesData = rules('p-b', [reaction], 'REACTION')

    expect(buildBattleContext({ session, rulesDataByPlayer: rulesData }).reactionPlayers
      .find((player) => player.playerId === 'p-b')?.exactCount).toBe(0)

    session = dispatchBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-a', unitId: 'infantry', destroyedByPlayerId: 'p-b' },
    }, { actorPlayerId: 'p-a' })

    expect(buildBattleContext({ session, rulesDataByPlayer: rulesData }).reactionPlayers
      .find((player) => player.playerId === 'p-b')?.exactCount).toBe(1)
  })
})
