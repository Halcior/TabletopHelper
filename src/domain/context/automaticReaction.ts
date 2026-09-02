import { getCurrentReactionWindow } from '../stratagems/battleIntegration'
import { getReactionOpportunity } from '../stratagems/reactionEngine'
import type { ReactionContext, ReactionPolicy, TimingTrigger } from '../stratagems/types'
import type { BattleSession } from '../battle/types'
import { selectCurrentTimingCheckpoint } from './timingContext'
import type { ContextRulesByPlayer } from './types'

export type AutomaticReactionPrompt = {
  trigger: TimingTrigger
  context: ReactionContext
  sourceEventId?: string
  eligiblePlayerIds: string[]
}

/**
 * Finds the first exact recorded timing that has a legal opponent reaction.
 * It deliberately ignores phase-level/manual fallback guesses: only triggers
 * proven by the current persisted timing checkpoint and rules records whose
 * timing guards are fully structured are allowed to pause Guided play.
 */
export function selectAutomaticReactionPrompt(
  session: BattleSession,
  rulesDataByPlayer: ContextRulesByPlayer = {},
  reactionPolicy?: ReactionPolicy,
): AutomaticReactionPrompt | null {
  if (session.setup.guidanceLevel !== 'guided' || getCurrentReactionWindow(session)) return null
  const checkpoint = selectCurrentTimingCheckpoint(session)
  if (!checkpoint) return null
  const definitionsByPlayer = Object.fromEntries(session.state.turnOrder.map((playerId) => [
    playerId,
    (rulesDataByPlayer[playerId]?.stratagems ?? [])
      .filter((record) => record.fullyAutomatedTiming && !record.manualConfirmationRequired)
      .map((record) => record.definition),
  ]))

  for (const trigger of checkpoint.triggers) {
    if (trigger === 'CUSTOM_CONFIRMATION') continue
    const opportunity = getReactionOpportunity({
      gameState: session.state,
      trigger,
      context: checkpoint.context,
      definitionsByPlayer,
      reactionPolicy,
    })
    if (!opportunity.hasReactions) continue
    return {
      trigger,
      context: checkpoint.context,
      sourceEventId: checkpoint.sourceEventId,
      eligiblePlayerIds: opportunity.eligiblePlayerIds,
    }
  }
  return null
}
