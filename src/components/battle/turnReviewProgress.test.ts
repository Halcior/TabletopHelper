import { describe, expect, it } from 'vitest'
import { dispatchBattleEvents } from '../../domain/battle/engine'
import { testArmy } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { reviewDuelPrimary } from '../../rulesets/cauldronFFA3/duelPrimary'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { getDuelPrimaryReviewWindow, getPendingEndTurnScoring } from './turnReviewProgress'

function punishmentDuel() {
  return createCauldronGame({
    gameId: 'punishment-end-turn',
    guidanceLevel: 'fast',
    primaryDeck: 'chapter-approved-duel',
    secondaryDeck: 'chapter-approved',
    mode: 'duel',
    armies: [testArmy('army-a'), testArmy('army-b')],
    players: [
      { id: 'p-a', name: 'Alpha', armyId: 'army-a', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE', forceDisposition: 'purge-the-foe' },
      { id: 'p-b', name: 'Bravo', armyId: 'army-b', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'WYNISZCZENIE', forceDisposition: 'disruption' },
    ],
  })
}

describe('end-turn scoring navigation', () => {
  it('keeps final Punishment reachable when both commanders have confirmed their own turns', () => {
    let session = dispatchBattleEvents(punishmentDuel(), [
      { type: 'ROUND_STARTED', payload: { round: 5 } },
      { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } },
    ])
    session = reviewDuelPrimary(session, 'p-a', 'turn', {})
    session = dispatchBattleEvents(session, [
      { type: 'TURN_STARTED', payload: { playerId: 'p-b' } },
      { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } },
    ])
    session = reviewDuelPrimary(session, 'p-b', 'turn', {})

    expect(getPendingEndTurnScoring(session).primary).toEqual(['p-a'])
    expect(getDuelPrimaryReviewWindow(session, 'p-a')).toBe('turn')
    expect(getDuelPrimaryReviewWindow(session, 'p-b')).toBe('turn')

    session = reviewDuelPrimary(session, 'p-a', 'turn', { condemned: 1 })
    expect(getPendingEndTurnScoring(session).primary).toEqual([])
    expect(getDuelPrimaryReviewWindow(session, 'p-a')).toBe('battle')
    expect(getDuelPrimaryReviewWindow(session, 'p-b')).toBe('battle')
  })

  it('does not show end-turn tasks outside of end turn', () => {
    const session = dispatchBattleEvents(punishmentDuel(), [{ type: 'ROUND_STARTED', payload: { round: 2 } }])
    expect(getPendingEndTurnScoring(session)).toEqual({ primary: [], secondary: [], missionActions: [], eliminationChoice: false })
    expect(getDuelPrimaryReviewWindow(session, 'p-a')).toBe('command')
    expect(getDuelPrimaryReviewWindow(session, 'p-b')).toBeUndefined()
  })
})
