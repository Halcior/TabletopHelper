import { describe, expect, it } from 'vitest'
import { testArmy } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { dispatchBattleEvent } from './engine'
import { doublesObjectiveController, doublesScorekeeperId, doublesTeamMembers } from './doubles'
import { officialBoardDefinition } from '../battlefield/layouts'
import { getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import { getDuelMission } from '../../rulesets/cauldronFFA3/duelPrimary'
import type { DoublesSetup } from './types'

const forces: DoublesSetup = {
  rulesVersion: 'GW-Doubles-1.1',
  forces: [
    { id: 'alpha', name: 'Alpha Force', memberPlayerIds: ['a', 'b'], captainPlayerId: 'a',
      forceDisposition: 'take-and-hold', forceType: 'convenience',
      warlord: { playerId: 'b', unitId: 'remainder' } },
    { id: 'bravo', name: 'Bravo Force', memberPlayerIds: ['c', 'd'], captainPlayerId: 'c',
      forceDisposition: 'purge-the-foe', forceType: 'convenience',
      warlord: { playerId: 'c', unitId: 'remainder' } },
  ],
}

function battle() {
  const armies = ['a', 'b', 'c', 'd'].map((id) => testArmy(`army-${id}`))
  return createCauldronGame({
    armies,
    mode: 'doubles2v2',
    doubles: forces,
    primaryDeck: 'chapter-approved-duel',
    secondaryDeck: 'chapter-approved',
    officialLayout: 2,
    guidanceLevel: 'fast',
    players: armies.map((army, index) => ({
      id: 'abcd'[index],
      name: `Commander ${index + 1}`,
      armyId: army.id,
      deploymentZone: index < 2 ? 'A' as const : 'B' as const,
      turnPosition: index < 2 ? 1 as const : 2 as const,
      operationalPlanId: 'WYNISZCZENIE' as const,
    })),
  })
}

describe('GW Doubles team foundation', () => {
  it('keeps four independent armies but exactly two team turns and two tactical decks', () => {
    const session = battle()
    expect(session.setup.players).toHaveLength(4)
    expect(Object.keys(session.state.players)).toHaveLength(4)
    expect(session.state.turnOrder).toEqual(['a', 'c'])
    expect(session.setup.doubles?.rulesVersion).toBe('GW-Doubles-1.1')
    expect(Object.keys(session.state.players.b.units)).toHaveLength(3)
    expect(doublesTeamMembers(session.setup, 'b')).toEqual(['a', 'b'])
    expect(doublesScorekeeperId(session.setup, 'b')).toBe('a')
    expect(getDuelMission(session, 'a').name).toBe('Immovable Object')
    expect(officialBoardDefinition(session.setup)?.variant).toBe('B')
    const secondaries = getSecondaryState(session)
    expect(secondaries.a.deck.length + secondaries.a.active.length).toBe(18)
    expect(secondaries.c.deck.length + secondaries.c.active.length).toBe(18)
    expect(secondaries.b.deck).toEqual([])
    expect(secondaries.d.deck).toEqual([])
  })

  it('routes both partners CP and VP to their one shared force score', () => {
    let session = battle()
    session = dispatchBattleEvent(session, { type: 'CP_GAINED', payload: { playerId: 'b', amount: 2 } })
    session = dispatchBattleEvent(session, { type: 'CP_SPENT', payload: { playerId: 'a', amount: 1 } })
    session = dispatchBattleEvent(session, { type: 'SCORE_ADJUSTED', payload: { playerId: 'b', category: 'primary', delta: 5 } })
    expect(session.state.players.a.cp).toBe(1)
    expect(session.state.players.b.cp).toBe(0)
    expect(session.state.players.a.score.primary).toBe(5)
    expect(session.state.players.b.score.primary).toBe(0)
  })

  it('sums both partner OC values and normalizes manual owner to the force', () => {
    let session = battle()
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'CENTER-1', playerId: 'b', oc: 3 } })
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'CENTER-1', playerId: 'c', oc: 2 } })
    expect(session.state.objectives['CENTER-1'].controllerPlayerId).toBe('a')
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'CENTER-1', playerId: 'd', oc: 1 } })
    expect(session.state.objectives['CENTER-1'].controllerPlayerId).toBeNull()
    session = dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'CENTER-1', controllerPlayerId: 'd' } })
    expect(session.state.objectives['CENTER-1'].controllerPlayerId).toBe('c')
    expect(doublesObjectiveController(session.setup, session.state.objectives['CENTER-1'].playerOC)).toBeNull()
  })

  it('rejects malformed team memberships instead of silently creating extra turns', () => {
    const invalid = structuredClone(forces)
    invalid.forces[1].memberPlayerIds = ['b', 'd']
    expect(() => createCauldronGame({
      mode: 'doubles2v2', doubles: invalid, armies: ['a','b','c','d'].map((id) => testArmy(`army-${id}`)),
      primaryDeck: 'chapter-approved-duel', secondaryDeck: 'chapter-approved', guidanceLevel: 'fast',
      players: ['a','b','c','d'].map((id, index) => ({
        id, name: id, armyId: `army-${id}`, deploymentZone: index < 2 ? 'A' as const : 'B' as const,
        turnPosition: index < 2 ? 1 as const : 2 as const, operationalPlanId: 'WYNISZCZENIE' as const,
      })),
    })).toThrow(/Doubles force|exactly one force/)
  })
})
