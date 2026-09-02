import { describe, expect, it } from 'vitest'
import { deserializeBattleSession, dispatchBattleEvent, serializeBattleSession, undoLastAction } from './engine'
import {
  completeMissionAction,
  getActiveMissionActionForUnit,
  getEligibleMissionActionUnits,
  getMissionActionEligibility,
  startMissionAction,
} from './missionActions'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { evaluateEndTurnSecondaries, getGameSecondaryVp } from '../../rulesets/cauldronFFA3/secondary'
import { CAULDRON_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/secondaryDefinitions'

function scanGame() {
  const first = ['SKANOWANIE_SYGNALU', 'PRESJA_TAKTYCZNA'] as const
  return testCauldronGame({
    secondaryDeckOrders: {
      'p-a': [...first, ...CAULDRON_SECONDARY_IDS.filter((id) => !first.includes(id as typeof first[number]))],
    },
  })
}

function movement() {
  return dispatchBattleEvent(scanGame(), { type: 'PHASE_CHANGED', payload: { phase: 'MOVEMENT' } })
}

function start() {
  return startMissionAction(movement(), {
    id: 'scan-1',
    playerId: 'p-a',
    unitId: 'infantry',
    type: 'SCAN_SIGNAL',
    name: 'Scanning Signal',
    locationType: 'BATTLEFIELD_CENTRE',
    linkedSecondaryCardId: 'SKANOWANIE_SYGNALU',
    unknownConditionsConfirmed: true,
  })
}

function endTurn(session = start()) {
  let current = session
  for (const phase of ['SHOOTING', 'CHARGE', 'FIGHT', 'END_TURN'] as const) {
    current = dispatchBattleEvent(current, { type: 'PHASE_CHANGED', payload: { phase } })
  }
  return current
}

describe('Mission Actions', () => {
  it('filters units using known state and requires one compact physical confirmation', () => {
    let session = movement()
    expect(getMissionActionEligibility(session, 'p-a', 'infantry')).toEqual(expect.objectContaining({
      eligible: true, requiresPhysicalConfirmation: true,
    }))
    expect(getEligibleMissionActionUnits(session, 'p-a').map((unit) => unit.unitName)).toContain('Four-model unit')
    expect(() => startMissionAction(session, {
      playerId: 'p-a', unitId: 'infantry', type: 'SCAN_SIGNAL', name: 'Scanning Signal', unknownConditionsConfirmed: false,
    })).toThrow(/confirm/i)
    session = dispatchBattleEvent(session, {
      type: 'UNIT_BATTLESHOCK_CHANGED', payload: { playerId: 'p-a', unitId: 'infantry', battleShocked: true },
    })
    expect(getMissionActionEligibility(session, 'p-a', 'infantry').eligible).toBe(false)
  })

  it('starts, persists, completes, links to a Secondary, and supports undo', () => {
    let session = start()
    expect(getActiveMissionActionForUnit(session, 'p-a', 'infantry')?.name).toBe('Scanning Signal')
    expect(undoLastAction(session).state.missionActions['scan-1']).toBeUndefined()
    session = deserializeBattleSession(serializeBattleSession(session))
    expect(session.state.missionActions['scan-1'].status).toBe('ACTIVE')
    session = endTurn(session)
    session = completeMissionAction(session, 'scan-1', true)
    expect(session.state.missionActions['scan-1'].status).toBe('COMPLETED')
    expect(undoLastAction(session).state.missionActions['scan-1'].status).toBe('ACTIVE')
    session = evaluateEndTurnSecondaries(session, 'p-a')
    expect(getGameSecondaryVp(session, 'p-a')).toBe(5)
    session = undoLastAction(session)
    expect(getGameSecondaryVp(session, 'p-a')).toBe(0)
  })

  it('fails when Battle-shocked, destroyed, or no longer in the required position', () => {
    let shocked = start()
    shocked = dispatchBattleEvent(shocked, {
      type: 'UNIT_BATTLESHOCK_CHANGED', payload: { playerId: 'p-a', unitId: 'infantry', battleShocked: true },
    })
    shocked = endTurn(shocked)
    shocked = completeMissionAction(shocked, 'scan-1', true)
    expect(shocked.state.missionActions['scan-1']).toEqual(expect.objectContaining({ status: 'FAILED', failureReason: expect.stringMatching(/Battle-shocked/i) }))

    let destroyed = start()
    destroyed = dispatchBattleEvent(destroyed, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-a', unitId: 'infantry', destroyedByPlayerId: 'p-b' },
    })
    destroyed = endTurn(destroyed)
    destroyed = completeMissionAction(destroyed, 'scan-1', true)
    expect(destroyed.state.missionActions['scan-1'].failureReason).toMatch(/destroyed/i)

    let moved = endTurn()
    moved = completeMissionAction(moved, 'scan-1', false)
    expect(moved.state.missionActions['scan-1'].failureReason).toMatch(/position/i)
  })

  it('completes Secure Data only when its neutral objective remains controlled', () => {
    const first = ['ZABEZPIECZ_DANE', 'PRESJA_TAKTYCZNA'] as const
    let session = testCauldronGame({
      secondaryDeckOrders: {
        'p-a': [...first, ...CAULDRON_SECONDARY_IDS.filter((id) => !first.includes(id as typeof first[number]))],
      },
    })
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'MOVEMENT' } })
    session = startMissionAction(session, {
      id: 'data-1', playerId: 'p-a', unitId: 'infantry', type: 'SECURE_DATA', name: 'Securing Data',
      targetObjectiveId: 'N1', locationType: 'NEUTRAL_OBJECTIVE', linkedSecondaryCardId: 'ZABEZPIECZ_DANE',
      unknownConditionsConfirmed: true,
    })
    session = endTurn(session)
    session = dispatchBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    })
    session = completeMissionAction(session, 'data-1', true)
    session = evaluateEndTurnSecondaries(session, 'p-a')
    expect(getGameSecondaryVp(session, 'p-a')).toBe(5)
  })

  it('starts Sabotage only on a neutral objective not controlled at turn start', () => {
    let session = movement()
    expect(() => startMissionAction(session, {
      playerId: 'p-a', unitId: 'infantry', type: 'SABOTAGE', name: 'Sabotage',
      targetObjectiveId: 'A-HOME', locationType: 'NEUTRAL_OBJECTIVE', unknownConditionsConfirmed: true,
    })).toThrow(/did not control|neutral objective/i)

    session = startMissionAction(session, {
      id: 'sabotage-1', playerId: 'p-a', unitId: 'infantry', type: 'SABOTAGE', name: 'Sabotage',
      targetObjectiveId: 'N1', locationType: 'NEUTRAL_OBJECTIVE', unknownConditionsConfirmed: true,
    })
    expect(session.state.missionActions['sabotage-1']).toEqual(expect.objectContaining({ type: 'SABOTAGE', targetObjectiveId: 'N1' }))
  })
})
