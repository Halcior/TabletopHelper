import type { BattleEvent, BattleSession } from '../domain/battle/types'

/**
 * Local battle events missing from the room creation snapshot are safe retry
 * candidates because shared_events is idempotent on (room_id, event_id).
 * This lets a browser close while offline and retry its persisted event history
 * on the next restore instead of silently losing those actions.
 */
export function findRetryableLocalEvents(baseSnapshot: BattleSession, localSession: BattleSession): BattleEvent[] {
  if (baseSnapshot.setup.gameId !== localSession.setup.gameId) return []
  const snapshotIds = new Set(baseSnapshot.state.events.map((event) => event.id))
  return localSession.state.events.filter((event) => !snapshotIds.has(event.id))
}

export function mergeCanonicalEnvelopes<T extends { sequence: number }>(current: T[], incoming: T[]): T[] {
  const bySequence = new Map(current.map((item) => [item.sequence, item]))
  for (const item of incoming) if (!bySequence.has(item.sequence)) bySequence.set(item.sequence, item)
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence)
}
