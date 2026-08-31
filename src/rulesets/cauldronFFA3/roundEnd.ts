import { dispatchBattleEvents, getPhaseTransitionEvents } from '../../domain/battle/engine'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { cauldronEvent, getCauldronEventData } from './events'
import { buildPrimaryReview } from './primary'
import { addSnapshotEvents } from './snapshots'
import { isCauldronEndOfRound } from './session'
import type { PlanConfirmation, PrimaryRoundResult } from './types'

type PrimaryCommit = {
  round: number
  reviews: PrimaryRoundResult[]
  confirmations: Record<string, PlanConfirmation>
}

export function isPrimaryCommitted(session: BattleSession, round: number): boolean {
  return getCauldronEventData<PrimaryCommit>(session, 'PRIMARY_COMMITTED')
    .some((commit) => commit.round === round)
}

export function confirmCauldronEndRound(
  session: BattleSession,
  confirmations: Record<string, PlanConfirmation> = {},
): BattleSession {
  if (!isCauldronEndOfRound(session)) throw new Error('Cauldron round review is only available after the final player turn.')
  if (isPrimaryCommitted(session, session.state.round)) throw new Error('Primary has already been committed for this Battle Round.')
  const reviews = buildPrimaryReview(session, confirmations)
  if (session.state.round >= 2 && reviews.some((review) => review.planEvaluation.status === 'REQUIRES_CONFIRMATION')) {
    throw new Error('Answer all required Operational Plan confirmations before ending the round.')
  }

  const scoringEvents: BattleEventInput[] = reviews.flatMap((review) => (
    review.roundPrimary > 0
      ? [{
        type: 'SCORE_ADJUSTED' as const,
        payload: { playerId: review.playerId, category: 'primary' as const, delta: review.roundPrimary },
      }]
      : []
  ))
  const transitions = getPhaseTransitionEvents(session)
  return dispatchBattleEvents(session, [
    ...scoringEvents,
    cauldronEvent('PRIMARY_COMMITTED', {
      round: session.state.round,
      reviews,
      confirmations,
    } satisfies PrimaryCommit),
    ...addSnapshotEvents(session, transitions),
  ], { actorPlayerId: session.state.activePlayerId })
}
