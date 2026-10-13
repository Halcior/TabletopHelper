import { describe, expect, it } from 'vitest'
import { completeBattle, createBattleSession, deserializeBattleSession, dispatchBattleEvent, dispatchBattleEvents, redoLastAction, serializeBattleSession, undoLastAction } from './engine'
import { buildBattleChronicle } from './chronicle'
import { buildUnitPerformance } from './unitPerformance'
import { battleReportMarkdown, buildBattleReport } from './battleReport'
import type { BattleEventInput, BattleSession } from './types'
import { testArmy, testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { startOfficialSecondaryAction, scoreOfficialSecondary } from '../../rulesets/cauldronFFA3/officialSecondary'
import { OFFICIAL_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/officialSecondaryDefinitions'
import type { OfficialSecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { getSecondaryState, dispatchCauldronBattleEvent } from '../../rulesets/cauldronFFA3/secondary'
import { officialKillLedger, getOfficialSecondaryRival } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'
import { getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3/rivalRotation'
import { authorizeSharedAction } from '../../multiplayer/sharedEventPolicy'

const stats = (session: BattleSession, playerId = 'p-a', unitId = 'tank') => buildUnitPerformance(session).units.find((unit) => unit.playerId === playerId && unit.unitId === unitId)!
const loss = (playerId = 'p-b', unitId = 'infantry', amount = 1, attacker = 'p-a', attackerUnitId: string | null = 'tank'): BattleEventInput => ({ type: 'UNIT_MODEL_DESTROYED', payload: { playerId, unitId, amount, destroyedByPlayerId: attacker, attackerUnitId } })
const kill = (playerId = 'p-b', unitId = 'tank', attacker = 'p-a', attackerUnitId: string | null = 'tank'): BattleEventInput => ({ type: 'UNIT_DESTROYED', payload: { playerId, unitId, destroyedByPlayerId: attacker, attackerUnitId } })

function officialGame(fixed = false): BattleSession {
  const armies = 'abc'.split('').map((id) => testArmy(`army-${id}`))
  const first: [OfficialSecondaryId, OfficialSecondaryId] = fixed ? ['OFFICIAL_BRING_IT_DOWN', 'OFFICIAL_ASSASSINATION'] : ['OFFICIAL_CLEANSE', 'OFFICIAL_PLUNDER']
  return createCauldronGame({
    gameId: 'official-performance', armies, guidanceLevel: 'fast', secondaryDeck: 'chapter-approved', primaryDeck: 'chapter-approved-ffa',
    officialSecondaryStrategy: fixed ? 'fixed' : 'tactical',
    fixedSecondarySelections: fixed ? Object.fromEntries(['p-a', 'p-b', 'p-c'].map((id) => [id, [...first]])) : undefined,
    secondaryDeckOrders: Object.fromEntries(['p-a', 'p-b', 'p-c'].map((id) => [id, [...first, ...OFFICIAL_SECONDARY_IDS.filter((id) => !first.includes(id))]])),
    players: armies.map((army, index) => ({ id: `p-${'abc'[index]}`, name: `Player ${'ABC'[index]}`, armyId: army.id, deploymentZone: 'ABC'[index] as 'A' | 'B' | 'C', turnPosition: (index + 1) as 1 | 2 | 3, operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'meatgrinder' })),
  })
}

describe('combat attribution and canonical unit performance', () => {
  it('splits FFA model value between players and gives only the last hit the kill', () => {
    let session = dispatchBattleEvents(testCauldronGame(), [loss('p-b', 'infantry', 2), loss('p-b', 'infantry', 2, 'p-c', 'infantry')])
    expect(stats(session)).toMatchObject({ modelsDestroyed: 2, enemyPointsDestroyed: 85, kills: 0 })
    expect(stats(session, 'p-c', 'infantry')).toMatchObject({ modelsDestroyed: 2, enemyPointsDestroyed: 85, kills: 1, combatRoi: 50 })
    session = dispatchBattleEvent(session, kill('p-b', 'infantry'))
    expect(stats(session, 'p-c', 'infantry').kills).toBe(1)
    expect(stats(session).kills).toBe(0)
    expect(buildUnitPerformance(session).armies.reduce((sum, army) => sum + army.enemyPointsDestroyed, 0)).toBe(170)
  })

  it('supports split fire between units and repeated target IDs in different armies', () => {
    const session = dispatchBattleEvents(testCauldronGame(), [loss('p-b', 'infantry', 2), loss('p-b', 'infantry', 2, 'p-a', 'infantry'), kill('p-c', 'tank')])
    expect(stats(session)).toMatchObject({ enemyPointsDestroyed: 310, kills: 1 })
    expect(stats(session, 'p-a', 'infantry')).toMatchObject({ enemyPointsDestroyed: 85, kills: 1 })
    expect(stats(session).destroyedEnemies.map((unit) => unit.playerId)).toEqual(['p-c'])
    expect(() => JSON.stringify(buildBattleReport(session))).not.toThrow()
  })

  it('computes the documented ROI and leaves zero-cost ROI undefined', () => {
    const armies = [testArmy('a'), testArmy('b')]
    armies[0].units[1].points = 230
    armies[1].units[1].points = 400
    armies[0].units[0].points = 0
    const session = dispatchBattleEvent(createBattleSession({ rulesetId: 'test', armies, players: [{ id: 'p-a', name: 'A', armyId: 'a' }, { id: 'p-b', name: 'B', armyId: 'b' }] }), kill())
    expect(Math.round(stats(session).combatRoi!)).toBe(174)
    expect(stats(session, 'p-a', 'infantry').combatRoi).toBeNull()
  })

  it('retracts net model credits and last-hit kills on restoration across rounds', () => {
    let session = dispatchBattleEvents(testCauldronGame(), [loss('p-b', 'infantry', 2), loss('p-b', 'infantry', 2, 'p-c', 'tank'), { type: 'ROUND_STARTED', payload: { round: 2 } }, { type: 'UNIT_MODEL_RESTORED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } }])
    expect(stats(session).enemyPointsDestroyed).toBe(85)
    expect(stats(session, 'p-c').enemyPointsDestroyed).toBe(42.5)
    expect(stats(session, 'p-c').kills).toBe(0)
    expect(stats(session, 'p-b', 'infantry')).toMatchObject({ survived: true, remainingModels: 1, modelsLost: 3, destructionRound: undefined })
    session = dispatchBattleEvent(session, loss('p-b', 'infantry', 1))
    expect(stats(session).kills).toBe(1)
    expect(stats(session).enemyPointsDestroyed).toBe(127.5)
  })

  it('restores unknown casualties before older attributed ones', () => {
    const session = dispatchBattleEvents(testCauldronGame(), [loss(), { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } }, { type: 'UNIT_MODEL_RESTORED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } }])
    expect(stats(session).enemyPointsDestroyed).toBe(42.5)
    expect(buildUnitPerformance(session).unattributedPoints).toBe(0)
  })

  it('reconciles model and wound host corrections without assigning invented kills', () => {
    let session = dispatchBattleEvents(testCauldronGame(), [kill(), { type: 'STATE_CORRECTED', payload: { correction: { kind: 'UNIT_WOUNDS', playerId: 'p-b', unitId: 'tank', value: 14 }, reason: 'Wrong tank selected' } }])
    expect(stats(session)).toMatchObject({ kills: 0, enemyPointsDestroyed: 0, modelsDestroyed: 0 })
    session = dispatchBattleEvent(session, { type: 'STATE_CORRECTED', payload: { correction: { kind: 'UNIT_MODELS', playerId: 'p-c', unitId: 'infantry', value: 0 }, reason: 'Missing casualties' } })
    expect(buildUnitPerformance(session).unattributedPoints).toBe(170)
    expect(stats(session, 'p-c', 'infantry')).toMatchObject({ survived: false, remainingModels: 0, destructionRound: 1 })
  })

  it('counts only explicit single-model wound damage and preserves healing history', () => {
    let session = dispatchBattleEvents(testCauldronGame(), [
      { type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 9, destroyedByPlayerId: 'p-a', attackerUnitId: 'tank' } },
      { type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 10 } },
      { type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 0, destroyedByPlayerId: 'p-c', attackerUnitId: 'tank' } },
      kill('p-c', 'infantry'),
    ])
    expect(stats(session)).toMatchObject({ damageDealt: 5, enemyPointsDestroyed: 170, damagePartial: true })
    expect(stats(session, 'p-c')).toMatchObject({ damageDealt: 10, enemyPointsDestroyed: 225, kills: 1 })
    session = dispatchBattleEvent(session, { type: 'STATE_CORRECTED', payload: { correction: { kind: 'UNIT_WOUNDS', playerId: 'p-b', unitId: 'tank', value: 4 }, reason: 'Overstated damage' } })
    expect(stats(session, 'p-c')).toMatchObject({ damageDealt: 6, kills: 0, enemyPointsDestroyed: 0 })
  })

  it('counts a leader and bodyguard separately with their own IDs and costs', () => {
    let session = testCauldronGame()
    const army = session.setup.armies['army-b']
    army.units[2].leaderOfUnitId = 'infantry'
    army.units[0].ledByUnitIds = ['remainder']
    session = dispatchBattleEvents(session, [kill('p-b', 'infantry'), kill('p-b', 'remainder')])
    expect(stats(session).kills).toBe(2)
    expect(stats(session).enemyPointsDestroyed).toBe(1175)
    expect(stats(session).destroyedEnemies.map((unit) => unit.unitId)).toEqual(['infantry', 'remainder'])
  })

  it('replays old saves, keeps player-only attribution and does not invent unit damage', () => {
    const session = dispatchBattleEvent(testCauldronGame(), { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a' } })
    const replayed = deserializeBattleSession(serializeBattleSession(session))
    const result = buildUnitPerformance(replayed)
    expect(result).toEqual(buildUnitPerformance(session))
    expect(result.armies[0]).toMatchObject({ enemyPointsDestroyed: 225, playerOnlyPoints: 225, kills: 1 })
    expect(stats(replayed)).toMatchObject({ kills: 0, damageDealt: null })
    expect(result.partial).toBe(true)
  })

  it('is stable under duplicate event IDs, undo and redo', () => {
    const before = testCauldronGame()
    const session = dispatchBattleEvent(before, loss())
    const duplicate = { ...session, state: { ...session.state, events: [...session.state.events, session.state.events.at(-1)!] } }
    expect(buildUnitPerformance(duplicate)).toEqual(buildUnitPerformance(session))
    expect(buildBattleChronicle(duplicate)).toEqual(buildBattleChronicle(session))
    expect(buildUnitPerformance(undoLastAction(session))).toEqual(buildUnitPerformance(before))
    expect(buildUnitPerformance(redoLastAction(undoLastAction(session)))).toEqual(buildUnitPerformance(session))
  })

  it('rejects invalid attacker unit ownership, missing players, self-attribution and oversized notes', () => {
    const session = testCauldronGame()
    for (const payload of [ { attackerUnitId: 'nonexistent' }, { destroyedByPlayerId: null }, { destroyedByPlayerId: 'p-b' }, { note: 'a'.repeat(241) } ]) {
      expect(() => dispatchBattleEvent(session, { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a', attackerUnitId: 'tank', ...payload } })).toThrow()
    }
    const event = { ...session.state.events[0], type: 'UNIT_DESTROYED' as const, payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a', attackerUnitId: 'missing' } }
    expect(authorizeSharedAction(session, [event], { battleId: session.setup.gameId, roomId: 'r', roomCode: 'ABC123', playerId: 'p-a', clientId: 'c', isHost: true }).allowed).toBe(false)
  })

  it('does not change Cauldron scoring or Rival targets when a unit is added', () => {
    const session = dispatchBattleEvent(testCauldronGame(), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    const plain = dispatchCauldronBattleEvent(session, kill('p-b', 'tank', 'p-a', null))
    const attributed = dispatchCauldronBattleEvent(session, kill())
    expect(attributed.state.players).toEqual(plain.state.players)
    expect(getSecondaryState(attributed)).toEqual(getSecondaryState(plain))
    expect(getCurrentRivalPlayerId(attributed, 'p-a')).toBe(getCurrentRivalPlayerId(plain, 'p-a'))
  })

  it('keeps Chapter Approved kill accounting and Secondary Rival identical', () => {
    const session = officialGame()
    const plain = dispatchCauldronBattleEvent(session, kill('p-b', 'tank', 'p-a', null))
    const attributed = dispatchCauldronBattleEvent(session, kill())
    expect(officialKillLedger(attributed).map(({ eventId: _id, ...rest }) => rest)).toEqual(officialKillLedger(plain).map(({ eventId: _id, ...rest }) => rest))
    expect(getSecondaryState(attributed)).toEqual(getSecondaryState(plain))
    expect(getOfficialSecondaryRival(attributed, 'p-a', 'OFFICIAL_CLEANSE')).toBe(getOfficialSecondaryRival(plain, 'p-a', 'OFFICIAL_CLEANSE'))
  })
})

describe('mission attribution, timeline and offline report', () => {
  it('records Mission Action completion once and gives objective control no invented unit VP', () => {
    let session = dispatchBattleEvents(testCauldronGame(), [
      { type: 'MISSION_ACTION_STARTED', payload: { action: { id: 'mission', playerId: 'p-a', unitId: 'infantry', type: 'CUSTOM', name: 'Scan', startedRound: 1, startedTurn: 1, status: 'ACTIVE' } } },
      { type: 'MISSION_ACTION_COMPLETED', payload: { actionId: 'mission', endedRound: 1, endedTurn: 1 } },
      { type: 'MISSION_ACTION_COMPLETED', payload: { actionId: 'mission', endedRound: 1, endedTurn: 1 } },
      { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' } },
      { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 5 } },
    ])
    expect(stats(session, 'p-a', 'infantry')).toMatchObject({ completedMissionActions: 1, missionVp: null })
    session = dispatchBattleEvent(session, { type: 'MISSION_ACTION_FAILED', payload: { actionId: 'mission', endedRound: 1, endedTurn: 1, reason: 'Correction' } })
    expect(stats(session, 'p-a', 'infantry').completedMissionActions).toBe(0)
  })

  it('attributes confirmed Cleanse and immediate Plunder with Tactical scoring', () => {
    let session = dispatchBattleEvent(officialGame(), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    session = startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_CLEANSE', 'infantry', 'AB-NEUTRAL')
    session = startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_PLUNDER', 'tank', 'Ruins', { terrainWhollyOutsideOwnTerritory: true })
    expect(stats(session).completedMissionActions).toBe(1)
    expect(stats(session, 'p-a', 'infantry').completedMissionActions).toBe(0)
    session = dispatchBattleEvents(session, [{ type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'AB-NEUTRAL', controllerPlayerId: 'p-a' } }, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
    session = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_CLEANSE', 2, { completedCleanseObjectiveIds: ['AB-NEUTRAL'] })
    session = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_PLUNDER', 5)
    expect(stats(session, 'p-a', 'infantry')).toMatchObject({ completedMissionActions: 1, missionVp: 2 })
    expect(stats(session)).toMatchObject({ completedMissionActions: 1, missionVp: 5 })
    session = dispatchBattleEvent(session, { type: 'STATE_CORRECTED', payload: { correction: { kind: 'SCORE', playerId: 'p-a', category: 'secondary', value: 6 }, reason: 'Wrong VP' } })
    expect(stats(session).missionVp).toBeNull()
  })

  it('does not split multi-unit action VP by guessing', () => {
    let session = dispatchBattleEvent(officialGame(), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
    session = startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_CLEANSE', 'infantry', 'AB-NEUTRAL')
    session = startOfficialSecondaryAction(session, 'p-a', 'OFFICIAL_CLEANSE', 'tank', 'AC-NEUTRAL')
    session = dispatchBattleEvents(session, ['AB-NEUTRAL', 'AC-NEUTRAL'].map((objectiveId) => ({ type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId, controllerPlayerId: 'p-a' } })))
    session = dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
    session = scoreOfficialSecondary(session, 'p-a', 'OFFICIAL_CLEANSE', 5, { completedCleanseObjectiveIds: ['AB-NEUTRAL', 'AC-NEUTRAL'] })
    expect(stats(session).missionVp).toBeNull()
    expect(stats(session, 'p-a', 'infantry').missionVp).toBeNull()
    expect(stats(session).completedMissionActions).toBe(1)
  })

  it('assigns phase/round from replay and detects OC-driven control changes', () => {
    const session = dispatchBattleEvents(testCauldronGame(), [ { type: 'ROUND_STARTED', payload: { round: 4 } }, { type: 'PHASE_CHANGED', payload: { phase: 'FIGHT' } }, kill(), { type: 'OBJECTIVE_OC_CHANGED', payload: { objectiveId: 'N1', playerId: 'p-c', oc: 2 } } ])
    const entries = buildBattleChronicle(session)
    expect(entries.find((entry) => entry.event.type === 'UNIT_DESTROYED')).toMatchObject({ round: 4, phase: 'FIGHT', category: 'kills', highlight: true })
    expect(entries.at(-1)).toMatchObject({ category: 'objectives', highlight: true, playerIds: ['p-c'] })
  })

  it('declares ties only at the end, shares awards and serializes both factual styles', () => {
    let session = dispatchBattleEvents(testCauldronGame(), [kill(), kill('p-a', 'tank', 'p-c', 'tank'), { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 10 } }, { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-c', category: 'secondary', delta: 10 } }])
    expect(buildBattleReport(session).winnerPlayerIds).toEqual([])
    expect(buildBattleReport(session).performance.awards).toEqual([])
    session = completeBattle(session)
    const tactical = buildBattleReport(session)
    expect(tactical.winnerPlayerIds).toEqual(['p-a', 'p-c'])
    expect(tactical.ranking.map((player) => player.rank)).toEqual([1, 1, 3])
    expect(tactical.performance.awards.find((award) => award.title === 'Executioner')?.winners).toHaveLength(2)
    const war = buildBattleReport(session, 'war-chronicle')
    expect(war.narrative).not.toEqual(tactical.narrative)
    expect(war.performance).toEqual(tactical.performance)
    expect(war.narrative.join(' ')).not.toContain('centralny')
    expect(battleReportMarkdown(tactical)).toContain('remisem')
    expect(JSON.parse(JSON.stringify(tactical)).schemaVersion).toBe(1)
    expect(buildBattleReport(deserializeBattleSession(serializeBattleSession(session)))).toEqual(tactical)
  })
})
