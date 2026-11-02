import type { BattleEvent, GameState } from './types'

/** Canonical compare-and-set: stale/retried inverses remain in history as no-ops. */
export function correctionGuardMatches(state: Pick<GameState, 'events'>, event: Extract<BattleEvent, { type: 'STATE_CORRECTED' }>): boolean {
  const guard = event.payload.quickUndo
  if (!guard) return true
  const last = state.events.at(-1)
  return last?.id === guard.expectedLastEventId && last.actionId === guard.actionId
}

export function quickCorrectionOutcomes(events: readonly BattleEvent[]) {
  const revertedActionIds = new Set<string>()
  const skippedEventIds = new Set<string>()
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event.type !== 'STATE_CORRECTED' || !event.payload.quickUndo) continue
    const guard = event.payload.quickUndo
    const previous = events[index - 1]
    if (previous?.id === guard.expectedLastEventId && previous.actionId === guard.actionId) revertedActionIds.add(guard.actionId)
    else skippedEventIds.add(event.id)
  }
  return { revertedActionIds, skippedEventIds }
}
