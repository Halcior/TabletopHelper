import type { BattleSession } from '../../domain/battle/types'
import { CAULDRON_RULESET_ID } from '../../rulesets/cauldronFFA3/constants'
import {
  getDuelConditions,
  getDuelPrimaryCommit,
  hasDuelOwnTurnCommit,
  isDuelPrimary,
  type DuelReviewWindow,
} from '../../rulesets/cauldronFFA3/duelPrimary'
import { getPrimaryTurnCommit } from '../../rulesets/cauldronFFA3/primary'
import { officialPendingReviewPlayers } from '../../rulesets/cauldronFFA3/officialSecondary'
import { getPendingEliminationChoice } from '../../rulesets/cauldronFFA3/secondary'

function hasDuelTurnReview(session: BattleSession, playerId: string) {
  return playerId === session.state.activePlayerId
    || getDuelConditions(session, playerId, 'turn').some((condition) => condition.window === 'either')
}

function pendingDuelTurnReviews(session: BattleSession) {
  return session.state.turnOrder.filter((id) => (
    hasDuelTurnReview(session, id) && !getDuelPrimaryCommit(session, id, 'turn')
  ))
}

export function getPendingEndTurnScoring(session: BattleSession) {
  const { activePlayerId, phase, status } = session.state
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID || phase !== 'END_TURN' || status !== 'active') {
    return { primary: [], secondary: [], missionActions: [], eliminationChoice: false }
  }
  const primary = isDuelPrimary(session)
    ? pendingDuelTurnReviews(session)
    : getPrimaryTurnCommit(session, activePlayerId) ? [] : [activePlayerId]
  return {
    primary,
    secondary: officialPendingReviewPlayers(session),
    missionActions: Object.values(session.state.missionActions)
      .filter((action) => action.playerId === activePlayerId && action.status === 'ACTIVE'),
    eliminationChoice: Boolean(getPendingEliminationChoice(session, activePlayerId)),
  }
}

export function getDuelPrimaryReviewWindow(session: BattleSession, playerId: string): DuelReviewWindow | undefined {
  if (session.state.status !== 'active' || !isDuelPrimary(session)) return
  const { activePlayerId, phase, round, maxRounds, turnOrder } = session.state
  if (phase === 'COMMAND' && round >= 2 && round < 5 && playerId === activePlayerId) return 'command'
  if (phase !== 'END_TURN') return

  if (round === maxRounds && round === 5 && activePlayerId === turnOrder.at(-1)
    && turnOrder.every((id) => hasDuelOwnTurnCommit(session, id))
    && pendingDuelTurnReviews(session).length === 0) return 'battle'

  if (hasDuelTurnReview(session, playerId)) return 'turn'
}
