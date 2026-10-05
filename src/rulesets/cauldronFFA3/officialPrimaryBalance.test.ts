import { describe, expect, it } from 'vitest'
import { deserializeBattleSession, dispatchBattleEvent, dispatchBattleEvents, serializeBattleSession } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { testArmy } from './cauldronTestUtils'
import { cauldronEvent } from './events'
import { evaluateOfficialPrimary, getOfficialPrimaryMarkers, getOfficialPrimaryMission } from './officialPrimary'
import { usesBalancedFfaPrimary } from './officialPrimaryBalance'
import { createPrimaryTurnCommitEvents } from './primary'
import { createCauldronGame } from './session'
import { getCauldronConfig } from './sessionConfig'
import { captureTurnSnapshot } from './snapshots'
import type { OfficialPrimaryBalance, OfficialPrimaryConfirmation, OfficialPrimaryId } from './types'

function game(mission: OfficialPrimaryId, balance?: OfficialPrimaryBalance) {
  const armies = ['a', 'b', 'c'].map((id) => testArmy(`army-${id}`))
  return createCauldronGame({
    gameId: 'primary-balance', guidanceLevel: 'fast', armies, primaryDeck: 'chapter-approved-ffa',
    officialPrimaryBalance: balance, objectiveLayout: 'expanded-7',
    players: armies.map((army, index) => ({
      id: `p-${'abc'[index]}`, name: `Player ${index + 1}`, armyId: army.id,
      deploymentZone: 'ABC'[index] as 'A' | 'B' | 'C', turnPosition: (index + 1) as 1 | 2 | 3,
      operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: mission,
    })),
  })
}

function control(session: BattleSession, objectiveId: string, controllerPlayerId = 'p-a') {
  return dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId } })
}

function command(session: BattleSession, round: number) {
  const next = dispatchBattleEvents(session, [
    { type: 'ROUND_STARTED', payload: { round } },
    { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
  ])
  return dispatchBattleEvents(next, [cauldronEvent('PRIMARY_11TH_COMMAND_SNAPSHOT', captureTurnSnapshot(next, 'p-a', round))])
}

function commit(session: BattleSession, confirmation: OfficialPrimaryConfirmation = {}) {
  const end = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
  return dispatchBattleEvents(end, createPrimaryTurnCommitEvents(end, 'p-a', { officialPrimary: confirmation }))
}

// A comparison of specific board/task histories, not an estimate of win rates.
function limitedBoardBattle(mission: OfficialPrimaryId, balance: OfficialPrimaryBalance) {
  let session = game(mission, balance)
  const neutral = mission === 'gather-intel' ? 'CENTER' : 'N1'
  session = control(control(control(control(session, 'A-HOME'), neutral), 'B-HOME', 'p-b'), 'C-HOME', 'p-c')
  for (let round = 1; round <= 5; round += 1) {
    session = command(session, round)
    const confirmation: OfficialPrimaryConfirmation = mission === 'meatgrinder'
      ? { enemyUnitsDestroyedThisTurn: round === 2 || round === 4 ? 1 : 0, friendlyUnitsDestroyedSinceLastTurn: 0 }
      : mission === 'sabotage' || (mission === 'gather-intel' && round === 2)
        ? { actions: [{ objectiveId: neutral, unitName: 'Infantry', enemyTerritory: false }] }
        : {}
    session = commit(session, confirmation)
    session = deserializeBattleSession(serializeBattleSession(session))
  }
  return session
}

describe('FFA Primary VP balance', () => {
  it('records the balanced profile for new battles', () => {
    const session = game('outmanoeuvre')
    expect(getCauldronConfig(session).officialPrimaryBalance).toBe('balanced-v1')
    expect(usesBalancedFfaPrimary(deserializeBattleSession(serializeBattleSession(session)))).toBe(true)
  })

  it.each([
    ['battlefield-dominance', 36, 32],
    ['meatgrinder', 32, 34],
    ['gather-intel', 29, 32],
    ['sabotage', 31, 36],
    ['outmanoeuvre', 26, 30],
  ] as const)('scores the limited-board history for %s as %i original / %i balanced', (mission, original, balanced) => {
    expect(limitedBoardBattle(mission, 'original').state.players['p-a'].score.primary).toBe(original)
    expect(limitedBoardBattle(mission, 'balanced-v1').state.players['p-a'].score.primary).toBe(balanced)
  })

  it.each([2, 3, 4, 5])('reduces the HOME bonus while retaining Battlefield Dominance control checks in round %i', (round) => {
    let session = command(control(control(game('battlefield-dominance'), 'A-HOME'), 'N1'), round)
    expect(evaluateOfficialPrimary(session, 'p-a').review.conditions.slice(-2).map((condition) => condition.vp)).toEqual([6, 1])
    session = control(session, 'A-HOME', 'p-b')
    // Earlier rounds retain the Command snapshot; the final round checks turn-end control.
    expect(evaluateOfficialPrimary(session, 'p-a').review.conditions.slice(-2).map((condition) => condition.vp)).toEqual(round === 5 ? [3, 0] : [6, 1])
  })

  it('gives Meatgrinder a steadier floor while preserving its successful-trade total', () => {
    const session = command(control(game('meatgrinder'), 'N1'), 3)
    expect(evaluateOfficialPrimary(session, 'p-a').roundPrimary).toBe(5)
    expect(evaluateOfficialPrimary(session, 'p-a', 3, { enemyUnitsDestroyedThisTurn: 1, friendlyUnitsDestroyedSinceLastTurn: 0 }).roundPrimary).toBe(12)
    expect(evaluateOfficialPrimary(session, 'p-a', 3, { enemyUnitsDestroyedThisTurn: 1, friendlyUnitsDestroyedSinceLastTurn: 1 }).roundPrimary).toBe(8)
  })

  it('pays Gather Intel once per marked objective and retains its marker milestones', () => {
    let session = command(control(game('gather-intel'), 'N1'), 2)
    session = commit(session, { actions: [{ objectiveId: 'N1', unitName: 'Infantry' }] })
    expect(session.state.players['p-a'].score.primary).toBe(13)
    expect(getOfficialPrimaryMarkers(session, 'p-a')).toEqual(['N1'])
    session = command(session, 3)
    expect(() => commit(session, { actions: [{ objectiveId: 'N1', unitName: 'Infantry' }] })).toThrow(/different controlled non-home objective/)
    session = dispatchBattleEvents(session, [cauldronEvent('PRIMARY_11TH_MARKERS_PLACED', {
      playerId: 'p-a', round: 3, objectiveIds: ['N2', 'B-HOME'],
    })])
    session = command(session, 5)
    expect(evaluateOfficialPrimary(session, 'p-a').review.conditions.slice(-2).map((condition) => condition.vp)).toEqual([5, 5])
  })

  it('caps simultaneous Gather Intel extractions without losing their saved markers', () => {
    const session = command(control(control(game('gather-intel'), 'N1'), 'N2'), 2)
    const result = commit(session, { actions: [{ objectiveId: 'N1', unitName: 'Infantry' }, { objectiveId: 'N2', unitName: 'Tank' }] })
    expect(result.state.players['p-a'].score.primary).toBe(15)
    expect(getOfficialPrimaryMarkers(result, 'p-a')).toEqual(['N1', 'N2'])
  })

  it('keeps the Sabotage territory bonus and separate acting units', () => {
    const session = command(control(control(game('sabotage'), 'N1'), 'N2'), 2)
    const actions = [{ objectiveId: 'N1', unitName: 'Infantry', enemyTerritory: true }, { objectiveId: 'N2', unitName: 'Tank' }]
    expect(evaluateOfficialPrimary(session, 'p-a', 2, { actions }, true).roundPrimary).toBe(14)
    expect(() => evaluateOfficialPrimary(session, 'p-a', 2, { actions: [actions[0], { ...actions[1], unitName: 'Infantry' }] }, true)).toThrow(/different acting unit/)
  })

  it.each([[2, 14], [3, 14], [4, 15], [5, 15]] as const)('scores Outmanoeuvre at the Rival HOME in round %i without an oversized base reward', (round, expected) => {
    const rivalHome = round % 2 === 0 ? 'C-HOME' : 'B-HOME'
    const session = command(control(game('outmanoeuvre'), rivalHome), round)
    expect(evaluateOfficialPrimary(session, 'p-a').roundPrimary).toBe(expected)
  })

  it('retains the 45 VP game cap and idempotent end-turn commits', () => {
    let session = command(control(control(control(game('outmanoeuvre'), 'N1'), 'N2'), 'C-HOME'), 4)
    session = dispatchBattleEvent(session, { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 43 } })
    session = commit(session)
    expect(session.state.players['p-a'].score.primary).toBe(45)
    expect(createPrimaryTurnCommitEvents(session, 'p-a')).toEqual([])
  })

  it('loads an untagged save with its original awards, recorded points and rule text', () => {
    let original = command(control(game('gather-intel', 'original'), 'N1'), 2)
    original = commit(original, { actions: [{ objectiveId: 'N1', unitName: 'Infantry' }] })
    delete getCauldronConfig(original).officialPrimaryBalance
    const restored = deserializeBattleSession(serializeBattleSession(original))
    expect(usesBalancedFfaPrimary(restored)).toBe(false)
    expect(restored.state.players['p-a'].score.primary).toBe(11)
    expect(getOfficialPrimaryMarkers(restored, 'p-a')).toEqual(['N1'])
    const later = command(restored, 3)
    expect(evaluateOfficialPrimary(later, 'p-a').roundPrimary).toBe(4)
    expect(getOfficialPrimaryMission(later, 'p-a').rules[1]).toContain('7 VP per completed')
    expect(getOfficialPrimaryMission(game('gather-intel'), 'p-a').rules[1]).toContain('8 VP per completed')
  })
})
