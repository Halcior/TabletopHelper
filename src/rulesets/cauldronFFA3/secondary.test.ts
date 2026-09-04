import { describe, expect, it } from 'vitest'
import {
  deserializeBattleSession,
  dispatchBattleEvent,
  dispatchBattleEvents,
  serializeBattleSession,
  undoLastAction,
} from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { cauldronEvent } from './events'
import { testArmy, testCauldronGame } from './cauldronTestUtils'
import { createCauldronGame } from './session'
import {
  CAULDRON_SECONDARY_DEFINITIONS,
  CAULDRON_SECONDARY_IDS,
} from './secondaryDefinitions'
import {
  choosePriorityTarget,
  createSecondaryRefillEvents,
  dispatchCauldronBattleEvent,
  discardSecondaryCards,
  evaluateEndTurnSecondaries,
  getGameSecondaryVp,
  getPendingEliminationChoice,
  getPriorityTargetCandidates,
  getRoundSecondaryVp,
  getSecondaryState,
  isMulliganAvailable,
  mulliganSecondary,
  resolveEliminationChoice,
  selectPriorityTargetCandidates,
} from './secondary'
import type { SecondaryId } from './secondaryTypes'

function deck(...first: SecondaryId[]): SecondaryId[] {
  return [...first, ...CAULDRON_SECONDARY_IDS.filter((id) => !first.includes(id))]
}

function game(...first: SecondaryId[]): BattleSession {
  return testCauldronGame({
    secondaryDeckOrders: { 'p-a': deck(...first), 'p-b': deck(), 'p-c': deck() },
  })
}

function toPhase(session: BattleSession, phase: 'MOVEMENT' | 'SHOOTING' | 'FIGHT' | 'END_TURN'): BattleSession {
  const order = ['COMMAND', 'MOVEMENT', 'SHOOTING', 'CHARGE', 'FIGHT', 'END_TURN']
  let current = session
  while (current.state.phase !== phase) {
    const next = order[order.indexOf(current.state.phase) + 1] as typeof phase
    current = dispatchBattleEvent(current, { type: 'PHASE_CHANGED', payload: { phase: next } })
  }
  return current
}

function control(session: BattleSession, objectiveId: string, playerId: string | null): BattleSession {
  return dispatchBattleEvent(session, {
    type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: playerId },
  })
}

function drawBehindEnemyLinesInRoundTwo(): BattleSession {
  let session = toPhase(game('SILA_OGNIA', 'PRESJA_TAKTYCZNA', 'ZA_LINIAMI_WROGA'), 'END_TURN')
  session = discardSecondaryCards(session, 'p-a', ['SILA_OGNIA'])
  session = dispatchBattleEvents(session, [
    { type: 'ROUND_STARTED', payload: { round: 2 } },
    { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
  ])
  session = dispatchBattleEvents(session, createSecondaryRefillEvents(session, 'p-a', 2, () => 0))
  return toPhase(session, 'END_TURN')
}

function priorityGameWithGamma(): BattleSession {
  const armies = [testArmy('army-a'), testArmy('army-b'), testArmy('army-c')]
  const scout = structuredClone(armies[1].units[0])
  scout.id = 'scout'
  scout.name = 'Scout'
  scout.points = 60
  armies[1].units.push(scout)
  return createCauldronGame({
    gameId: 'priority-gamma',
    createdAt: '2026-09-04T10:00:00.000Z',
    guidanceLevel: 'guided',
    armies,
    secondaryDeckOrders: { 'p-a': deck('CEL_PRIORYTETOWY', 'PRESJA_TAKTYCZNA') },
    players: [
      { id: 'p-a', name: 'Alpha', armyId: 'army-a', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE' },
      { id: 'p-b', name: 'Bravo', armyId: 'army-b', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'WYNISZCZENIE' },
      { id: 'p-c', name: 'Charlie', armyId: 'army-c', deploymentZone: 'C', turnPosition: 3, operationalPlanId: 'WYNISZCZENIE' },
    ],
  })
}

describe('Cauldron Secondary definitions and deck', () => {
  it('provides all 15 immutable cards with hotfix VP values', () => {
    expect(CAULDRON_SECONDARY_DEFINITIONS).toHaveLength(15)
    expect(Object.isFrozen(CAULDRON_SECONDARY_DEFINITIONS)).toBe(true)
    expect(Object.fromEntries(CAULDRON_SECONDARY_DEFINITIONS.map((card) => [card.id, card.vp]))).toEqual({
      SILA_OGNIA: 4,
      WALKA_W_ZWARCIU: 5,
      ZNISZCZ_KOLOSA: 5,
      ELIMINACJA_DOWODCY: 5,
      SZTURM_NA_POZYCJE: 5,
      ZIEMIA_NICZYJA: 5,
      DOMINACJA_CENTRUM: 5,
      ZA_LINIAMI_WROGA: 5,
      SZEROKI_FRONT: 5,
      ZABEZPIECZ_DANE: 5,
      SKANOWANIE_SYGNALU: 5,
      UTRZYMAJ_BAZE: 3,
      CEL_PRIORYTETOWY: 5,
      PRESJA_TAKTYCZNA: 4,
      ODCIECIE_ODWROTU: 5,
    })
  })

  it('starts every player with a private 15-card lifecycle and two active cards', () => {
    const session = game('SILA_OGNIA', 'PRESJA_TAKTYCZNA')
    const state = getSecondaryState(session)
    expect(state['p-a'].active.map((card) => card.cardId)).toEqual(['SILA_OGNIA', 'PRESJA_TAKTYCZNA'])
    expect(state['p-a'].deck).toHaveLength(13)
    expect(state['p-b'].active).toHaveLength(2)
    expect(state['p-c'].active).toHaveLength(2)
    expect(getSecondaryState(deserializeBattleSession(serializeBattleSession(session)))['p-a']).toEqual(state['p-a'])
  })

  it('allows one free mulligan per own turn and draws its immediate replacement', () => {
    let session = game('SILA_OGNIA', 'PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA')
    const original = getSecondaryState(session)['p-a']
    expect(isMulliganAvailable(session, 'p-a')).toBe(true)
    session = mulliganSecondary(session, 'p-a', 'SILA_OGNIA', () => 0)
    expect(getSecondaryState(session)['p-a'].active.map((card) => card.cardId)).toEqual(['PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA'])
    expect(isMulliganAvailable(session, 'p-a')).toBe(false)
    expect(() => mulliganSecondary(session, 'p-a', 'PRESJA_TAKTYCZNA')).toThrow(/already been used/i)
    const restored = getSecondaryState(undoLastAction(session))['p-a']
    expect(restored.active).toEqual(original.active)
    expect(restored.deck).toEqual(original.deck)
  })

  it('refills an incomplete hand back to two cards while the deck still has cards', () => {
    let session = toPhase(game('SILA_OGNIA', 'PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA'), 'END_TURN')
    session = discardSecondaryCards(session, 'p-a', ['SILA_OGNIA'])
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(1)
    session = dispatchBattleEvents(session, createSecondaryRefillEvents(session, 'p-a', 2, () => 0))
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(2)
  })

  it('stops drawing permanently when the deck is exhausted and never reshuffles incomplete cards', () => {
    let session = game('SILA_OGNIA', 'PRESJA_TAKTYCZNA')
    const state = getSecondaryState(session)['p-a']
    const events = state.deck.flatMap((cardId) => [
      cauldronEvent('SECONDARY_DRAWN', { playerId: 'p-a', cardId, round: 1, turn: 1 }),
      cauldronEvent('SECONDARY_DISCARDED', { playerId: 'p-a', cardId, round: 1, turn: 1, reason: 'exhaust test' }),
    ])
    session = dispatchBattleEvents(session, events)
    session = toPhase(session, 'END_TURN')
    session = discardSecondaryCards(session, 'p-a', ['SILA_OGNIA', 'PRESJA_TAKTYCZNA'])
    const refill = createSecondaryRefillEvents(session, 'p-a', 2, () => 0)
    expect(getSecondaryState(session)['p-a'].deck).toHaveLength(0)
    expect(refill.filter((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_DRAWN')).toHaveLength(0)
    expect(refill.some((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_DECK_SHUFFLED')).toBe(false)
  })

  it('automatically replaces Za Liniami Wroga and Utrzymaj Bazę in Battle Round 1 without using the mulligan', () => {
    const session = game('ZA_LINIAMI_WROGA', 'UTRZYMAJ_BAZE', 'SILA_OGNIA', 'PRESJA_TAKTYCZNA')
    const state = getSecondaryState(session)['p-a']
    expect(state.active.map((card) => card.cardId)).toEqual(['SILA_OGNIA', 'PRESJA_TAKTYCZNA'])
    expect(state.discarded.map((card) => card.cardId)).toEqual(expect.arrayContaining(['ZA_LINIAMI_WROGA', 'UTRZYMAJ_BAZE']))
    expect(isMulliganAvailable(session, 'p-a')).toBe(true)
  })

  it('immediately replaces invalid type-specific cards without consuming a mulligan', () => {
    const armies = [testArmy('army-a'), testArmy('army-b'), testArmy('army-c')]
    armies[1].units.forEach((unit) => { unit.categories = []; unit.keywords = [] })
    const session = createCauldronGame({
      gameId: 'invalid-card',
      createdAt: '2026-09-01T10:00:00.000Z',
      guidanceLevel: 'guided',
      armies,
      secondaryDeckOrders: { 'p-a': deck('ZNISZCZ_KOLOSA', 'SILA_OGNIA', 'PRESJA_TAKTYCZNA') },
      players: [
        { id: 'p-a', name: 'Alpha', armyId: 'army-a', deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE' },
        { id: 'p-b', name: 'Bravo', armyId: 'army-b', deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'WYNISZCZENIE' },
        { id: 'p-c', name: 'Charlie', armyId: 'army-c', deploymentZone: 'C', turnPosition: 3, operationalPlanId: 'WYNISZCZENIE' },
      ],
    })
    const state = getSecondaryState(session)['p-a']
    expect(state.active.map((card) => card.cardId)).toEqual(['SILA_OGNIA', 'PRESJA_TAKTYCZNA'])
    expect(state.discarded.map((card) => card.cardId)).toContain('ZNISZCZ_KOLOSA')
    expect(isMulliganAvailable(session, 'p-a')).toBe(true)
  })

  it('automatically replaces Szturm na Pozycję when the current Rival has no objective at draw time', () => {
    const session = game('SZTURM_NA_POZYCJE', 'SILA_OGNIA', 'PRESJA_TAKTYCZNA')
    const state = getSecondaryState(session)['p-a']
    expect(state.active.map((card) => card.cardId)).toEqual(['SILA_OGNIA', 'PRESJA_TAKTYCZNA'])
    expect(state.discarded.map((card) => card.cardId)).toContain('SZTURM_NA_POZYCJE')
  })
})

describe('Cauldron elimination Secondaries', () => {
  it('matches Shooting/unit traits and only the current Rival', () => {
    let session = toPhase(game('SILA_OGNIA', 'ZNISZCZ_KOLOSA'), 'SHOOTING')
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-c', unitId: 'tank', destroyedByPlayerId: 'p-a' },
    })
    expect(getSecondaryState(session)['p-a'].completed).toHaveLength(0)
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a' },
    })
    const choice = getPendingEliminationChoice(session, 'p-a')
    expect(choice?.options.map((option) => option.cardId)).toEqual(['SILA_OGNIA', 'ZNISZCZ_KOLOSA'])
    session = resolveEliminationChoice(session, 'p-a', 'ZNISZCZ_KOLOSA')
    expect(getGameSecondaryVp(session, 'p-a')).toBe(5)
    expect(getSecondaryState(session)['p-a'].active.map((card) => card.cardId)).toContain('SILA_OGNIA')
  })

  it('scores Walka w Zwarciu for 5 VP after a qualifying Fight kill', () => {
    let session = toPhase(game('WALKA_W_ZWARCIU', 'ZIEMIA_NICZYJA'), 'FIGHT')
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })
    const completed = getSecondaryState(session)['p-a'].completed.find((card) => card.cardId === 'WALKA_W_ZWARCIU')
    expect(completed?.pointsAwarded).toBe(5)
  })
})

describe('Cauldron end-turn evaluation and scoring caps', () => {
  it('scores objective Secondaries automatically from current objective control', () => {
    let session = game('ZIEMIA_NICZYJA', 'PRESJA_TAKTYCZNA')
    session = control(session, 'N1', 'p-a')
    session = control(session, 'N2', 'p-a')
    session = toPhase(session, 'END_TURN')
    session = evaluateEndTurnSecondaries(session, 'p-a')
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(9)
    expect(getSecondaryState(session)['p-a'].completed).toHaveLength(2)
  })

  it('scores Za Liniami Wroga for 3 VP with one unit and 5 VP with two or more', () => {
    let one = drawBehindEnemyLinesInRoundTwo()
    one = evaluateEndTurnSecondaries(one, 'p-a', { behindEnemyLinesUnitCount: 1 })
    expect(getRoundSecondaryVp(one, 'p-a', 2)).toBe(3)

    let two = drawBehindEnemyLinesInRoundTwo()
    two = evaluateEndTurnSecondaries(two, 'p-a', { behindEnemyLinesUnitCount: 2 })
    expect(getRoundSecondaryVp(two, 'p-a', 2)).toBe(5)
  })

  it('requires four sectors and three units outside deployment for Szeroki Front', () => {
    let session = toPhase(game('SZEROKI_FRONT', 'ODCIECIE_ODWROTU'), 'END_TURN')
    session = evaluateEndTurnSecondaries(session, 'p-a', {
      wideFrontFourSectors: true,
      wideFrontThreeOutsideDeployment: true,
      controlsClosestNeutralObjective: true,
      unitNearRivalDeployment: true,
    })
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(10)
  })

  it('enforces 10 VP per round and 45 VP per game while preserving a card breakdown', () => {
    let session = toPhase(game('PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA'), 'END_TURN')
    session = control(session, 'N1', 'p-a')
    session = control(session, 'N2', 'p-a')
    session = dispatchBattleEvents(session, [
      cauldronEvent('SECONDARY_COMPLETED', { playerId: 'p-a', cardId: 'PRESJA_TAKTYCZNA', round: 1, turn: 1, pointsAwarded: 9 }),
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'secondary', delta: 9 } },
    ])
    session = evaluateEndTurnSecondaries(session, 'p-a')
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(10)
    expect(getSecondaryState(session)['p-a'].scoreHistory.at(-1)?.pointsAwarded).toBe(1)

    let capped = toPhase(game('PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA'), 'END_TURN')
    capped = control(capped, 'N1', 'p-a')
    capped = control(capped, 'N2', 'p-a')
    capped = dispatchBattleEvents(capped, [
      cauldronEvent('SECONDARY_COMPLETED', { playerId: 'p-a', cardId: 'PRESJA_TAKTYCZNA', round: 0, turn: 0, pointsAwarded: 44 }),
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'secondary', delta: 44 } },
    ])
    capped = evaluateEndTurnSecondaries(capped, 'p-a')
    expect(getGameSecondaryVp(capped, 'p-a')).toBe(45)
    expect(capped.state.players['p-a'].score.secondary).toBe(45)
  })
})

describe('Cel Priorytetowy', () => {
  it('lets the marked Rival nominate three Alpha targets and scores 5 VP for destroying one', () => {
    let session = game('CEL_PRIORYTETOWY', 'PRESJA_TAKTYCZNA')
    const candidates = getPriorityTargetCandidates(session, 'p-a')
    expect(candidates.filter((unit) => unit.eligible)).toHaveLength(3)
    expect(() => selectPriorityTargetCandidates(session, 'p-a', ['tank', 'remainder'])).toThrow(/3 Alpha/i)
    session = selectPriorityTargetCandidates(session, 'p-a', ['infantry', 'tank', 'remainder'])
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a' },
    })
    const completed = getSecondaryState(session)['p-a'].completed.find((card) => card.cardId === 'CEL_PRIORYTETOWY')
    expect(completed?.pointsAwarded).toBe(5)
  })

  it('scores Gamma for 2 VP at the end of the same turn when no Alpha was destroyed', () => {
    let session = priorityGameWithGamma()
    session = selectPriorityTargetCandidates(session, 'p-a', ['infantry', 'tank', 'remainder'])
    session = choosePriorityTarget(session, 'p-a', 'scout')
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'scout', destroyedByPlayerId: 'p-a' },
    })
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(0)
    session = toPhase(session, 'END_TURN')
    session = evaluateEndTurnSecondaries(session, 'p-a')
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(2)
    expect(getSecondaryState(session)['p-a'].completed.find((card) => card.cardId === 'CEL_PRIORYTETOWY')?.pointsAwarded).toBe(2)
  })
})
