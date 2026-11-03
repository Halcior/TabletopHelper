import type { ArchiveRecord, BattleFormat } from '../battleLegacy/archive'
import { archiveFacts } from '../battleLegacy/archive'
import { doublesScorekeeperId } from '../../domain/battle/doubles'
import { createPortableUuid } from '../../multiplayer/uuid'

export type CampaignParticipant = { id: string; name: string; faction: string; profileId?: string }
export type SectorLocation = { id: string; name: string; description: string; type: 'planet' | 'station' | 'sector'; value: number; x: number; y: number; links: string[] }
export type CampaignRule = { winPoints: number; drawPoints: number; transferControl: boolean }
export type CampaignBattle = {
 id: string; type: 'battle'; battleId: string; sourceSignature: string; locationId: string; date: string; format: BattleFormat
 outcome: 'victory' | 'draw'; winnerIds: string[]
 scores: Array<{ participantIds: string[]; factions: string[]; vp: number }>; rounds: number
}
export type CampaignEvent = CampaignBattle | { id: string; type: 'chapter'; title: string; text: string; date: string } | { id: string; type: 'revoke'; battleId: string; reason: string; date: string }
export type Campaign = {
 schemaVersion: 1; id: string; ownerId: string; name: string; description: string; homebrew: string
 participants: CampaignParticipant[]; locations: SectorLocation[]
 rules: Record<BattleFormat, CampaignRule>; unlockNeighbours: boolean
 victory: { type: 'points' | 'locations'; target: number }; events: CampaignEvent[]
 revision: number; mutationId: string; syncedMutationId?: string
}
const NAMES = ['Vespera Prime', 'Helios Anchorage', 'Nox Reach', 'Aurelia IV', 'Cinder Station', 'Mordant Veil', 'Obsidian Gate', 'Ashfall', 'Silent Watch', 'Erebus Minor', 'Ferrum', 'Last Light']
export function createCampaign(input: { ownerId: string; name: string; description: string; participants: CampaignParticipant[]; locationCount: number; victory: Campaign['victory']; homebrew?: string; rules?: Campaign['rules']; unlockNeighbours?: boolean }): Campaign {
 if (!input.name.trim() || input.name.length > 150 || input.participants.length < 2 || input.participants.length > 6 || new Set(input.participants.map(p => p.id)).size !== input.participants.length) throw new Error('A campaign needs a name and 2–6 distinct participants.')
 if (!input.participants.every(p => p.id && p.name.trim() && p.faction.trim())) throw new Error('Each participant needs a faction and a name.')
 if (!Number.isInteger(input.locationCount) || input.locationCount < 3 || input.locationCount > 12 || !Number.isInteger(input.victory.target) || input.victory.target < 1 || input.victory.target > 1000) throw new Error('Invalid campaign size or victory target.')
 const ids = Array.from({ length: input.locationCount }, () => createPortableUuid())
 const locations = ids.map((id, i): SectorLocation => ({ id, name: NAMES[i], description: '', type: i % 3 === 1 ? 'station' : i % 3 === 2 ? 'sector' : 'planet', value: 1 + i % 3, x: ids.length === 3 ? [.25,.75,.5][i] : .17 + (i % 3) * .33, y: ids.length === 3 ? [.28,.28,.74][i] : .12 + Math.floor(i / 3) * (.76 / Math.max(1, Math.ceil(ids.length / 3) - 1)), links: ids.filter((_, j) => Math.abs(i - j) === 1 || Math.abs(i - j) === 3) }))
 const rules = input.rules ?? Object.fromEntries((['1v1', 'FFA', '2v2'] as const).map(format => [format, { winPoints: 3, drawPoints: 1, transferControl: true }])) as Campaign['rules']
 if (Object.values(rules).some(r => !Number.isInteger(r.winPoints) || !Number.isInteger(r.drawPoints) || r.winPoints < 0 || r.drawPoints < 0 || r.winPoints > 100 || r.drawPoints > 100)) throw new Error('Invalid campaign scoring rule.')
 return { schemaVersion: 1, id: createPortableUuid(), ownerId: input.ownerId, name: input.name.trim(), description: input.description.slice(0, 20000), homebrew: input.homebrew?.slice(0, 20000) ?? '', participants: structuredClone(input.participants), locations, rules: structuredClone(rules), victory: input.victory, unlockNeighbours: !!input.unlockNeighbours, events: [], revision: 0, mutationId: createPortableUuid() }
}
export function activeCampaignBattles(campaign: Campaign): CampaignBattle[] {
 const last = new Map<string, CampaignBattle>()
 for (const e of campaign.events) { if (e.type === 'battle') last.set(e.battleId, e); else if (e.type === 'revoke') last.delete(e.battleId) }
 return [...last.values()]
}
/** Copies public, aggregate results only. No raw events, rosters, cards or notes are shared. */
export function campaignBattle(campaign: Campaign, record: ArchiveRecord, locationId: string): CampaignBattle {
 const facts = archiveFacts(record)
 if (!facts.reliable) throw new Error('Only a complete, canonical battle result can affect a campaign.')
 if (!campaign.locations.some(l => l.id === locationId)) throw new Error('Unknown campaign location.')
 if (activeCampaignBattles(campaign).some(e => e.battleId === record.id)) throw new Error('This battle is already assigned to the campaign.')
 const participantIds = facts.session.setup.players.map(p => record.identities[p.id]?.id)
 if (participantIds.some(id => !id || !campaign.participants.some(p => p.id === id)) || new Set(participantIds).size !== participantIds.length) throw new Error('Link every battle participant to a distinct campaign participant first.')
 const scores = facts.report.ranking.map(row => {
  const players = facts.session.setup.players.filter(p => doublesScorekeeperId(facts.session.setup, p.id) === row.playerId)
  return { participantIds: players.map(p => record.identities[p.id].id), factions: players.map(p => p.faction ?? facts.session.setup.armies[p.armyId ?? '']?.faction ?? 'Unknown'), vp: row.vp }
 })
 const winnerIds = facts.report.ranking.filter(r => facts.report.winnerPlayerIds.includes(r.playerId)).flatMap(r => scores[facts.report.ranking.indexOf(r)].participantIds)
 const projection = campaignProjection(campaign)
 if (!projection.unlocked.includes(locationId)) throw new Error('This location is locked by the campaign rules.')
 return { id: createPortableUuid(), type: 'battle', battleId: record.id, sourceSignature: archiveSourceSignature(record), locationId, date: facts.endedAt, format: facts.format, outcome: facts.report.winnerPlayerIds.length === 1 ? 'victory' : 'draw', winnerIds, scores, rounds: facts.report.roundsPlayed }
}
export function appendCampaignEvent(campaign: Campaign, event: CampaignEvent): Campaign {
 if (campaign.events.some(e => e.id === event.id)) return campaign
 if (event.type === 'battle' && activeCampaignBattles(campaign).some(e => e.battleId === event.battleId)) return campaign
 if (event.type === 'chapter' && (!event.title.trim() || !event.text.trim())) throw new Error('A chapter needs a title and text.')
 return { ...campaign, events: [...campaign.events, structuredClone(event)], mutationId: createPortableUuid() }
}
export function campaignProjection(campaign: Campaign) {
 const control: Record<string, string[]> = Object.fromEntries(campaign.locations.map(l => [l.id, []]))
 const points: Record<string, number> = Object.fromEntries(campaign.participants.map(p => [p.id, 0]))
 const unlocked = new Set(campaign.unlockNeighbours ? [campaign.locations[0]?.id] : campaign.locations.map(l => l.id))
 const history: Array<{ eventId: string; battleId: string; locationId: string; previous: string[]; current: string[]; date: string }> = []
 const lastBattle: Record<string, CampaignBattle> = {}
 const suppressed: string[] = []
 for (const e of activeCampaignBattles(campaign)) {
  const location = campaign.locations.find(l => l.id === e.locationId)
  if (!location || !unlocked.has(location.id)) { suppressed.push(e.id); continue }
  const rule = campaign.rules[e.format]
  for (const id of e.winnerIds) if (id in points) points[id] += e.outcome === 'victory' ? rule.winPoints * location.value : rule.drawPoints
  if (e.outcome === 'victory') {
   if (rule.transferControl) { history.push({ eventId: e.id, battleId: e.battleId, locationId: e.locationId, previous: control[e.locationId], current: [...e.winnerIds], date: e.date }); control[e.locationId] = [...e.winnerIds] }
   if (campaign.unlockNeighbours) location.links.forEach(id => unlocked.add(id))
  }
  lastBattle[e.locationId] = e
 }
 const territories = Object.fromEntries(campaign.participants.map(p => [p.id, Object.values(control).filter(ids => ids.includes(p.id)).length]))
 const metric = campaign.victory.type === 'points' ? points : territories
 return { control, points, territories, suppressed, unlocked: [...unlocked], history, lastBattle, winners: campaign.participants.filter(p => metric[p.id] >= campaign.victory.target).map(p => p.id) }
}

export function archiveSourceSignature(record: ArchiveRecord): string {
 const source = JSON.stringify([record.session.state.events.map(e => e.id), Object.entries(record.identities).sort(([a], [b]) => a.localeCompare(b)).map(([id, p]) => [id, p.id]), !!record.withdrawn])
 let hash = 2166136261
 for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619)
 return (hash >>> 0).toString(16)
}
