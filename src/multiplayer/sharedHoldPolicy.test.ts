import { describe, expect, it } from 'vitest'
import { createBattleSession, dispatchBattleEvent } from '../domain/battle/engine'
import {
  cancelReactionWindow,
  refineReactionHold,
  requestReactionHold,
} from '../domain/stratagems/battleIntegration'
import type { StratagemDefinitionsByPlayer } from '../domain/stratagems/types'
import { authorizeSharedMutation } from './sharedEventPolicy'
import type { SharedMembership } from './types'

const definitions: StratagemDefinitionsByPlayer = { p1: [], p2: [] }

function battle() {
  return dispatchBattleEvent(createBattleSession({
    gameId: 'shared-hold-policy',
    rulesetId: 'generic',
    guidanceLevel: 'guided',
    players: [
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Bravo' },
    ],
  }), { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
}

function membership(playerId: string): SharedMembership {
  return {
    roomId: 'room',
    roomCode: 'ABC123',
    battleId: 'shared-hold-policy',
    clientId: `client-${playerId}`,
    playerId,
    isHost: playerId === 'p1',
  }
}

describe('shared HOLD ownership', () => {
  it('allows a non-active player to request and refine their own HOLD', () => {
    const before = battle()
    const held = requestReactionHold(before, 'p2', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { holdDraft: true },
      definitionsByPlayer: definitions,
    })
    expect(authorizeSharedMutation(before, held, membership('p2'))).toEqual({ allowed: true })

    const refined = refineReactionHold(held, held.state.timing.activeReactionWindowId ?? '', 'p2', {
      trigger: 'UNIT_SELECTED_AS_TARGET',
      context: { holdDraft: false },
      definitionsByPlayer: definitions,
    })
    expect(authorizeSharedMutation(held, refined, membership('p2'))).toEqual({ allowed: true })
  })

  it('allows only the HOLD requester to cancel that shared pause', () => {
    const held = requestReactionHold(battle(), 'p2', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { holdDraft: true },
      definitionsByPlayer: definitions,
    })
    const cancelled = cancelReactionWindow(held, held.state.timing.activeReactionWindowId ?? '')
    expect(authorizeSharedMutation(held, cancelled, membership('p2'))).toEqual({ allowed: true })
    expect(authorizeSharedMutation(held, cancelled, membership('p1'))).toMatchObject({ allowed: false })
  })
})
