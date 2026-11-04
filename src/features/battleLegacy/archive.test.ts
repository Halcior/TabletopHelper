import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { testArmy, testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { completeBattle, dispatchBattleEvent, undoLastAction } from '../../domain/battle/engine'
import { archiveFacts, playerResults, playerStatistics, rivalryResults, aggregateUnits, setParticipant } from './archive'
import { listArchive, newArchive } from './repository'
import { saveBattle } from '../../persistence/database'
import { database } from '../../persistence/storage'
import { useRosterScope } from '../armyLibrary/scope'
import type { BattleSession } from '../../domain/battle/types'

beforeEach(async () => { useRosterScope.setState({ userId: null }); await database.battles.clear(); await database.battleArchive.clear() })
function duel() {
 const armies = [testArmy('a'), testArmy('b')]
 return createCauldronGame({ guidanceLevel: 'fast', armies, players: armies.map((army, i) => ({ id: `p-${'ab'[i]}`, name: `Player ${i}`, armyId: army.id, deploymentZone: i === 0 ? 'A' as const : 'B' as const, turnPosition: i === 0 ? 1 as const : 2 as const, operationalPlanId: 'WYNISZCZENIE' as const })) })
}
function recorded(s: BattleSession, values: number[]) {
 s.setup.turnOrder.forEach((id, index) => { s = dispatchBattleEvent(s, { type: 'SCORE_ADJUSTED', payload: { playerId: id, category: 'adjustment', delta: values[index] } }) })
 let record = newArchive(completeBattle(s), 'guest')
 s.setup.players.forEach((p, i) => { record = setParticipant(record, p.id, `identity-${i}`, p.name) })
 return record
}
it('atomically archives once across repeat save and refresh, with independent metadata', async () => {
 const record = recorded(duel(), [70, 60]); await saveBattle(record.session); await saveBattle(record.session)
 expect(await database.battleArchive.count()).toBe(1)
 const snapshot = JSON.stringify(record.session)
 expect(await listArchive()).toHaveLength(1); expect(await listArchive()).toHaveLength(1)
 expect(JSON.stringify(record.session)).toBe(snapshot)
 expect(() => setParticipant(record, 'p-b', 'identity-0', 'Duplicate')).toThrow(/two players/)
 expect(() => setParticipant(record, 'wrong', 'id', 'Name')).toThrow(/Unknown/)
})
it('keeps guest and account histories private after account changes', async () => {
 await saveBattle(completeBattle(duel())); useRosterScope.setState({ userId: 'account-a' })
 expect(await listArchive()).toHaveLength(0)
 await saveBattle(completeBattle(duel())); expect(await listArchive()).toHaveLength(1)
 useRosterScope.setState({ userId: 'account-b' }); expect(await listArchive()).toHaveLength(0)
 useRosterScope.setState({ userId: null }); expect(await listArchive()).toHaveLength(1)
})
it('distinguishes wins, losses and ties in 1v1 without mixing FFA', () => {
 const records = [recorded(duel(), [70, 60]), recorded(duel(), [60, 60]), recorded(duel(), [40, 80]), recorded(testCauldronGame(), [80, 70, 60])]
 const stats = playerStatistics(playerResults(records, 'identity-0', '1v1'))
 expect(stats).toMatchObject({ count: 3, wins: 1, draws: 1, losses: 1, averageVp: 170 / 3, averageMargin: -10 })
 expect(playerResults(records, 'unknown', '1v1')).toEqual([])
})
it('does not award an FFA head-to-head win to second place above third', () => {
 const record = recorded(testCauldronGame(), [80, 70, 60])
 const result = rivalryResults([record], 'identity-1', 'identity-2', 'FFA')
 expect(result[0].result).toBe('loss'); expect(result[0].margin).toBe(-10)
})
it('counts a teammate by the force score, excluding same-team rivalry', () => {
 const armies = ['a', 'b', 'c', 'd'].map(id => testArmy(id))
 const s = createCauldronGame({ mode: 'doubles2v2', primaryDeck: 'chapter-approved-duel', secondaryDeck: 'chapter-approved', guidanceLevel: 'fast', armies,
 players: armies.map((army, i) => ({ id: 'abcd'[i], name: army.id, armyId: army.id, deploymentZone: i < 2 ? 'A' as const : 'B' as const, turnPosition: i < 2 ? 1 as const : 2 as const, operationalPlanId: 'WYNISZCZENIE' as const })),
 doubles: { rulesVersion: 'GW-Doubles-1.0', forces: [{ id: 'one', name: 'One', memberPlayerIds: ['a', 'b'], captainPlayerId: 'a', forceDisposition: 'take-and-hold', forceType: 'convenience', warlord: { playerId: 'a', unitId: 'remainder' } }, { id: 'two', name: 'Two', memberPlayerIds: ['c', 'd'], captainPlayerId: 'c', forceDisposition: 'purge-the-foe', forceType: 'convenience', warlord: { playerId: 'c', unitId: 'remainder' } }] } })
 const record = recorded(s, [75, 65])
 expect(playerResults([record], 'identity-1', '2v2')[0]).toMatchObject({ vp: 75, result: 'win', margin: 10 })
 expect(rivalryResults([record], 'identity-1', 'identity-0', '2v2')).toEqual([])
})
it('retains incomplete history but excludes it and abandoned games from statistics', () => {
 const r = recorded(duel(), [50, 40]); r.session.state.events = []
 expect(archiveFacts(r).reliable).toBe(false); expect(playerResults([r], 'identity-0', '1v1')).toEqual([])
 const active = newArchive(duel(), 'guest'); expect(archiveFacts(active).reliable).toBe(false)
})
it('keeps unknown damage unknown and player-only kills off unit awards', () => {
 let s = dispatchBattleEvent(duel(), { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a' } })
 const r = recorded(s, [50, 40]); const units = aggregateUnits(playerResults([r], 'identity-0', '1v1'))
 expect(units.every(unit => unit.damage === null && unit.kills === 0 && unit.models === 0)).toBe(true)
})

it('withdraws a resumed battle without changing its canonical history and rearchives once', async () => {
 const ended = completeBattle(duel()); await saveBattle(ended)
 const active = undoLastAction(ended); await saveBattle(active)
 expect(await listArchive()).toHaveLength(0)
 const row = (await database.battleArchive.toArray())[0]
 expect(row.withdrawn).toBe(true); expect(row.session).toEqual(ended)
 await saveBattle(completeBattle(active)); expect(await listArchive()).toHaveLength(1)
 expect(await database.battleArchive.count()).toBe(1)
})
