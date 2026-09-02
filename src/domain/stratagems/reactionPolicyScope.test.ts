import { describe, expect, it } from 'vitest'
import { createBattleSession, dispatchBattleEvent } from '../battle/engine'
import { getAvailableStratagems } from './timingEngine'
import type { ReactionPolicy, StratagemDefinition } from './types'

const dualUse: StratagemDefinition = {
  id: 'dual-use',
  kind: 'STRATAGEM',
  name: 'Dual Use',
  description: 'test',
  cpCost: 1,
  ownerScope: 'ANY_PLAYER',
  phases: ['SHOOTING'],
  triggers: ['UNIT_SELECTED_AS_TARGET'],
  reaction: true,
  source: 'test',
}

const denyingPolicy: ReactionPolicy = {
  canUseReaction: () => ({ allowed: false, reason: 'Reaction quota already used.' }),
}

function shootingBattle() {
  return dispatchBattleEvent(createBattleSession({
    gameId: 'reaction-policy-scope',
    rulesetId: 'generic',
    guidanceLevel: 'guided',
    createdAt: '2026-09-02T11:30:00.000Z',
    players: [
      { id: 'p1', name: 'Alpha', startingCp: 3 },
      { id: 'p2', name: 'Bravo', startingCp: 3 },
    ],
  }), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
}

describe('reaction policy scope', () => {
  it('does not apply reaction quotas to an active use of a dual-use Stratagem', () => {
    const session = shootingBattle()
    const [availability] = getAvailableStratagems({
      playerId: 'p1',
      gameState: session.state,
      trigger: 'UNIT_SELECTED_AS_TARGET',
      context: { targetPlayerId: 'p2' },
      definitions: [dualUse],
      reactionOnly: false,
      reactionPolicy: denyingPolicy,
    })
    expect(availability?.canUse).toBe(true)
    expect(availability?.reasons).toEqual([])
  })

  it('applies the policy when the same definition is evaluated as a reaction', () => {
    const session = shootingBattle()
    const [availability] = getAvailableStratagems({
      playerId: 'p2',
      gameState: session.state,
      trigger: 'UNIT_SELECTED_AS_TARGET',
      context: { targetPlayerId: 'p2' },
      definitions: [dualUse],
      reactionOnly: true,
      reactionPolicy: denyingPolicy,
    })
    expect(availability?.canUse).toBe(false)
    expect(availability?.reasons).toContain('Reaction quota already used.')
  })
})
