import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent, dispatchBattleEvents } from '../../domain/battle/engine'
import { cauldronEvent } from './events'
import { testCauldronGame } from './cauldronTestUtils'
import { calculatePrimaryRound } from './primary'
import { captureTurnSnapshot } from './snapshots'

function roundTwo() {
  let session = dispatchBattleEvents(
    testCauldronGame({ plans: ['SABOTAZ', 'WYNISZCZENIE', 'WYNISZCZENIE'] }),
    [
      { type: 'ROUND_STARTED', payload: { round: 2 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
    ],
  )
  session = dispatchBattleEvent(session, cauldronEvent('TURN_SNAPSHOT_CAPTURED', captureTurnSnapshot(session, 'p-a', 2)))
  return session
}

function control(session: ReturnType<typeof roundTwo>, objectiveId: string) {
  return dispatchBattleEvent(session, {
    type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: 'p-a' },
  })
}

function withCompletedSabotage(session: ReturnType<typeof roundTwo>) {
  let next = dispatchBattleEvent(session, {
    type: 'MISSION_ACTION_STARTED',
    payload: { action: {
      id: 'sabotage-1', playerId: 'p-a', unitId: 'infantry', type: 'SABOTAGE', name: 'Sabotage',
      targetObjectiveId: 'N1', locationType: 'NEUTRAL_OBJECTIVE', startedRound: 2, startedTurn: 1, status: 'ACTIVE',
    } },
  })
  next = dispatchBattleEvent(next, { type: 'MISSION_ACTION_COMPLETED', payload: { actionId: 'sabotage-1', endedRound: 2, endedTurn: 1 } })
  return next
}

describe('Cauldron Primary', () => {
  it('awards no Primary in Battle Round 1', () => {
    let session = testCauldronGame({ plans: ['SABOTAZ', 'WYNISZCZENIE', 'WYNISZCZENIE'] })
    session = control(session as ReturnType<typeof roundTwo>, 'N1')
    session = control(session as ReturnType<typeof roundTwo>, 'A-HOME')
    expect(calculatePrimaryRound(session, 'p-a', 1).roundPrimary).toBe(0)
  })

  it('awards 5 for a neutral objective only', () => {
    const result = calculatePrimaryRound(control(roundTwo(), 'N1'), 'p-a', 2)
    expect(result.neutralObjective.vp).toBe(5)
    expect(result.twoObjectives.vp).toBe(0)
    expect(result.roundPrimary).toBe(5)
  })

  it('awards 10 for controlling two objectives including a neutral', () => {
    let session = control(roundTwo(), 'N1')
    session = control(session, 'A-HOME')
    const result = calculatePrimaryRound(session, 'p-a', 2)
    expect(result.neutralObjective.vp).toBe(5)
    expect(result.twoObjectives.vp).toBe(5)
    expect(result.roundPrimary).toBe(10)
  })

  it('awards 15 when both objective conditions and Sabotaż are complete', () => {
    let session = control(roundTwo(), 'N1')
    session = control(session, 'A-HOME')
    const result = calculatePrimaryRound(withCompletedSabotage(session), 'p-a', 2)
    expect(result.operationalPlan.vp).toBe(5)
    expect(result.roundPrimary).toBe(15)
  })

  it('caps total Primary at 45', () => {
    let session = control(roundTwo(), 'N1')
    session = control(session, 'A-HOME')
    session = dispatchBattleEvent(session, {
      type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 44 },
    })
    const result = calculatePrimaryRound(withCompletedSabotage(session), 'p-a', 2)
    expect(result.roundPrimary).toBe(1)
    expect(result.capped).toBe(true)
  })
})
