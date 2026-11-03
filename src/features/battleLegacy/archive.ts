import { buildBattleReport } from '../../domain/battle/battleReport'
import { rehydrateBattleSession } from '../../domain/battle/engine'
import { doublesScorekeeperId } from '../../domain/battle/doubles'
import type { BattleSession } from '../../domain/battle/types'
import type { UnitPerformance } from '../../domain/battle/unitPerformance'

export type BattleFormat = '1v1' | 'FFA' | '2v2'
export type ArchiveRecord = {
  schemaVersion: 1
  withdrawn?: boolean
  id: string
  ownerId: string
  session: BattleSession
  identities: Record<string, { id: string; label: string }>
  revision: number
  mutationId: string
}
export const battleFormat = (session: BattleSession): BattleFormat => session.setup.doubles ? '2v2' : session.setup.players.length === 2 ? '1v1' : 'FFA'
export function archiveFacts(record: ArchiveRecord) {
  let session = record.session
  let canonical = false
  try {
    if (session.state.events.some(event => event.type === 'GAME_STARTED') && session.state.events.some(event => event.type === 'GAME_ENDED')) {
      session = rehydrateBattleSession(session)
      canonical = session.state.status === 'completed'
    }
  } catch { /* Historical state remains readable; no inferred statistics. */ }
  const validScores = session.setup.turnOrder.length >= 2 && session.setup.turnOrder.every(id => session.state.players[id] && Object.values(session.state.players[id].score).every(Number.isFinite))
  const ended = [...session.state.events].reverse().find(event => event.type === 'GAME_ENDED')
  const start = session.state.events.find(event => event.type === 'GAME_STARTED')
  const elapsed = ended && start ? Date.parse(ended.timestamp) - Date.parse(start.timestamp) : NaN
  return { session, reliable: canonical && validScores && !record.withdrawn, format: battleFormat(session), endedAt: ended?.timestamp ?? session.state.updatedAt, durationMs: Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null, report: buildBattleReport(session) }
}
export function setParticipant(record: ArchiveRecord, playerId: string, identityId: string, label: string): ArchiveRecord {
  identityId = identityId.trim()
  if (!record.session.setup.players.some(player => player.id === playerId)) throw new Error('Unknown participant.')
  if (identityId && Object.entries(record.identities).some(([key, identity]) => key !== playerId && identity.id === identityId)) throw new Error('One identity cannot occupy two players in one archived battle.')
  const identities = { ...record.identities }
  if (identityId.trim()) identities[playerId] = { id: identityId.trim(), label: label.trim().slice(0, 100) || identityId.trim() }
  else delete identities[playerId]
  return { ...record, identities }
}
export type PlayerResult = { record: ArchiveRecord; playerId: string; vp: number; margin: number; result: 'win' | 'loss' | 'draw'; faction: string; army: string; date: string }
export function playerResults(records: ArchiveRecord[], identityId: string, format: BattleFormat): PlayerResult[] {
  return records.flatMap(record => {
    const facts = archiveFacts(record)
    const playerId = Object.keys(record.identities).find(id => record.identities[id].id === identityId)
    if (!facts.reliable || facts.format !== format || !playerId) return []
    const keeper = doublesScorekeeperId(facts.session.setup, playerId)
    const row = facts.report.ranking.find(row => row.playerId === keeper)
    if (!row) return []
    const enemyMax = Math.max(...facts.report.ranking.filter(row => row.playerId !== keeper).map(row => row.vp))
    const player = facts.session.setup.players.find(player => player.id === playerId)!
    return [{ record, playerId, vp: row.vp, margin: row.vp - enemyMax, result: row.rank !== 1 ? 'loss' as const : facts.report.winnerPlayerIds.length > 1 ? 'draw' as const : 'win' as const, faction: player.faction ?? facts.session.setup.armies[player.armyId ?? '']?.faction ?? 'Unknown', army: facts.session.setup.armies[player.armyId ?? '']?.name ?? 'Unknown', date: facts.endedAt }]
  }).sort((a, b) => b.date.localeCompare(a.date))
}
export function playerStatistics(results: PlayerResult[]) {
  const count = results.length
  const distribution = (key: 'faction' | 'army') => [...new Set(results.map(row => row[key]))].map(name => {
    const matches = results.filter(row => row[key] === name)
    return { name, battles: matches.length, wins: matches.filter(row => row.result === 'win').length, averageVp: matches.reduce((sum, row) => sum + row.vp, 0) / matches.length }
  }).sort((a, b) => b.battles - a.battles)
  const wins = results.filter(row => row.result === 'win').length
  return { count, wins, draws: results.filter(row => row.result === 'draw').length, losses: results.filter(row => row.result === 'loss').length, winRate: count ? wins / count : null, averageVp: count ? results.reduce((sum, row) => sum + row.vp, 0) / count : null, averageMargin: count ? results.reduce((sum, row) => sum + row.margin, 0) / count : null, factions: distribution('faction'), armies: distribution('army') }
}
export function aggregateUnits(results: PlayerResult[]) {
  const groups = new Map<string, { name: string; faction: string; battles: number; kills: number; models: number; points: number; damage: number | null; damageSamples: number; actions: number; missionVp: number | null; survived: number; deaths: number }>()
  for (const row of results) {
    const units: UnitPerformance[] = archiveFacts(row.record).report.performance.units.filter(unit => unit.playerId === row.playerId)
    // Same-named units within a roster contribute individually; survival denominator is deployments.
    for (const unit of units) {
      const key = JSON.stringify([row.faction, unit.name])
      const value = groups.get(key) ?? { name: unit.name, faction: row.faction, battles: 0, kills: 0, models: 0, points: 0, damage: null, damageSamples: 0, actions: 0, missionVp: null, survived: 0, deaths: 0 }
      value.battles++; value.kills += unit.kills; value.models += unit.modelsDestroyed; value.points += unit.enemyPointsDestroyed
      if (unit.damageDealt !== null) { value.damage = (value.damage ?? 0) + unit.damageDealt; value.damageSamples++ }
      value.actions += unit.completedMissionActions
      if (unit.missionVp !== null) value.missionVp = (value.missionVp ?? 0) + unit.missionVp
      value.survived += Number(unit.survived); value.deaths += Number(!unit.survived)
      groups.set(key, value)
    }
  }
  return [...groups.values()].sort((a, b) => b.points - a.points)
}
export function rivalryResults(records: ArchiveRecord[], identity: string, opponent: string, format: BattleFormat) {
  return playerResults(records, identity, format).filter(row => {
    const other = Object.keys(row.record.identities).find(id => row.record.identities[id].id === opponent)
    return other && doublesScorekeeperId(row.record.session.setup, other) !== doublesScorekeeperId(row.record.session.setup, row.playerId)
  }).map(row => {
    const other = Object.keys(row.record.identities).find(id => row.record.identities[id].id === opponent)!
    const facts = archiveFacts(row.record)
    return { ...row, direct: facts.report.performance.engagements.filter(e => e.attackerPlayerId === row.playerId && e.target.playerId === other || e.attackerPlayerId === other && e.target.playerId === row.playerId) }
  })
}
