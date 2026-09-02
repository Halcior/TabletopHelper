import { describe, expect, it } from 'vitest'
import { createBattleSession, dispatchBattleEvent } from '../battle/engine'
import { requestReactionHold } from '../stratagems/battleIntegration'
import type { ReactionPolicy, StratagemDefinition } from '../stratagems/types'
import { advanceCauldronPhase } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { selectAutomaticReactionPrompt } from './automaticReaction'
import type { ContextRulesByPlayer } from './types'

const reaction: StratagemDefinition = {
  id: 'phase-start-reaction',
  kind: 'STRATAGEM',
  name: 'Phase Start Reaction',
  description: 'test',
  cpCost: 1,
  ownerScope: 'OPPONENT',
  phases: ['SHOOTING'],
  triggers: ['PHASE_START'],
  reaction: true,
  source: 'test',
}

const rules: ContextRulesByPlayer = {
  p1: { stratagems: [] },
  p2: {
    stratagems: [{
      definition: reaction,
      classification: 'REACTION',
      manualConfirmationRequired: false,
      fullyAutomatedTiming: true,
    }],
  },
}

function battle(guidanceLevel: 'guided' | 'fast' = 'guided') {
  return dispatchBattleEvent(createBattleSession({
    gameId: `automatic-reaction-${guidanceLevel}`,
    rulesetId: 'generic',
    guidanceLevel,
    players: [
      { id: 'p1', name: 'Alpha', startingCp: 3 },
      { id: 'p2', name: 'Bravo', startingCp: 3 },
    ],
  }), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
}

describe('automatic Guided reaction prompt', () => {
  it('selects an exact reaction from the persisted phase-start checkpoint', () => {
    expect(selectAutomaticReactionPrompt(battle(), rules)).toMatchObject({
      trigger: 'PHASE_START',
      eligiblePlayerIds: ['p2'],
    })
  })

  it('stays advisory in Fast Mode', () => {
    expect(selectAutomaticReactionPrompt(battle('fast'), rules)).toBeNull()
  })

  it('does not propose another window while HOLD is already open', () => {
    const session = battle()
    const held = requestReactionHold(session, 'p2', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { holdDraft: true },
      definitionsByPlayer: { p1: [], p2: [reaction] },
    })
    expect(selectAutomaticReactionPrompt(held, rules)).toBeNull()
  })

  it('respects ruleset reaction policy before prompting', () => {
    const deny: ReactionPolicy = {
      canUseReaction: () => ({ allowed: false, reason: 'quota used' }),
    }
    expect(selectAutomaticReactionPrompt(battle(), rules, deny)).toBeNull()
  })

  it('never auto-pauses for a timing that still requires table confirmation', () => {
    const manualRules: ContextRulesByPlayer = {
      p1: { stratagems: [] },
      p2: {
        stratagems: [{
          definition: {
            ...reaction,
            timingConfidence: 'REQUIRES_CONFIRMATION',
            timingConfidenceReasons: ['Source condition still needs confirmation.'],
          },
          classification: 'REACTION',
          manualConfirmationRequired: true,
          fullyAutomatedTiming: false,
        }],
      },
    }

    expect(selectAutomaticReactionPrompt(battle(), manualRules)).toBeNull()
  })

  it('can auto-pause on an explicitly recorded failed Battle-shock test', () => {
    const failedShockReaction: StratagemDefinition = {
      ...reaction,
      id: 'failed-shock-reaction',
      name: 'Failed shock reaction',
      phases: ['MOVEMENT'],
      triggers: ['BATTLESHOCK_FAILED'],
    }
    const shockRules: ContextRulesByPlayer = {
      'p-a': { stratagems: [] },
      'p-b': {
        stratagems: [{
          definition: failedShockReaction,
          classification: 'REACTION',
          manualConfirmationRequired: false,
          fullyAutomatedTiming: true,
        }],
      },
      'p-c': { stratagems: [] },
    }
    let session = advanceCauldronPhase(testCauldronGame())
    session = dispatchBattleEvent(session, {
      type: 'CP_GAINED',
      payload: { playerId: 'p-b', amount: 1 },
    }, { actorPlayerId: 'p-b' })
    session = dispatchBattleEvent(session, {
      type: 'BATTLESHOCK_TEST_RESOLVED',
      payload: { playerId: 'p-a', unitId: 'infantry', passed: false },
    }, { actorPlayerId: 'p-a' })

    expect(selectAutomaticReactionPrompt(session, shockRules)).toMatchObject({
      trigger: 'BATTLESHOCK_FAILED',
      eligiblePlayerIds: ['p-b'],
      context: { battleShockPassed: false, triggerSubjectPlayerId: 'p-a' },
    })
  })
})
