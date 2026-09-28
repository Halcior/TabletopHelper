import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent, dispatchBattleEvents } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { testArmy } from './cauldronTestUtils'
import { getCauldronEventData } from './events'
import { evaluateOfficialPrimary, getOfficialPrimaryMarkers } from './officialPrimary'
import { createDeferredWyniszczenieEvents, createPrimaryTurnCommitEvents } from './primary'
import { advanceCauldronPhase, createCauldronGame } from './session'
import { captureTurnSnapshot } from './snapshots'
import type { OfficialPrimaryId } from './types'

function game(id: OfficialPrimaryId = 'battlefield-dominance', layout: 'expanded-7' | 'classic-6' = 'expanded-7') {
  const armies = ['a', 'b', 'c'].map((name) => testArmy(`army-${name}`))
  return createCauldronGame({
    gameId: 'official-primary-test', guidanceLevel: 'fast', armies, primaryDeck: 'chapter-approved-ffa', objectiveLayout: layout,
    players: armies.map((army, index) => ({
      id: `p-${['a', 'b', 'c'][index]}`, name: `Player ${index + 1}`, armyId: army.id,
      deploymentZone: ['A', 'B', 'C'][index] as 'A' | 'B' | 'C', turnPosition: (index + 1) as 1 | 2 | 3,
      operationalPlanId: 'WYNISZCZENIE' as const,
      officialPrimaryId: index === 0 ? id : index === 1 ? 'meatgrinder' as const : 'outmanoeuvre' as const,
    })),
  })
}

function control(session: BattleSession, objectiveId: string, playerId = 'p-a') {
  return dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: playerId } })
}

function round(session: BattleSession, number: number) {
  const next = dispatchBattleEvents(session, [
    { type: 'ROUND_STARTED', payload: { round: number } },
    { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
  ])
  return dispatchBattleEvent(next, { type: 'RULESET_EVENT', payload: {
    rulesetId: 'cauldron-ffa-3', action: 'TURN_SNAPSHOT_CAPTURED', data: captureTurnSnapshot(next, 'p-a', number),
  } })
}

describe('11th edition Primary FFA adaptation', () => {
  it('locks a different selected mission for each player and requires CENTER for Gather Intel', () => {
    const session = game()
    const config = session.setup.rulesetConfig as { playerConfigs: Record<string, { officialPrimaryId: string }> }
    expect(config.playerConfigs['p-a'].officialPrimaryId).toBe('battlefield-dominance')
    expect(config.playerConfigs['p-b'].officialPrimaryId).toBe('meatgrinder')
    expect(config.playerConfigs['p-c'].officialPrimaryId).toBe('outmanoeuvre')
    expect(() => game('gather-intel', 'classic-6')).toThrow(/CENTER/)
  })

  it('uses the start-of-turn Command snapshot, then locks the result at turn end', () => {
    let session = control(control(game(), 'A-HOME'), 'N1')
    session = round(session, 2)
    session = control(session, 'N2')
    const review = evaluateOfficialPrimary(session, 'p-a')
    expect(review.review.conditions.map((condition) => condition.vp)).toEqual([2, 6, 2])
    expect(review.roundPrimary).toBe(10)
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
    session = dispatchBattleEvents(session, createPrimaryTurnCommitEvents(session, 'p-a'))
    expect(session.state.players['p-a'].score.primary).toBe(10)
    expect(createPrimaryTurnCommitEvents(session, 'p-a')).toEqual([])
    expect(createDeferredWyniszczenieEvents(session)).toEqual([])
  })

  it('records the end of Command, including control changes within that phase', () => {
    let session = round(control(game(), 'A-HOME'), 2)
    session = control(session, 'N1')
    session = advanceCauldronPhase(session)
    session = control(session, 'N2')
    const result = evaluateOfficialPrimary(session, 'p-a')
    expect(result.review.conditions.map((condition) => condition.vp)).toEqual([2, 6, 2])
  })

  it('uses turn-end control in the fifth round and respects the remaining game cap', () => {
    let session = round(game(), 5)
    session = control(control(session, 'A-HOME'), 'N1')
    session = dispatchBattleEvent(session, { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 42 } })
    const result = evaluateOfficialPrimary(session, 'p-a')
    expect(result.review.conditions.map((condition) => condition.vp)).toEqual([6, 2])
    expect(result.roundPrimary).toBe(3)
  })

  it('scores Outmanoeuvre in round 1 and caps the total even with an enemy HOME', () => {
    const session = control(control(game('outmanoeuvre'), 'B-HOME'), 'N1')
    const result = evaluateOfficialPrimary(session, 'p-a')
    expect(result.review.conditions.map((condition) => condition.vp)).toEqual([10, 8])
    expect(result.roundPrimary).toBe(15)
    expect(result.capped).toBe(true)
  })

  it('counts both enemies for Meatgrinder without adding Operational Plan VP', () => {
    const session = round(control(game('meatgrinder'), 'N1'), 2)
    const result = evaluateOfficialPrimary(session, 'p-a', 2, {
      enemyUnitsDestroyedThisTurn: 2, friendlyUnitsDestroyedSinceLastTurn: 1,
    })
    expect(result.review.conditions.map((condition) => condition.vp)).toEqual([3, 4, 5, 0])
    expect(result.roundPrimary).toBe(12)
  })

  it('places Gather Intel markers once, scores actions and rejects duplicate targets', () => {
    let session = round(control(game('gather-intel'), 'N1'), 2)
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
    const officialPrimary = { actions: [{ objectiveId: 'N1', unitName: 'Scouts' }] }
    session = dispatchBattleEvents(session, createPrimaryTurnCommitEvents(session, 'p-a', { officialPrimary }))
    expect(session.state.players['p-a'].score.primary).toBe(11)
    expect(getOfficialPrimaryMarkers(session, 'p-a')).toEqual(['N1'])
    expect(getCauldronEventData(session, 'PRIMARY_11TH_MARKERS_PLACED')).toHaveLength(1)
    const later = round(session, 3)
    expect(() => createPrimaryTurnCommitEvents(
      dispatchBattleEvent(later, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }), 'p-a', { officialPrimary },
    )).toThrow(/different controlled non-home objective/)
  })

  it('counts separate Sabotage actions and their manually confirmed enemy territory', () => {
    let session = control(control(game('sabotage'), 'N1'), 'N2')
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
    const actions = [
      { objectiveId: 'N1', unitName: 'Guard', enemyTerritory: true },
      { objectiveId: 'N2', unitName: 'Allarus', enemyTerritory: false },
    ]
    expect(evaluateOfficialPrimary(session, 'p-a', 1, { actions }).roundPrimary).toBe(8)
    expect(() => createPrimaryTurnCommitEvents(session, 'p-a', { officialPrimary: { actions: [actions[0], { ...actions[1], unitName: 'Guard' }] } })).toThrow(/different acting unit/)
  })
})
