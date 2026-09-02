import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../../domain/battle/engine'
import { completeMissionAction, startMissionAction } from '../../domain/battle/missionActions'
import { cauldronEvent } from './events'
import {
  canChangeOperationalPlan,
  changeOperationalPlan,
  evaluateOperationalPlan,
  getOperationalPlanState,
} from './operationalPlans'
import { captureRoundSnapshot } from './snapshots'
import { testCauldronGame } from './cauldronTestUtils'

function beginRoundTwoWithSnapshot(session: ReturnType<typeof testCauldronGame>) {
  let next = dispatchBattleEvent(session, { type: 'ROUND_STARTED', payload: { round: 2 } })
  next = dispatchBattleEvent(next, cauldronEvent('ROUND_SNAPSHOT_CAPTURED', captureRoundSnapshot(next, 2)))
  return next
}

describe('Cauldron Operational Plans', () => {
  it('evaluates Decydujące Natarcie from the immutable Round Start snapshot', () => {
    let session = testCauldronGame({ plans: ['DECYDUJACE_NATARCIE', 'WYNISZCZENIE', 'WYNISZCZENIE'] })
    session = dispatchBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'N1', controllerPlayerId: 'p-c' },
    })
    session = beginRoundTwoWithSnapshot(session)
    session = dispatchBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    })
    expect(evaluateOperationalPlan(session, 'p-a', 2).status).toBe('COMPLETED')
  })

  it('evaluates Twierdza from HOME control and a retained neutral snapshot', () => {
    let session = testCauldronGame({ plans: ['TWIERDZA', 'WYNISZCZENIE', 'WYNISZCZENIE'] })
    for (const objectiveId of ['A-HOME', 'N1']) {
      session = dispatchBattleEvent(session, {
        type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: 'p-a' },
      })
    }
    session = beginRoundTwoWithSnapshot(session)
    expect(evaluateOperationalPlan(session, 'p-a', 2).status).toBe('COMPLETED')
    session = dispatchBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'A-HOME', controllerPlayerId: null },
    })
    expect(evaluateOperationalPlan(session, 'p-a', 2).status).toBe('INCOMPLETE')
  })

  it('asks only the required physical confirmations for Zwiad Operacyjny', () => {
    const session = testCauldronGame({ plans: ['ZWIAD_OPERACYJNY', 'WYNISZCZENIE', 'WYNISZCZENIE'] })
    expect(evaluateOperationalPlan(session, 'p-a').confirmation?.key).toBe('zwiadHasThreeSectors')
    expect(evaluateOperationalPlan(session, 'p-a', 1, { zwiadHasThreeSectors: false }).status).toBe('INCOMPLETE')
    expect(evaluateOperationalPlan(session, 'p-a', 1, { zwiadHasThreeSectors: true }).confirmation?.key)
      .toBe('zwiadHasTwoOutsideDeployment')
    expect(evaluateOperationalPlan(session, 'p-a', 1, {
      zwiadHasThreeSectors: true,
      zwiadHasTwoOutsideDeployment: true,
    }).status).toBe('COMPLETED')
  })

  it('scores Sabotaż automatically from a completed Mission Action', () => {
    let session = testCauldronGame({ plans: ['SABOTAZ', 'WYNISZCZENIE', 'WYNISZCZENIE'] })
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'MOVEMENT' } })
    session = startMissionAction(session, {
      id: 'sabotage-1', playerId: 'p-a', unitId: 'infantry', type: 'SABOTAGE', name: 'Sabotage',
      targetObjectiveId: 'N1', locationType: 'NEUTRAL_OBJECTIVE', unknownConditionsConfirmed: true,
    })
    for (const phase of ['SHOOTING', 'CHARGE', 'FIGHT', 'END_TURN'] as const) {
      session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase } })
    }
    session = completeMissionAction(session, 'sabotage-1', true)

    expect(evaluateOperationalPlan(session, 'p-a').status).toBe('COMPLETED')
  })

  it('spends 1 CP once and prevents the new Plan scoring in the change round', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 1 } })
    expect(canChangeOperationalPlan(session, 'p-a').available).toBe(true)
    session = changeOperationalPlan(session, 'p-a', 'SABOTAZ')
    expect(session.state.players['p-a'].cp).toBe(0)
    expect(getOperationalPlanState(session, 'p-a')).toEqual({ planId: 'SABOTAZ', changed: true, changedRound: 1 })
    expect(evaluateOperationalPlan(session, 'p-a', 1, { sabotageMissionActionCompleted: true }).status).toBe('INCOMPLETE')
    expect(canChangeOperationalPlan(session, 'p-a').available).toBe(false)
  })
})
