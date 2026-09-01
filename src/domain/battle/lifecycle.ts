import { abandonBattle, completeBattle } from './engine'
import type { BattleSession } from './types'
import { getCurrentReactionWindow } from '../stratagems/battleIntegration'

export function isCurrentTurnEnded(session: BattleSession): boolean {
  let lastTurnStarted = -1
  let lastMatchingTurnEnded = -1
  session.state.events.forEach((event, index) => {
    if (event.type === 'TURN_STARTED' && event.payload.playerId === session.state.activePlayerId) lastTurnStarted = index
    if (event.type === 'TURN_ENDED' && event.payload.playerId === session.state.activePlayerId) lastMatchingTurnEnded = index
  })
  return lastMatchingTurnEnded > lastTurnStarted
}

export function getBattleCompletionBlockers(session: BattleSession): string[] {
  const window = getCurrentReactionWindow(session)
  return window?.behavior === 'HARD' && Object.values(window.responses).some((response) => response.status === 'PENDING')
    ? ['Resolve the open reaction window.']
    : []
}

export function completeGenericBattle(session: BattleSession): BattleSession {
  return completeBattle(session, getBattleCompletionBlockers(session))
}

export { abandonBattle }
