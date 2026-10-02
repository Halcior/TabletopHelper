import { dispatchBattleEvents, getPhaseTransitionEvents } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { cauldronEvent, getCauldronEventData } from './events'
import {
  createDeferredWyniszczenieEvents,
  getPrimaryTurnCommit,
} from './primary'
import { addSnapshotEvents } from './snapshots'
import { addSecondaryRefillEvents, createEndTurnSecondaryEvents, getSecondaryState } from './secondary'
import { isCauldronEndOfRound } from './session'
import { officialPendingReviewPlayers } from './officialSecondary'
import { getDuelConditions, getDuelPrimaryCommit, hasDuelBattleReady, hasDuelOwnTurnCommit, isDuelPrimary } from './duelPrimary'
import type { PlanConfirmation } from './types'

type RoundCommit = {
  round: number
}

export function isPrimaryCommitted(session: BattleSession, round: number): boolean {
  return getCauldronEventData<RoundCommit>(session, 'PRIMARY_COMMITTED')
    .some((commit) => commit.round === round)
}

export function confirmCauldronEndRound(
  session: BattleSession,
  _confirmations: Record<string, PlanConfirmation> = {},
): BattleSession {
  if (!isCauldronEndOfRound(session)) throw new Error('Cauldron round review is only available after the final player turn.')
  if (isPrimaryCommitted(session, session.state.round)) throw new Error('This Battle Round has already been committed.')
  if (Object.values(session.state.missionActions).some((action) => (
    action.playerId === session.state.activePlayerId && action.status === 'ACTIVE'
  ))) throw new Error('Resolve active Mission Actions before ending the turn.')
  if (getSecondaryState(session)[session.state.activePlayerId]?.pendingEliminationChoice) {
    throw new Error('Resolve the pending Secondary scoring choice before ending the turn.')
  }
  if (officialPendingReviewPlayers(session).length > 0) throw new Error('Wait for each commander to review Chapter Approved scoring before ending the round.')

  for (const playerId of session.state.turnOrder) {
    if (isDuelPrimary(session) ? !hasDuelOwnTurnCommit(session, playerId)
      || (playerId !== session.state.activePlayerId && getDuelConditions(session, playerId, 'turn').some((item) => item.window === 'either') && !getDuelPrimaryCommit(session, playerId, 'turn'))
      : !getPrimaryTurnCommit(session, playerId, session.state.round)) {
      throw new Error(`Resolve ${session.state.players[playerId]?.name ?? playerId} end-turn Primary before ending the Battle Round.`)
    }
  }
  if (isDuelPrimary(session) && session.state.round === session.state.maxRounds
    && session.state.turnOrder.some((id) => !getDuelPrimaryCommit(session, id, 'battle') || !hasDuelBattleReady(session, id))) {
    throw new Error('Review end-of-battle Primary and Battle Ready for both players.')
  }

  // This call is intentionally idempotent. In the normal UI the final player's Secondary
  // review has already run before this round review opens.
  const secondaryEvents = createEndTurnSecondaryEvents(session, session.state.activePlayerId)
  const deferredPrimaryEvents = isDuelPrimary(session) ? [] : createDeferredWyniszczenieEvents(session)
  const transitions = getPhaseTransitionEvents(session)
  const transitionWithSnapshots = addSnapshotEvents(session, transitions)

  return dispatchBattleEvents(session, [
    ...secondaryEvents,
    ...deferredPrimaryEvents,
    cauldronEvent('PRIMARY_COMMITTED', { round: session.state.round } satisfies RoundCommit),
    ...addSecondaryRefillEvents(session, transitionWithSnapshots),
  ], { actorPlayerId: session.state.activePlayerId })
}
