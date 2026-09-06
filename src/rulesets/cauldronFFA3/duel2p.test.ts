import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../../domain/battle/engine'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { confirmCauldronEndRound } from './roundEnd'
import { createCauldronGame } from './session'
import { getCauldronConfig } from './sessionConfig'
import { testArmy } from './cauldronTestUtils'
import { evaluateEndTurnSecondaries } from './secondary211'

function duel() {
  const armies = [testArmy('army-a'), testArmy('army-b')]
  return createCauldronGame({
    gameId: 'cauldron-duel-test',
    createdAt: '2026-09-06T18:30:00.000Z',
    guidanceLevel: 'guided',
    armies,
    players: [
      { id: 'p-a', name: 'Alpha', armyId: armies[0].id, deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE' },
      { id: 'p-b', name: 'Bravo', armyId: armies[1].id, deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'WYNISZCZENIE' },
    ],
  })
}

function toEndTurn(session: ReturnType<typeof duel>) {
  let current = session
  const phases = ['MOVEMENT', 'SHOOTING', 'CHARGE', 'FIGHT', 'END_TURN'] as const
  for (const phase of phases) {
    current = dispatchBattleEvent(current, { type: 'PHASE_CHANGED', payload: { phase } }, { actorPlayerId: current.state.activePlayerId })
  }
  return current
}

describe('Cauldron Duel 2P', () => {
  it('creates two seats, A/B homes, and keeps the other player as Rival every round', () => {
    const session = duel()
    const config = getCauldronConfig(session)
    expect(session.state.turnOrder).toEqual(['p-a', 'p-b'])
    expect(Object.keys(session.state.players)).toHaveLength(2)
    expect(Object.keys(session.state.objectives)).toEqual(['A-HOME', 'B-HOME', 'N1', 'N2', 'N3'])
    expect(config.mode).toBe('duel')
    expect(config.playerCount).toBe(2)
    expect(getCurrentRivalPlayerId(session, 'p-a', 1)).toBe('p-b')
    expect(getCurrentRivalPlayerId(session, 'p-a', 2)).toBe('p-b')
    expect(getCurrentRivalPlayerId(session, 'p-b', 5)).toBe('p-a')
  })

  it('resolves a Battle Round after two committed player turns', () => {
    let session = toEndTurn(duel())
    session = evaluateEndTurnSecondaries(session, 'p-a')
    session = dispatchBattleEvent(session, { type: 'TURN_ENDED', payload: { playerId: 'p-a' } }, { actorPlayerId: 'p-a' })
    session = dispatchBattleEvent(session, { type: 'TURN_STARTED', payload: { playerId: 'p-b' } }, { actorPlayerId: 'p-a' })
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'COMMAND' } }, { actorPlayerId: 'p-a' })
    session = toEndTurn(session)
    session = evaluateEndTurnSecondaries(session, 'p-b')
    expect(() => confirmCauldronEndRound(session)).not.toThrow()
  })
})
