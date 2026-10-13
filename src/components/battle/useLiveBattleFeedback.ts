import { useEffect, useRef, useState } from 'react'
import { buildBattleChronicle } from '../../domain/battle/chronicle'
import type { BattleSession } from '../../domain/battle/types'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'

export type LiveBattleFeedback = {
  id: string
  scoreDeltas: Record<string, number>
  objectiveIds: string[]
  phaseChanged: boolean
  kills: string[]
}
const EMPTY: LiveBattleFeedback = { id: '', scoreDeltas: {}, objectiveIds: [], phaseChanged: false, kills: [] }

/** Live append feedback only: reload, undo/redo and reconnect are quiet. */
export function useLiveBattleFeedback(session: BattleSession | null): LiveBattleFeedback {
  const membership = useSharedSessionStore((state) => state.membership)
  const connection = useSharedSessionStore((state) => state.connectionStatus)
  const ready = !membership || membership.battleId !== session?.setup.gameId || connection === 'connected'
  const previous = useRef<{ gameId: string; ids: string[]; seen: Set<string>; ready: boolean }>()
  const [feedback, setFeedback] = useState(EMPTY)
  useEffect(() => {
    if (!session) return
    const ids = session.state.events.map((event) => event.id)
    const last = previous.current
    if (!last || last.gameId !== session.setup.gameId) {
      previous.current = { gameId: session.setup.gameId, ids, seen: new Set(ids), ready }
      setFeedback(EMPTY)
      return
    }
    const appended = last.ids.length <= ids.length && last.ids.every((id, index) => ids[index] === id)
    const incoming = session.state.events.filter((event) => !last.seen.has(event.id))
    const fresh = new Set(incoming.filter((event) => {
      const age = Date.now() - Date.parse(event.timestamp)
      return age >= -2000 && age < 8000
    }).map((event) => event.id))
    for (const id of ids) last.seen.add(id)
    previous.current = { ...last, ids, ready }
    if (!appended || !ready || !last.ready || document.visibilityState === 'hidden' || fresh.size === 0) {
      if (!appended || !ready) setFeedback(EMPTY)
      return
    }
    const entries = buildBattleChronicle(session).filter((entry) => fresh.has(entry.id))
    const scoreDeltas: Record<string, number> = {}
    for (const entry of entries) if (entry.scorePlayerId && entry.scoreDelta) scoreDeltas[entry.scorePlayerId] = (scoreDeltas[entry.scorePlayerId] ?? 0) + entry.scoreDelta
    setFeedback({ id: incoming.at(-1)?.id ?? '', scoreDeltas, objectiveIds: entries.filter((entry) => entry.category === 'objectives' && entry.highlight && entry.objectiveId).map((entry) => entry.objectiveId!),
      phaseChanged: entries.some((entry) => entry.event.type === 'TURN_STARTED' || entry.event.type === 'PHASE_CHANGED'),
      kills: entries.filter((entry) => entry.unitChange && !entry.unitChange.destroyedBefore && entry.unitChange.destroyedAfter && !entry.unitChange.correction).map((entry) => entry.description),
    })
  }, [session, ready])
  useEffect(() => {
    if (!feedback.id) return
    const timer = window.setTimeout(() => setFeedback(EMPTY), 3500)
    return () => window.clearTimeout(timer)
  }, [feedback.id])
  return feedback
}
