import { describe, expect, it } from 'vitest'
import { selectNextBattleAction } from './progression'

describe('mobile phase progression', () => {
  it('keeps Fast Mode one-tap when timing is optional', () => {
    expect(selectNextBattleAction({
      blockerCount: 0,
      flowPaused: false,
      endTurnReview: false,
      phaseEndHasTimingOpportunities: true,
      guidanceLevel: 'fast',
    })).toBe('ADVANCE_PHASE')
  })

  it('opens the timing review in Guided Mode', () => {
    expect(selectNextBattleAction({
      blockerCount: 0,
      flowPaused: false,
      endTurnReview: false,
      phaseEndHasTimingOpportunities: true,
      guidanceLevel: 'guided',
    })).toBe('OPEN_TIMING_REVIEW')
  })

  it('never advances past a blocker or open hard reaction', () => {
    expect(selectNextBattleAction({
      blockerCount: 1,
      flowPaused: true,
      endTurnReview: false,
      phaseEndHasTimingOpportunities: false,
      guidanceLevel: 'fast',
    })).toBe('FOCUS_BLOCKER')
    expect(selectNextBattleAction({
      blockerCount: 0,
      flowPaused: true,
      endTurnReview: false,
      phaseEndHasTimingOpportunities: false,
      guidanceLevel: 'fast',
    })).toBe('WAIT_REACTION')
  })
})
