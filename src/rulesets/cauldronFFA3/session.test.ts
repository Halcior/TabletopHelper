import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent, undoLastAction } from '../../domain/battle/engine'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { getCauldronRoundStartSnapshot, getCauldronTurnStartSnapshot } from './snapshots'
import { advanceCauldronPhase, createCauldronGame, isCauldronEndOfRound } from './session'
import { confirmCauldronEndRound } from './roundEnd'
import { evaluateEndTurnSecondaries } from './secondary211'
import { dispatchCauldronBattleEvent } from './secondary'
import { testArmy, testCauldronGame } from './cauldronTestUtils'

function toEndTurn(current: ReturnType<typeof testCauldronGame>) {
  let session = current
  while (session.state.phase !== 'END_TURN') session = advanceCauldronPhase(session)
  return session
}

function scoreActiveTurn(current: ReturnType<typeof testCauldronGame>) {
  const session = toEndTurn(current)
  return evaluateEndTurnSecondaries(session, session.state.activePlayerId)
}

function finishActiveTurn(current: ReturnType<typeof testCauldronGame>) {
  let session = scoreActiveTurn(current)
  if (isCauldronEndOfRound(session)) return confirmCauldronEndRound(session)
  return advanceCauldronPhase(session)
}

function finishRound(current: ReturnType<typeof testCauldronGame>) {
  let session = current
  const round = session.state.round
  while (session.state.round === round) session = finishActiveTurn(session)
  return session
}

describe('Cauldron session integration', () => {
  it('keeps the pre-battle turn positions fixed while storing independent player army states', () => {
    const army = testArmy('shared-army')
    const session = createCauldronGame({
      armies: [army],
      guidanceLevel: 'guided',
      players: [
        { id: 'p-a', name: 'Alpha', armyId: army.id, deploymentZone: 'A', turnPosition: 3, operationalPlanId: 'WYNISZCZENIE' },
        { id: 'p-b', name: 'Bravo', armyId: army.id, deploymentZone: 'B', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE' },
        { id: 'p-c', name: 'Charlie', armyId: army.id, deploymentZone: 'C', turnPosition: 2, operationalPlanId: 'WYNISZCZENIE' },
      ],
    })
    expect(Object.keys(session.setup.armies)).toHaveLength(1)
    expect(session.state.turnOrder).toEqual(['p-b', 'p-c', 'p-a'])
    expect(session.state.players['p-a'].units.infantry).not.toBe(session.state.players['p-b'].units.infantry)
    expect(session.state.activePlayerId).toBe('p-b')
  })

  it('commits Round 1 as zero, starts Round 2 with the same order and rotated Rivals, and remains undoable', () => {
    let session = testCauldronGame()
    expect(getCauldronRoundStartSnapshot(session, 1)?.rivalPlayerIds).toEqual({
      'p-a': 'p-b', 'p-b': 'p-c', 'p-c': 'p-a',
    })
    expect(getCauldronTurnStartSnapshot(session, 'p-a', 1)?.objectiveStates.N1.controllerPlayerId).toBeNull()

    session = finishRound(session)
    expect(session.state.round).toBe(2)
    expect(session.state.turnOrder).toEqual(['p-a', 'p-b', 'p-c'])
    expect(session.state.activePlayerId).toBe('p-a')
    expect(session.state.players['p-a'].score.primary).toBe(0)
    expect(getCurrentRivalPlayerId(session, 'p-a')).toBe('p-c')
    expect(getCauldronRoundStartSnapshot(session, 2)?.rivalPlayerIds).toEqual({
      'p-a': 'p-c', 'p-b': 'p-a', 'p-c': 'p-b',
    })

    session = undoLastAction(session)
    expect(session.state.round).toBe(1)
    expect(session.state.phase).toBe('END_TURN')
    expect(session.state.activePlayerId).toBe('p-c')
  })

  it('locks player 1 Primary after their own turn even if later players change the objectives', () => {
    let session = finishRound(testCauldronGame())
    for (const objectiveId of ['N1', 'A-HOME']) {
      session = dispatchBattleEvent(session, {
        type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: 'p-a' },
      })
    }
    session = scoreActiveTurn(session)
    expect(session.state.players['p-a'].score.primary).toBe(10)
    session = advanceCauldronPhase(session)

    for (const objectiveId of ['N1', 'A-HOME']) {
      session = dispatchBattleEvent(session, {
        type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: 'p-b' },
      })
    }
    expect(session.state.players['p-a'].score.primary).toBe(10)
  })

  it('defers Wyniszczenie until the third player finishes the Battle Round', () => {
    let session = finishRound(testCauldronGame())
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-c', unitId: 'tank', destroyedByPlayerId: 'p-a' },
    })
    session = scoreActiveTurn(session)
    expect(session.state.players['p-a'].score.primary).toBe(0)
    session = advanceCauldronPhase(session)
    session = finishActiveTurn(session)

    session = scoreActiveTurn(session)
    expect(isCauldronEndOfRound(session)).toBe(true)
    expect(session.state.players['p-a'].score.primary).toBe(0)
    session = confirmCauldronEndRound(session)
    expect(session.state.players['p-a'].score.primary).toBe(5)
    expect(session.state.round).toBe(3)
  })
})
