import type { BattleEvent, GameState } from './types'

type CorrectionEvent = Extract<BattleEvent, { type: 'STATE_CORRECTED' }>

function matchesHistory(events: readonly BattleEvent[], index: number, event: CorrectionEvent): boolean {
  const guard = event.payload.quickUndo
  if (!guard) return true
  const last = events[index - 1]
  if (last?.id !== guard.expectedLastEventId || last.actionId !== guard.actionId) return false
  // Baseline IDs are exact, ordered and collision-free. An offline inverse must
  // not restore a snapshot derived before newly inserted canonical events.
  // Old recorded corrections without a baseline retain their historical meaning.
  const baseline = guard.expectedBaselineEventIds
  return !baseline || (baseline.length === index - 1 && baseline.every((id, i) => events[i]?.id === id))
}

/** Canonical compare-and-set: stale/retried inverses remain in history as no-ops. */
export function correctionGuardMatches(state: Pick<GameState, 'events'>, event: CorrectionEvent): boolean {
  return matchesHistory(state.events, state.events.length, event)
}

export function quickCorrectionOutcomes(events: readonly BattleEvent[]) {
  const revertedActionIds = new Set<string>()
  const skippedEventIds = new Set<string>()
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event.type !== 'STATE_CORRECTED' || !event.payload.quickUndo) continue
    if (matchesHistory(events, index, event)) revertedActionIds.add(event.payload.quickUndo.actionId)
    else skippedEventIds.add(event.id)
  }
  return { revertedActionIds, skippedEventIds }
}
