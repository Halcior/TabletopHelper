import { completeBattle } from '../../domain/battle/engine'
import { getBattleCompletionBlockers, isCurrentTurnEnded } from '../../domain/battle/lifecycle'
import type { BattleSession } from '../../domain/battle/types'
import { isPrimaryCommitted } from './roundEnd'
import { getSecondaryState } from './secondary'
import { isCauldronEndOfRound } from './session'

export function getCauldronBattleCompletionBlockers(session: BattleSession): string[] {
  const blockers = getBattleCompletionBlockers(session)
  const secondary = getSecondaryState(session)
  for (const playerId of session.state.turnOrder) {
    const player = session.state.players[playerId]
    if (secondary[playerId]?.pendingEliminationChoice) {
      blockers.push(`Resolve ${player.name}'s elimination Secondary choice.`)
    }
    const unresolvedPriority = secondary[playerId]?.active.some((card) => (
      card.cardId === 'CEL_PRIORYTETOWY'
      && !card.cardSpecificState?.priorityTargetUnitId
      && !card.cardSpecificState?.deadlineFailed
    ))
    if (unresolvedPriority) blockers.push(`Resolve ${player.name}'s Priority Target selection.`)
  }
  if (session.state.phase === 'END_TURN' && !isCurrentTurnEnded(session)) {
    blockers.push('Complete the current End Turn Review.')
  }
  if (
    session.state.round >= session.state.maxRounds
    && isCauldronEndOfRound(session)
    && !isPrimaryCommitted(session, session.state.round)
  ) blockers.push('Commit final-round Primary scoring.')
  return [...new Set(blockers)]
}

export function completeCauldronBattle(session: BattleSession): BattleSession {
  return completeBattle(session, getCauldronBattleCompletionBlockers(session))
}
