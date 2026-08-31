import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent, undoLastAction } from '../../domain/battle/engine'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { getCauldronRoundStartSnapshot, getCauldronTurnStartSnapshot } from './snapshots'
import { advanceCauldronPhase, createCauldronGame, isCauldronEndOfRound } from './session'
import { confirmCauldronEndRound } from './roundEnd'
import { testArmy, testCauldronGame } from './cauldronTestUtils'

function advance(current: ReturnType<typeof testCauldronGame>, count: number) {
  let session = current
  for (let index = 0; index < count; index += 1) session = advanceCauldronPhase(session)
  return session
}

describe('Cauldron session integration', () => {
  it('stores three independent player army states while deduplicating definitions by army ID', () => {
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
    expect(session.setup.players.every((player) => Boolean(player.armyId))).toBe(true)
    expect(session.state.players['p-a'].units.infantry).not.toBe(session.state.players['p-b'].units.infantry)
    expect(session.state.activePlayerId).toBe('p-b')
    expect(getCurrentRivalPlayerId(session, 'p-b')).toBe('p-c')
  })

  it('captures immutable Round and Turn snapshots with Rival mapping automatically', () => {
    const session = testCauldronGame()
    expect(getCauldronRoundStartSnapshot(session, 1)?.rivalPlayerIds).toEqual({
      'p-a': 'p-b', 'p-b': 'p-c', 'p-c': 'p-a',
    })
    expect(getCauldronTurnStartSnapshot(session, 'p-a', 1)?.objectiveStates.N1.controllerPlayerId).toBeNull()
  })

  it('requires an end-round review, commits Round 1 as zero, and starts Round 2 with rotated Rivals', () => {
    let session = testCauldronGame()
    session = advance(session, 6)
    session = advance(session, 6)
    session = advance(session, 5)
    expect(isCauldronEndOfRound(session)).toBe(true)
    expect(() => advanceCauldronPhase(session)).toThrow(/review/i)

    session = confirmCauldronEndRound(session)
    expect(session.state.round).toBe(2)
    expect(session.state.activePlayerId).toBe('p-a')
    expect(session.state.players['p-a'].score.primary).toBe(0)
    expect(getCauldronRoundStartSnapshot(session, 2)?.rivalPlayerIds).toEqual({
      'p-a': 'p-c', 'p-b': 'p-a', 'p-c': 'p-b',
    })

    session = undoLastAction(session)
    expect(session.state.round).toBe(1)
    expect(session.state.phase).toBe('END_TURN')
    expect(session.state.activePlayerId).toBe('p-c')
  })

  it('commits calculated Primary automatically after the Round 2 review', () => {
    let session = testCauldronGame({ plans: ['SABOTAZ', 'WYNISZCZENIE', 'WYNISZCZENIE'] })
    session = advance(session, 6)
    session = advance(session, 6)
    session = advance(session, 5)
    session = confirmCauldronEndRound(session)
    for (const objectiveId of ['N1', 'A-HOME']) {
      session = dispatchBattleEvent(session, {
        type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: 'p-a' },
      })
    }
    session = advance(session, 6)
    session = advance(session, 6)
    session = advance(session, 5)
    session = confirmCauldronEndRound(session, { 'p-a': { sabotageMissionActionCompleted: true } })
    expect(session.state.players['p-a'].score.primary).toBe(15)
    expect(session.state.round).toBe(3)
  })
})
