import { dispatchBattleEvents } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import { createPrimaryTurnCommitEvents } from './primary'
import { createEndTurnSecondaryEvents } from './secondary'
import type { EndTurnSecondaryConfirmations } from './secondaryTypes'

export * from './secondary'

/**
 * Hotfix 2.1.1 uses one end-turn scoring window. Secondary and the active player's
 * Primary are committed together after Mission Actions/end-turn effects are resolved.
 */
export function evaluateEndTurnSecondaries(
  session: BattleSession,
  playerId: string,
  confirmation: EndTurnSecondaryConfirmations = {},
): BattleSession {
  const secondaryEvents = createEndTurnSecondaryEvents(session, playerId, confirmation)
  const primaryEvents = createPrimaryTurnCommitEvents(session, playerId, confirmation)
  const events = [...secondaryEvents, ...primaryEvents]
  return events.length === 0
    ? session
    : dispatchBattleEvents(session, events, { actorPlayerId: playerId })
}
