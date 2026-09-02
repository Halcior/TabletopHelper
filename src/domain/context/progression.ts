import type { GuidanceLevel } from '../battle/types'

export type NextBattleAction =
  | 'FOCUS_BLOCKER'
  | 'WAIT_REACTION'
  | 'OPEN_END_TURN_REVIEW'
  | 'OPEN_TIMING_REVIEW'
  | 'ADVANCE_PHASE'

export function selectNextBattleAction(input: {
  blockerCount: number
  flowPaused: boolean
  endTurnReview: boolean
  phaseEndHasTimingOpportunities: boolean
  guidanceLevel: GuidanceLevel
}): NextBattleAction {
  if (input.blockerCount > 0) return 'FOCUS_BLOCKER'
  if (input.flowPaused) return 'WAIT_REACTION'
  if (input.endTurnReview) return 'OPEN_END_TURN_REVIEW'
  if (input.phaseEndHasTimingOpportunities && input.guidanceLevel === 'guided') return 'OPEN_TIMING_REVIEW'
  return 'ADVANCE_PHASE'
}

