import { buildBattleChronicle } from '../battle/chronicle'
import type { BattleSession } from '../battle/types'
import { buildBattlefieldReplay, type BattlefieldReplayFrame } from './replay'

/** A view over canonical history. Never generates a movement or an attack. */
export function battleHighlights(session: BattleSession, frames = buildBattlefieldReplay(session)): BattlefieldReplayFrame[] {
  const entries = buildBattleChronicle(session)
  const outstandingEliminations = new Map<string, string>()
  for (const entry of entries) {
    const change = entry.unitChange
    if (!change) continue
    const key = JSON.stringify([change.target.playerId, change.target.unitId])
    if (!change.destroyedAfter) outstandingEliminations.delete(key)
    else if (!change.destroyedBefore) outstandingEliminations.set(key, entry.id)
  }
  const retracted = new Set(entries.flatMap(entry => entry.event.type === 'STATE_CORRECTED' && entry.event.payload.quickUndo && entry.category !== 'other' ? [entry.event.payload.quickUndo.actionId] : []))
  const ids = new Set(entries.filter(entry => {
    if (retracted.has(entry.event.actionId) || entry.event.type === 'STATE_CORRECTED') return false
    if (entry.category === 'kills' && entry.unitChange && !entry.unitChange.destroyedBefore && entry.unitChange.destroyedAfter) {
      return outstandingEliminations.get(JSON.stringify([entry.unitChange.target.playerId, entry.unitChange.target.unitId])) === entry.id
    }
    return entry.category === 'objectives' && entry.highlight || entry.category === 'vp' && Math.abs(entry.scoreDelta ?? 0) >= 5 || entry.category === 'movement' && entry.highlight
  }).map(entry => entry.id))
  const end = session.state.status === 'completed' ? frames.at(-1)?.eventId : undefined
  if (end) ids.add(end)
  return frames.filter(frame => frame.eventId && ids.has(frame.eventId))
}
