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
  CAULDRON_SECONDARY_BY_ID,
  CAULDRON_SECONDARY_DEFINITIONS,
  CAULDRON_SECONDARY_IDS,
} from './secondaryDefinitions'
import {
  choosePriorityTarget,
  createSecondaryRefillEvents,
  dispatchCauldronBattleEvent,
  discardSecondaryCards,
  evaluateEndTurnSecondaries,
  getActiveSecondaryViews,
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
  const order = deck(...first)
  return testCauldronGame({
    secondaryDeckOrders: { 'p-a': order, 'p-b': deck(), 'p-c': deck() },
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

describe('Cauldron Secondary definitions and deck', () => {
  it('provides all 15 immutable cards with exact VP values', () => {
    expect(CAULDRON_SECONDARY_DEFINITIONS).toHaveLength(15)
    expect(Object.isFrozen(CAULDRON_SECONDARY_DEFINITIONS)).toBe(true)
    expect(Object.fromEntries(CAULDRON_SECONDARY_DEFINITIONS.map((card) => [card.id, card.vp]))).toEqual({
      SILA_OGNIA: 4,
      WALKA_W_ZWARCIU: 4,
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
    expect(getSecondaryState(session)['p-a'].active.map((card) => card.cardId)).toEqual([
      'PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA',
    ])
    expect(isMulliganAvailable(session, 'p-a')).toBe(false)
    expect(() => mulliganSecondary(session, 'p-a', 'PRESJA_TAKTYCZNA')).toThrow(/already been used/i)
    const restored = getSecondaryState(undoLastAction(session))['p-a']
    expect(restored.active).toEqual(original.active)
    expect(restored.deck).toEqual(original.deck)
  })

  it('refills an incomplete Command-phase hand back to two cards', () => {
    let session = toPhase(game('SILA_OGNIA', 'PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA'), 'END_TURN')
    session = discardSecondaryCards(session, 'p-a', ['SILA_OGNIA'])
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(1)
    session = dispatchBattleEvents(session, createSecondaryRefillEvents(session, 'p-a', 2, () => 0))
    expect(getSecondaryState(session)['p-a'].active).toHaveLength(2)
  })

  it('reshuffles only incomplete discards and never completed cards', () => {
    let session = game('SILA_OGNIA', 'PRESJA_TAKTYCZNA')
    const state = getSecondaryState(session)['p-a']
    const round = session.state.round
    const turn = 1
    const events = state.deck.flatMap((cardId) => [
      cauldronEvent('SECONDARY_DRAWN', { playerId: 'p-a', cardId, round, turn }),
      cauldronEvent('SECONDARY_DISCARDED', { playerId: 'p-a', cardId, round, turn, reason: 'test' }),
    ])
    session = dispatchBattleEvents(session, events)
    session = toPhase(session, 'END_TURN')
    session = discardSecondaryCards(session, 'p-a', ['SILA_OGNIA', 'PRESJA_TAKTYCZNA'])
    const refill = createSecondaryRefillEvents(session, 'p-a', 2, () => 0)
    expect(refill.some((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_DECK_SHUFFLED')).toBe(true)
    expect(refill.filter((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_DRAWN')).toHaveLength(2)

    const completedSession = dispatchBattleEvents(session, [
      cauldronEvent('SECONDARY_DECK_SHUFFLED', { playerId: 'p-a', deckOrder: ['SILA_OGNIA'] }),
      cauldronEvent('SECONDARY_DRAWN', { playerId: 'p-a', cardId: 'SILA_OGNIA', round, turn }),
      cauldronEvent('SECONDARY_COMPLETED', { playerId: 'p-a', cardId: 'SILA_OGNIA', round, turn, pointsAwarded: 4 }),
    ])
    expect(getSecondaryState(completedSession)['p-a'].completed.map((card) => card.cardId)).toContain('SILA_OGNIA')
    expect(getSecondaryState(completedSession)['p-a'].discarded.map((card) => card.cardId)).not.toContain('SILA_OGNIA')
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
})

describe('Cauldron elimination Secondaries', () => {
  it('matches Shooting/Fight, unit traits, and only the current Rival', () => {
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
    session = undoLastAction(session)
    expect(getPendingEliminationChoice(session, 'p-a')).toBeDefined()
  })

  it('automatically scores a single Fight or CHARACTER match', () => {
    let fight = toPhase(game('WALKA_W_ZWARCIU', 'ZIEMIA_NICZYJA'), 'FIGHT')
    fight = dispatchCauldronBattleEvent(fight, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })
    expect(getSecondaryState(fight)['p-a'].completed[0].cardId).toBe('WALKA_W_ZWARCIU')

    let character = game('ELIMINACJA_DOWODCY', 'ZIEMIA_NICZYJA')
    character = dispatchCauldronBattleEvent(character, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'remainder', destroyedByPlayerId: 'p-a' },
    })
    expect(getSecondaryState(character)['p-a'].completed[0].cardId).toBe('ELIMINACJA_DOWODCY')
  })
})

describe('Cauldron end-turn evaluation and scoring caps', () => {
  it('evaluates objective snapshot, neutral count, and tactical pressure automatically', () => {
    let assault = game('SZTURM_NA_POZYCJE', 'ZIEMIA_NICZYJA')
    assault = dispatchBattleEvents(assault, [
      { type: 'ROUND_STARTED', payload: { round: 2 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
      cauldronEvent('TURN_SNAPSHOT_CAPTURED', {
      round: 2,
      playerId: 'p-a',
      objectiveStates: Object.fromEntries(Object.entries(assault.state.objectives).map(([id, objective]) => [id, {
        controllerPlayerId: id === 'N1' ? 'p-c' : objective.controllerPlayerId,
        playerOC: objective.playerOC,
      }])),
    })])
    assault = control(assault, 'N1', 'p-a')
    assault = control(assault, 'N2', 'p-a')
    assault = toPhase(assault, 'END_TURN')
    assault = evaluateEndTurnSecondaries(assault, 'p-a')
    expect(getRoundSecondaryVp(assault, 'p-a')).toBe(10)
    expect(getSecondaryState(assault)['p-a'].completed).toHaveLength(2)

    let pressure = game('PRESJA_TAKTYCZNA', 'UTRZYMAJ_BAZE')
    pressure = control(pressure, 'N1', 'p-a')
    pressure = control(pressure, 'N2', 'p-a')
    pressure = control(pressure, 'A-HOME', 'p-a')
    pressure = toPhase(pressure, 'END_TURN')
    pressure = evaluateEndTurnSecondaries(pressure, 'p-a', { noEnemyInOwnDeployment: true })
    expect(getRoundSecondaryVp(pressure, 'p-a')).toBe(7)
  })

  it('evaluates partial/confirmation position cards without pretending to know positions', () => {
    let session = game('DOMINACJA_CENTRUM', 'ZA_LINIAMI_WROGA')
    session = toPhase(session, 'END_TURN')
    expect(evaluateEndTurnSecondaries(session, 'p-a')).toBe(session)
    session = evaluateEndTurnSecondaries(session, 'p-a', {
      centreOcByPlayer: { 'p-a': 6, 'p-b': 4, 'p-c': 6 },
      behindEnemyLines: true,
    })
    expect(getRoundSecondaryVp(session, 'p-a')).toBe(5)
    expect(getSecondaryState(session)['p-a'].active.map((card) => card.cardId)).toContain('DOMINACJA_CENTRUM')

    let guided = game('SZEROKI_FRONT', 'ODCIECIE_ODWROTU')
    guided = toPhase(guided, 'END_TURN')
    guided = evaluateEndTurnSecondaries(guided, 'p-a', {
      wideFrontThreeSectors: true,
      wideFrontTwoOutsideDeployment: true,
      controlsClosestNeutralObjective: true,
      unitNearRivalDeployment: true,
    })
    expect(getRoundSecondaryVp(guided, 'p-a')).toBe(10)
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

    let gameCap = toPhase(game('PRESJA_TAKTYCZNA', 'ZIEMIA_NICZYJA'), 'END_TURN')
    gameCap = control(gameCap, 'N1', 'p-a')
    gameCap = control(gameCap, 'N2', 'p-a')
    gameCap = dispatchBattleEvents(gameCap, [
      cauldronEvent('SECONDARY_COMPLETED', { playerId: 'p-a', cardId: 'PRESJA_TAKTYCZNA', round: 0, turn: 0, pointsAwarded: 44 }),
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'secondary', delta: 44 } },
    ])
    gameCap = evaluateEndTurnSecondaries(gameCap, 'p-a')
    expect(getGameSecondaryVp(gameCap, 'p-a')).toBe(45)
    expect(gameCap.state.players['p-a'].score.secondary).toBe(45)
  })
})

describe('Cel Priorytetowy', () => {
  it('applies the 10% threshold, two-candidate flow, fixed Rival target, deadline, success and failure', () => {
    let session = game('CEL_PRIORYTETOWY', 'PRESJA_TAKTYCZNA')
    const candidates = getPriorityTargetCandidates(session, 'p-a')
    expect(candidates.find((unit) => unit.unitId === 'infantry')?.eligible).toBe(true)
    expect(() => selectPriorityTargetCandidates(session, 'p-a', ['tank'])).toThrow(/exactly two/i)
    session = selectPriorityTargetCandidates(session, 'p-a', ['tank', 'remainder'])
    session = choosePriorityTarget(session, 'p-a', 'tank')
    const targetCard = getSecondaryState(session)['p-a'].active.find((card) => card.cardId === 'CEL_PRIORYTETOWY')
    expect(targetCard?.cardSpecificState).toEqual(expect.objectContaining({
      priorityTargetUnitId: 'tank', boundRivalPlayerId: 'p-b', deadlineRound: 2,
    }))
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a' },
    })
    expect(getSecondaryState(session)['p-a'].completed.map((card) => card.cardId)).toContain('CEL_PRIORYTETOWY')

    let failed = game('CEL_PRIORYTETOWY', 'PRESJA_TAKTYCZNA')
    failed = selectPriorityTargetCandidates(failed, 'p-a', ['tank', 'remainder'])
    failed = choosePriorityTarget(failed, 'p-a', 'tank')
    failed = toPhase(failed, 'END_TURN')
    // Advance the stored deadline context without a movement simulator.
    failed = dispatchBattleEvents(failed, [
      { type: 'ROUND_STARTED', payload: { round: 2 } },
      { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
      { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } },
    ])
    failed = evaluateEndTurnSecondaries(failed, 'p-a')
    expect(getActiveSecondaryViews(failed, 'p-a').find((card) => card.cardId === 'CEL_PRIORYTETOWY')?.status).toBe('DEADLINE_FAILED')
  })
})
