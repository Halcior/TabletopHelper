import { describe, expect, it } from 'vitest'
import { completeBattle, dispatchBattleEvent } from '../domain/battle/engine'
import { testCauldronGame } from '../rulesets/cauldronFFA3/cauldronTestUtils'
import { authorizeSharedMutation } from './sharedEventPolicy'
import type { SharedMembership } from './types'

function membership(playerId: string, isHost = false): SharedMembership {
  return {
    roomId: 'room-1',
    roomCode: 'ABC234',
    battleId: 'cauldron-test',
    clientId: `client-${playerId}`,
    playerId,
    isHost,
  }
}

describe('shared event policy', () => {
  it('lets a commander maintain their own CP even outside their turn', () => {
    const before = testCauldronGame()
    const after = dispatchBattleEvent(before, {
      type: 'CP_GAINED',
      payload: { playerId: 'p-b', amount: 1 },
    }, { actorPlayerId: 'p-b' })

    expect(authorizeSharedMutation(before, after, membership('p-b')).allowed).toBe(true)
  })

  it('blocks edits to another commander army state', () => {
    const before = testCauldronGame()
    const after = dispatchBattleEvent(before, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-a', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-b' },
    }, { actorPlayerId: 'p-b' })

    const decision = authorizeSharedMutation(before, after, membership('p-b'))
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/own player or army state/i)
  })

  it('blocks a non-active commander from advancing the phase', () => {
    const before = testCauldronGame()
    const after = dispatchBattleEvent(before, {
      type: 'PHASE_CHANGED',
      payload: { phase: 'MOVEMENT' },
    }, { actorPlayerId: 'p-b' })

    const decision = authorizeSharedMutation(before, after, membership('p-b'))
    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/Alpha/i)
  })

  it('allows the active commander to advance battle flow', () => {
    const before = testCauldronGame()
    const after = dispatchBattleEvent(before, {
      type: 'PHASE_CHANGED',
      payload: { phase: 'MOVEMENT' },
    }, { actorPlayerId: 'p-a' })

    expect(authorizeSharedMutation(before, after, membership('p-a')).allowed).toBe(true)
  })

  it('allows any seated commander to record shared objective control', () => {
    const before = testCauldronGame()
    const after = dispatchBattleEvent(before, {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    }, { actorPlayerId: 'p-b' })

    expect(authorizeSharedMutation(before, after, membership('p-b')).allowed).toBe(true)
  })

  it('reserves battle lifecycle actions for the room host', () => {
    const before = testCauldronGame()
    const after = completeBattle(before)

    expect(authorizeSharedMutation(before, after, membership('p-b', false)).allowed).toBe(false)
    expect(authorizeSharedMutation(before, after, membership('p-b', true)).allowed).toBe(true)
  })
})
