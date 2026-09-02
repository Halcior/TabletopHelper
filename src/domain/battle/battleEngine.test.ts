import { describe, expect, it } from 'vitest'
import type { Army, UnitDefinition } from '../army/types'
import {
  abandonBattle,
  advancePhase,
  completeBattle,
  createBattleSession,
  deserializeBattleSession,
  dispatchBattleEvent,
  redoLastAction,
  serializeBattleSession,
  undoLastAction,
} from './engine'
import { totalScore } from './selectors'
import type { BattleSession } from './types'

function unit(overrides: Partial<UnitDefinition> & Pick<UnitDefinition, 'id' | 'name'>): UnitDefinition {
  return {
    id: overrides.id,
    name: overrides.name,
    points: overrides.points ?? 100,
    startingModels: overrides.startingModels ?? 1,
    modelGroups: overrides.modelGroups ?? [],
    stats: overrides.stats,
    categories: overrides.categories ?? [],
    keywords: overrides.keywords ?? [],
    rangedWeapons: overrides.rangedWeapons ?? [],
    meleeWeapons: overrides.meleeWeapons ?? [],
    abilities: overrides.abilities ?? [],
    enhancements: overrides.enhancements ?? [],
    wargear: overrides.wargear ?? [],
    isWarlord: overrides.isWarlord ?? false,
    leaderOfUnitId: overrides.leaderOfUnitId ?? null,
    ledByUnitIds: overrides.ledByUnitIds ?? [],
  }
}

const army: Army = {
  id: 'army-1',
  name: 'Test Army',
  faction: 'Test Faction',
  totalPoints: 300,
  detachments: [],
  units: [
    unit({ id: 'infantry', name: 'Infantry', startingModels: 4, stats: { wounds: 3, objectiveControl: 2 } }),
    unit({ id: 'tank', name: 'Tank', startingModels: 1, points: 200, stats: { wounds: 14, objectiveControl: 4 } }),
  ],
}

function session(maxRounds = 5): BattleSession {
  return createBattleSession({
    gameId: 'game-1',
    rulesetId: 'generic',
    createdAt: '2026-08-31T10:00:00.000Z',
    maxRounds,
    armies: [army],
    players: [
      { id: 'p1', name: 'Alpha', armyId: army.id },
      { id: 'p2', name: 'Bravo' },
      { id: 'p3', name: 'Charlie' },
    ],
    objectives: [{ id: 'n1', name: 'N1', type: 'neutral' }],
  })
}

function finishCurrentTurn(current: BattleSession): BattleSession {
  let next = current
  for (let index = 0; index < 6; index += 1) next = advancePhase(next)
  return next
}

describe('generic battle engine', () => {
  it('creates independent unit state and automatic round/turn snapshots', () => {
    const current = session()
    expect(current.state.round).toBe(1)
    expect(current.state.activePlayerId).toBe('p1')
    expect(current.state.phase).toBe('COMMAND')
    expect(current.state.players.p1.units.infantry.modelsAlive).toBe(4)
    expect(current.state.players.p1.units.tank.woundsRemaining).toBe(14)
    expect(current.state.snapshots.roundStart).toHaveLength(1)
    expect(current.state.snapshots.turnStart).toHaveLength(1)
    expect(current.state.events.map((event) => event.type)).toEqual([
      'GAME_STARTED',
      'ROUND_STARTED',
      'TURN_STARTED',
    ])
  })

  it('advances phases, players, rounds, and completes after the configured final round', () => {
    let current = session(2)
    expect(advancePhase(current).state.phase).toBe('MOVEMENT')

    current = finishCurrentTurn(current)
    expect(current.state.activePlayerId).toBe('p2')
    expect(current.state.phase).toBe('COMMAND')
    current = finishCurrentTurn(current)
    current = finishCurrentTurn(current)
    expect(current.state.round).toBe(2)
    expect(current.state.activePlayerId).toBe('p1')
    expect(current.state.snapshots.roundStart).toHaveLength(2)

    current = finishCurrentTurn(current)
    current = finishCurrentTurn(current)
    current = finishCurrentTurn(current)
    expect(current.state.status).toBe('completed')
    expect(current.state.round).toBe(2)
    expect(current.state.events.at(-1)?.type).toBe('GAME_ENDED')
  })

  it('records CP and scoring as events and groups generated transitions into one undoable action', () => {
    let current = session()
    current = dispatchBattleEvent(current, { type: 'CP_GAINED', payload: { playerId: 'p1', amount: 1 } })
    current = dispatchBattleEvent(current, {
      type: 'SCORE_ADJUSTED',
      payload: { playerId: 'p1', category: 'secondary', delta: 5 },
    })
    expect(current.state.players.p1.cp).toBe(1)
    expect(totalScore(current.state.players.p1)).toBe(5)

    current = undoLastAction(current)
    expect(totalScore(current.state.players.p1)).toBe(0)
    current = redoLastAction(current)
    expect(totalScore(current.state.players.p1)).toBe(5)

    for (let index = 0; index < 5; index += 1) current = advancePhase(current)
    expect(current.state.phase).toBe('END_TURN')
    current = advancePhase(current)
    expect(current.state.activePlayerId).toBe('p2')
    expect(current.state.events.at(-2)?.type).toBe('TURN_ENDED')
    expect(current.state.events.at(-1)?.type).toBe('TURN_STARTED')

    current = undoLastAction(current)
    expect(current.state.activePlayerId).toBe('p1')
    expect(current.state.phase).toBe('END_TURN')
    current = redoLastAction(current)
    expect(current.state.activePlayerId).toBe('p2')
    expect(current.state.phase).toBe('COMMAND')
  })

  it('tracks model losses, restoration, wounds, destruction source, and undo', () => {
    let current = session()
    current = dispatchBattleEvent(current, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p1', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p2' },
    })
    expect(current.state.players.p1.units.infantry.modelsAlive).toBe(2)
    expect(current.state.events.at(-1)?.type).toBe('UNIT_MODEL_DESTROYED')

    current = dispatchBattleEvent(current, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p1', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p2' },
    })
    expect(current.state.players.p1.units.infantry.destroyed).toBe(true)
    current = dispatchBattleEvent(current, {
      type: 'UNIT_MODEL_RESTORED', payload: { playerId: 'p1', unitId: 'infantry', amount: 1 },
    })
    expect(current.state.players.p1.units.infantry.modelsAlive).toBe(1)
    expect(current.state.players.p1.units.infantry.destroyed).toBe(false)
    current = undoLastAction(current)
    expect(current.state.players.p1.units.infantry.destroyed).toBe(true)

    current = dispatchBattleEvent(current, {
      type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p1', unitId: 'tank', woundsRemaining: 7 },
    })
    expect(current.state.players.p1.units.tank.woundsRemaining).toBe(7)
    current = dispatchBattleEvent(current, {
      type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p1', unitId: 'tank', woundsRemaining: 0 },
    })
    expect(current.state.players.p1.units.tank.destroyed).toBe(true)
    expect(current.state.players.p1.units.tank.modelsAlive).toBe(0)
  })

  it('calculates objective control from OC, makes ties uncontrolled, and snapshots later turns', () => {
    let current = session()
    current = dispatchBattleEvent(current, {
      type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'n1', playerId: 'p1', oc: 5 },
    })
    expect(current.state.objectives.n1.controllerPlayerId).toBe('p1')
    current = dispatchBattleEvent(current, {
      type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'n1', playerId: 'p2', oc: 5 },
    })
    expect(current.state.objectives.n1.controllerPlayerId).toBeNull()
    current = dispatchBattleEvent(current, {
      type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'n1', playerId: 'p2', oc: 4 },
    })
    expect(current.state.objectives.n1.controllerPlayerId).toBe('p1')

    current = finishCurrentTurn(current)
    expect(current.state.snapshots.turnStart.at(-1)).toEqual(expect.objectContaining({
      playerId: 'p2',
      objectiveControllers: { n1: 'p1' },
    }))
  })

  it('round-trips a persisted battle session and rejects invalid serialized data', () => {
    let current = session()
    current = dispatchBattleEvent(current, { type: 'CP_GAINED', payload: { playerId: 'p1', amount: 2 } })
    const restored = deserializeBattleSession(serializeBattleSession(current))
    expect(restored).toEqual(current)
    expect(() => deserializeBattleSession('{"unexpected":true}')).toThrow()
  })

  it('explicitly completes a battle, preserves scoring, blocks gameplay changes, and supports undo', () => {
    let current = session()
    current = dispatchBattleEvent(current, {
      type: 'SCORE_ADJUSTED',
      payload: { playerId: 'p1', category: 'primary', delta: 10 },
    })
    current = completeBattle(current, '2026-08-31T11:00:00.000Z')

    expect(current.state.status).toBe('completed')
    expect(totalScore(current.state.players.p1)).toBe(10)
    expect(current.state.events.at(-1)?.type).toBe('GAME_ENDED')
    expect(advancePhase(current)).toBe(current)
    expect(() => dispatchBattleEvent(current, {
      type: 'CP_GAINED', payload: { playerId: 'p1', amount: 1 },
    })).toThrow(/completed/)

    current = undoLastAction(current)
    expect(current.state.status).toBe('active')
    expect(totalScore(current.state.players.p1)).toBe(10)
    current = redoLastAction(current)
    expect(current.state.status).toBe('completed')
  })

  it('abandons a battle without deleting progress and keeps that lifecycle through persistence', () => {
    let current = session()
    current = dispatchBattleEvent(current, {
      type: 'SCORE_ADJUSTED',
      payload: { playerId: 'p1', category: 'secondary', delta: 4 },
    })
    current = abandonBattle(current, '2026-08-31T11:05:00.000Z')

    expect(current.state.status).toBe('abandoned')
    expect(totalScore(current.state.players.p1)).toBe(4)
    expect(current.state.events.at(-1)?.type).toBe('GAME_ABANDONED')
    expect(() => dispatchBattleEvent(current, {
      type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'n1', controllerPlayerId: 'p1' },
    })).toThrow(/abandoned/)

    const restored = deserializeBattleSession(serializeBattleSession(current))
    expect(restored.state.status).toBe('abandoned')
    expect(totalScore(restored.state.players.p1)).toBe(4)
  })
})
