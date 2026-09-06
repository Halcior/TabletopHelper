import { describe, expect, it } from 'vitest'
import type { Army, UnitDefinition } from '../../domain/army/types'
import { advancePhase } from '../../domain/battle/engine'
import { createDuelGame, getDuelOpponentPlayerId } from './session'
import { DUEL_RULESET_ID } from './constants'

function unit(id: string): UnitDefinition {
  return {
    id,
    name: id,
    points: 100,
    startingModels: 1,
    modelGroups: [],
    stats: { wounds: 5, objectiveControl: 2 },
    categories: [],
    keywords: [],
    rangedWeapons: [],
    meleeWeapons: [],
    abilities: [],
    enhancements: [],
    wargear: [],
    isWarlord: false,
    leaderOfUnitId: null,
    ledByUnitIds: [],
  }
}

function army(id: string): Army {
  return {
    id,
    name: `${id} roster`,
    faction: id,
    totalPoints: 100,
    detachments: [],
    units: [unit(`${id}-unit`)],
  }
}

function game() {
  const armies = [army('army-a'), army('army-b')]
  return createDuelGame({
    gameId: 'duel-test',
    createdAt: '2026-09-06T15:00:00.000Z',
    guidanceLevel: 'guided',
    objectiveCount: 6,
    armies,
    players: [
      { id: 'p-a', name: 'Alpha', armyId: 'army-a', turnPosition: 2 },
      { id: 'p-b', name: 'Bravo', armyId: 'army-b', turnPosition: 1 },
    ],
  })
}

describe('Duel 1v1 ruleset', () => {
  it('creates exactly two independent player seats in the selected fixed order', () => {
    const session = game()
    expect(session.setup.rulesetId).toBe(DUEL_RULESET_ID)
    expect(session.state.turnOrder).toEqual(['p-b', 'p-a'])
    expect(session.state.activePlayerId).toBe('p-b')
    expect(Object.keys(session.state.players)).toHaveLength(2)
    expect(Object.keys(session.state.objectives)).toHaveLength(6)
    expect(getDuelOpponentPlayerId(session, 'p-b')).toBe('p-a')
  })

  it('advances to player two and starts the next round after two complete turns', () => {
    let session = game()
    for (let phase = 0; phase < 6; phase += 1) session = advancePhase(session)
    expect(session.state.activePlayerId).toBe('p-a')
    expect(session.state.round).toBe(1)
    for (let phase = 0; phase < 6; phase += 1) session = advancePhase(session)
    expect(session.state.activePlayerId).toBe('p-b')
    expect(session.state.round).toBe(2)
  })

  it('rejects three-player or duplicate-turn-position Duel setup', () => {
    const armies = [army('army-a'), army('army-b')]
    expect(() => createDuelGame({
      armies,
      guidanceLevel: 'fast',
      players: [
        { id: 'p-a', name: 'Alpha', armyId: 'army-a', turnPosition: 1 },
        { id: 'p-b', name: 'Bravo', armyId: 'army-b', turnPosition: 1 },
      ],
    })).toThrow(/positions 1 and 2/i)
  })
})
