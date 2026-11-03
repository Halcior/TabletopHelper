import { buildBattleChronicle } from '../battle/chronicle'
import { buildUnitPerformance } from '../battle/unitPerformance'
import type { BattleSession } from '../battle/types'
import { buildBattlefieldReplay, type BattlefieldReplayFrame } from './replay'

/** A view over canonical history. Never generates a movement or an attack. */
export function battleHighlights(session: BattleSession, frames = buildBattlefieldReplay(session)): BattlefieldReplayFrame[] {
  const entries = buildBattleChronicle(session)
  const performance = buildUnitPerformance(session, entries)
  const retracted = new Set(entries.flatMap(entry => entry.event.type === 'STATE_CORRECTED' && entry.event.payload.quickUndo && entry.category !== 'other' ? [entry.event.payload.quickUndo.actionId] : []))
  const ids = new Set(entries.filter(entry => {
    if (retracted.has(entry.event.actionId) || entry.event.type === 'STATE_CORRECTED') return false
    if (entry.category === 'kills' && entry.unitChange && !entry.unitChange.destroyedBefore && entry.unitChange.destroyedAfter) {
      const target = performance.units.find(unit => unit.playerId === entry.unitChange!.target.playerId && unit.unitId === entry.unitChange!.target.unitId)
      return target && !target.survived && target.destructionRound === entry.round
    }
    return entry.category === 'objectives' && entry.highlight || entry.category === 'vp' && Math.abs(entry.scoreDelta ?? 0) >= 5 || entry.category === 'movement' && entry.highlight
  }).map(entry => entry.id))
  const end = session.state.status === 'completed' ? frames.at(-1)?.eventId : undefined
  if (end) ids.add(end)
  return frames.filter(frame => frame.eventId && ids.has(frame.eventId))
}
