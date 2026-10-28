import type { BattleEvent, BattleSession } from '../domain/battle/types'

/** Match transport attribution before persistence, including an ally acting for a captain. */
export function attributeLocalSharedEvents(before: BattleSession, after: BattleSession, submitterPlayerId: string): BattleSession {
  const previousIds = new Set(before.state.events.map(event => event.id))
  return { ...after, state: { ...after.state, events: after.state.events.map(event =>
    previousIds.has(event.id) || event.derivedFromCombatId ? event : { ...event, actorPlayerId: submitterPlayerId }) } }
}

/**
 * Local battle events missing from the room creation snapshot are safe retry
 * candidates because shared_events is idempotent on (room_id, event_id).
 * This lets a browser close while offline and retry its persisted event history
 * on the next restore instead of silently losing those actions. Remote events
 * already carry their submitting actor: never retry them under a different seat.
 */
export function findRetryableLocalEvents(baseSnapshot: BattleSession, localSession: BattleSession, viewerPlayerId?: string): BattleEvent[] {
  if (baseSnapshot.setup.gameId !== localSession.setup.gameId) return []
  const snapshotIds = new Set(baseSnapshot.state.events.map((event) => event.id))
  return localSession.state.events.filter((event) => !event.derivedFromCombatId && !snapshotIds.has(event.id)
    && (!viewerPlayerId || !event.actorPlayerId || event.actorPlayerId === viewerPlayerId))
}

export function mergeCanonicalEnvelopes<T extends { sequence: number }>(current: T[], incoming: T[]): T[] {
  const bySequence = new Map(current.map((item) => [item.sequence, item]))
  for (const item of incoming) if (!bySequence.has(item.sequence)) bySequence.set(item.sequence, item)
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence)
}
