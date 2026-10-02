import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent, dispatchBattleEvents } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { testArmy } from './cauldronTestUtils'
import { getCauldronEventData } from './events'
import { evaluateOfficialPrimary, getOfficialPrimaryMarkers } from './officialPrimary'
import { createDeferredWyniszczenieEvents, createPrimaryTurnCommitEvents } from './primary'
import { advanceCauldronPhase, createCauldronGame } from './session'
import { captureTurnSnapshot } from './snapshots'
import type { DeploymentZone, OfficialPrimaryId } from './types'

function game(id: OfficialPrimaryId = 'battlefield-dominance', layout: 'expanded-7' | 'classic-6' = 'expanded-7', sameMission = false, zones: DeploymentZone[] = ['A', 'B', 'C']) {
  const armies = ['a', 'b', 'c'].map((name) => testArmy(`army-${name}`))
  return createCauldronGame({
    gameId: 'official-primary-test', guidanceLevel: 'fast', armies, primaryDeck: 'chapter-approved-ffa', objectiveLayout: layout,
    players: armies.map((army, index) => ({
      id: `p-${['a', 'b', 'c'][index]}`, name: `Player ${index + 1}`, armyId: army.id,
      deploymentZone: zones[index], turnPosition: (index + 1) as 1 | 2 | 3,
      operationalPlanId: 'WYNISZCZENIE' as const,
      officialPrimaryId: sameMission || index === 0 ? id : index === 1 ? 'meatgrinder' as const : 'outmanoeuvre' as const,
    })),
  })
}

function control(session: BattleSession, objectiveId: string, playerId = 'p-a') {
  return dispatchBattleEvent(session, { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: playerId } })
}

function round(session: BattleSession, number: number, playerId = 'p-a') {
  const next = dispatchBattleEvents(session, [
    { type: 'ROUND_STARTED', payload: { round: number } },
    { type: 'TURN_STARTED', payload: { playerId } },
  ])
  return dispatchBattleEvent(next, { type: 'RULESET_EVENT', payload: {
    rulesetId: 'cauldron-ffa-3', action: 'TURN_SNAPSHOT_CAPTURED', data: captureTurnSnapshot(next, playerId, number),
  } })
}

const rivalCases = [1, 2, 3, 4, 5].flatMap((battleRound) => ['A', 'B', 'C'].map((zone, index) => {
  const rivalZone = (battleRound % 2 === 1 ? ['B', 'C', 'A'] : ['C', 'A', 'B'])[index]
  const thirdZone = ['A', 'B', 'C'].find((candidate) => candidate !== zone && candidate !== rivalZone)!
  return {
    battleRound, zone, playerId: `p-${zone.toLowerCase()}`, rivalZone, thirdZone,
    rivalId: `p-${rivalZone.toLowerCase()}`, thirdId: `p-${thirdZone.toLowerCase()}`,
  }
}))

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

  it('counts current Rival units for Meatgrinder without adding Operational Plan VP', () => {
    const session = round(control(game('meatgrinder'), 'N1'), 2)
    const result = evaluateOfficialPrimary(session, 'p-a', 2, {
      enemyUnitsDestroyedThisTurn: 2, friendlyUnitsDestroyedSinceLastTurn: 1,
    })
    expect(result.review.conditions.map((condition) => condition.vp)).toEqual([3, 4, 5, 0])
    expect(result.roundPrimary).toBe(12)
  })

  it.each(rivalCases.filter((entry) => entry.battleRound <= 2))('compares only the Rival of $playerId in round $battleRound, even when the third player leads', ({ battleRound, zone, playerId, rivalZone, rivalId, thirdZone, thirdId }) => {
    let session = game('battlefield-dominance', 'expanded-7', true)
    session = control(control(control(session, `${zone}-HOME`, playerId), `${rivalZone}-HOME`, rivalId), `${thirdZone}-HOME`, thirdId)
    session = control(control(control(session, 'N1', thirdId), 'CENTER', thirdId), 'N2', playerId)
    session = round(session, battleRound, playerId)
    const result = evaluateOfficialPrimary(session, playerId)
    expect(result.review.rivalPlayerId).toBe(rivalId)
    expect(result.review.conditions[0].vp).toBe(2)
    // A tie with the Rival is insufficient; the third player's three objectives do not matter.
    session = control(session, 'N3', rivalId)
    expect(evaluateOfficialPrimary(session, playerId).review.conditions[0].vp).toBe(0)
  })

  it.each(rivalCases)('uses only the current Rival HOME for $playerId in round $battleRound', ({ battleRound, playerId, rivalZone, thirdZone }) => {
    for (const mission of ['outmanoeuvre', 'meatgrinder'] as const) {
      if (mission === 'meatgrinder' && battleRound === 1) continue
      let session = round(control(game(mission, 'expanded-7', true), `${thirdZone}-HOME`, playerId), battleRound, playerId)
      const homeCondition = (current: BattleSession) => evaluateOfficialPrimary(current, playerId).review.conditions
        .find((condition) => condition.label.startsWith('Control current Rival HOME'))!
      expect(homeCondition(session).vp).toBe(0)
      session = control(session, `${rivalZone}-HOME`, playerId)
      expect(homeCondition(session).vp).toBe(mission === 'outmanoeuvre' ? 10 : 5)
    }
  })

  it.each(rivalCases)('binds Meatgrinder physical confirmations to the Rival of $playerId in round $battleRound', ({ battleRound, playerId, rivalId, thirdId }) => {
    const session = round(control(game('meatgrinder', 'expanded-7', true), 'N1', playerId), battleRound, playerId)
    const counts = { rivalPlayerId: rivalId, enemyUnitsDestroyedThisTurn: 2, friendlyUnitsDestroyedSinceLastTurn: 1 }
    expect(evaluateOfficialPrimary(session, playerId, battleRound, counts).roundPrimary).toBe(battleRound === 1 ? 3 : 12)
    const stale = { ...counts, rivalPlayerId: thirdId }
    expect(evaluateOfficialPrimary(session, playerId, battleRound, stale).roundPrimary).toBe(battleRound === 1 ? 0 : 4)
    expect(() => evaluateOfficialPrimary(session, playerId, battleRound, stale, true)).toThrow(/current Rival/)
  })

  it.each(rivalCases)('limits Sabotage HOME territory bonuses to the Rival of $playerId in round $battleRound', ({ battleRound, playerId, rivalId, rivalZone, thirdZone }) => {
    const session = round(control(control(game('sabotage', 'expanded-7', true), `${rivalZone}-HOME`, playerId), `${thirdZone}-HOME`, playerId), battleRound, playerId)
    const result = evaluateOfficialPrimary(session, playerId, battleRound, {
      rivalPlayerId: rivalId,
      actions: [
        { objectiveId: `${rivalZone}-HOME`, unitName: 'Scouts' },
        { objectiveId: `${thirdZone}-HOME`, unitName: 'Guard', enemyTerritory: true },
      ],
    }, true)
    expect(result.review.conditions.filter((condition) => condition.label.startsWith('Current Rival territory'))).toHaveLength(1)
    expect(result.roundPrimary).toBe(battleRound === 1 ? 8 : 12)
  })

  it.each(rivalCases.filter((entry) => entry.battleRound === 5))('checks the round 5 Rival HOME for Gather Intel markers of $playerId', ({ playerId, rivalZone, thirdZone }) => {
    let session = game('gather-intel', 'expanded-7', true)
    session = dispatchBattleEvent(session, { type: 'RULESET_EVENT', payload: {
      rulesetId: 'cauldron-ffa-3', action: 'PRIMARY_11TH_MARKERS_PLACED',
      data: { playerId, round: 2, objectiveIds: ['N1', 'N2', `${thirdZone}-HOME`] },
    } })
    session = round(session, 5, playerId)
    expect(evaluateOfficialPrimary(session, playerId).review.conditions.slice(-2).map((condition) => condition.vp)).toEqual([5, 0])
    session = control(session, `${rivalZone}-HOME`, playerId)
    const result = evaluateOfficialPrimary(session, playerId, 5, { actions: [{ objectiveId: `${rivalZone}-HOME`, unitName: 'Scouts' }] }, true)
    expect(result.review.conditions.slice(-2).map((condition) => condition.vp)).toEqual([5, 5])
    expect(result.roundPrimary).toBe(15)
    expect(result.capped).toBe(true)
  })

  it('uses deployment zones to resolve HOME when player IDs and turn positions differ from zone names', () => {
    const session = game('outmanoeuvre', 'expanded-7', true, ['C', 'A', 'B'])
    const result = evaluateOfficialPrimary(control(control(session, 'B-HOME'), 'A-HOME'), 'p-a')
    expect(result.review.rivalPlayerId).toBe('p-b')
    expect(result.review.conditions[0]).toEqual(expect.objectContaining({ vp: 10, label: 'Control current Rival HOME (A-HOME) · end of turn' }))
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
