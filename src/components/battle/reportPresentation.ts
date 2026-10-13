import type { ChronicleEntry } from '../../domain/battle/chronicle'
import type { BattlefieldReplayFrame } from '../../domain/battlefield/replay'

/** Presentation metadata derived from engine replay snapshots; no new scores or events. */
export function leadChangeEventIds(frames: BattlefieldReplayFrame[]): Set<string> {
  const changes = new Set<string>()
  const leaders = (frame: BattlefieldReplayFrame) => {
    const maximum = Math.max(0, ...Object.values(frame.scores))
    return maximum > 0 ? Object.keys(frame.scores).filter((id) => frame.scores[id] === maximum).sort() : []
  }
  for (let index = 1; index < frames.length; index++) {
    const previous = leaders(frames[index - 1]), current = leaders(frames[index])
    if (frames[index].eventId && previous.length > 0 && current.length === 1 && !previous.includes(current[0])) changes.add(frames[index].eventId!)
  }
  return changes
}

export function importantChronicleEntry(entry: ChronicleEntry, leadChanges: Set<string>): boolean {
  return entry.category === 'kills' || entry.category === 'objectives' || (entry.scoreDelta ?? 0) >= 5 || leadChanges.has(entry.id) || entry.event.type === 'ROUND_STARTED' || entry.event.type === 'ROUND_ENDED' || entry.event.type === 'GAME_ENDED'
}

export function reportHighlights(entries: ChronicleEntry[], leadChanges: Set<string>): ChronicleEntry[] {
  const importance = (entry: ChronicleEntry) => entry.category === 'kills' ? 5 : leadChanges.has(entry.id) ? 4 : (entry.scoreDelta ?? 0) >= 5 ? 3 : entry.category === 'objectives' ? 2 : 1
  return entries.filter((entry) => entry.highlight && entry.category !== 'flow').map((entry, index) => ({ entry, index })).sort((a, b) => importance(b.entry) - importance(a.entry) || (b.entry.scoreDelta ?? 0) - (a.entry.scoreDelta ?? 0) || b.index - a.index).slice(0, 3).sort((a, b) => a.index - b.index).map(({ entry }) => entry)
}
