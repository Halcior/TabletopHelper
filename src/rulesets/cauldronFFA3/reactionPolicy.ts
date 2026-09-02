import type { ReactionPolicy, TimingStateView } from '../../domain/stratagems/types'

function latestBoundaryIndex(events: NonNullable<TimingStateView['events']>, type: string): number {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === type) return index
  }
  return -1
}

function reactionUseMatches(event: NonNullable<TimingStateView['events']>[number], input: {
  playerId: string
  stratagemId?: string
}): boolean {
  if (event.type !== 'STRATAGEM_USED' || typeof event.payload !== 'object' || event.payload === null) return false
  const payload = event.payload as Record<string, unknown>
  if (payload.playerId !== input.playerId || typeof payload.reactionWindowId !== 'string') return false
  return input.stratagemId ? payload.stratagemId === input.stratagemId : true
}

/**
 * Cauldron FFA 3 reaction limits:
 * - a player can use at most one reaction Stratagem during each opponent turn;
 * - the same reaction Stratagem can be used at most once per Battle Round.
 *
 * Only uses made through a reaction window count. Active-player uses of a
 * Stratagem that can also be reactive are intentionally not consumed here.
 */
export const cauldronReactionPolicy: ReactionPolicy = {
  canUseReaction: ({ playerId, gameState, definition }) => {
    if (playerId === gameState.activePlayerId) return true
    const events = gameState.events ?? []
    const turnStartIndex = latestBoundaryIndex(events, 'TURN_STARTED')
    const currentTurnEvents = events.slice(turnStartIndex + 1)
    if (currentTurnEvents.some((event) => reactionUseMatches(event, { playerId }))) {
      return {
        allowed: false,
        reason: 'Cauldron FFA 3 allows only one reaction Stratagem per opponent turn.',
      }
    }

    const roundStartIndex = latestBoundaryIndex(events, 'ROUND_STARTED')
    const currentRoundEvents = events.slice(roundStartIndex + 1)
    if (currentRoundEvents.some((event) => reactionUseMatches(event, {
      playerId,
      stratagemId: definition.id,
    }))) {
      return {
        allowed: false,
        reason: 'This reaction Stratagem has already been used this Battle Round.',
      }
    }

    return true
  },
}
