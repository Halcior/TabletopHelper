import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent, rehydrateBattleSession } from '../domain/battle/engine'
import type { BattleEvent, BattleSession } from '../domain/battle/types'
import { dispatchCauldronBattleEvent } from '../rulesets/cauldronFFA3'
import { testCauldronGame } from '../rulesets/cauldronFFA3/cauldronTestUtils'
import { CAULDRON_SECONDARY_IDS } from '../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../rulesets/cauldronFFA3/secondaryTypes'
import { authorizeSharedMutation } from './sharedEventPolicy'
import { findRetryableLocalEvents } from './sharedSync'
import type { SharedEventEnvelope, SharedMembership } from './types'

function membership(playerId: string, isHost = false): SharedMembership {
  return { roomId: 'room-1', roomCode: 'ABC234', battleId: 'cauldron-test', clientId: `client-${playerId}`, playerId, isHost }
}

function rebuild(snapshot: BattleSession, canonical: SharedEventEnvelope[]): BattleSession {
  return rehydrateBattleSession({
    ...snapshot,
    state: { ...snapshot.state, events: [...snapshot.state.events, ...canonical.map(({ event }) => event)] },
    redoActions: [],
  })
}

describe('three-client shared battle flow', () => {
  it('converges after permissions, automatic scoring, offline retry and a host correction', () => {
    const deck: SecondaryId[] = ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')]
    const snapshot = testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
    let canonical: SharedEventEnvelope[] = []
    let sequence = 0

    const publish = (before: BattleSession, after: BattleSession, actor: SharedMembership) => {
      expect(authorizeSharedMutation(before, after, actor).allowed).toBe(true)
      const known = new Set(before.state.events.map((event) => event.id))
      const events = after.state.events.filter((event) => !known.has(event.id))
      canonical = [...canonical, ...events.map((event) => ({ sequence: ++sequence, roomId: actor.roomId, event, receivedAt: event.timestamp }))]
    }

    let alpha = rebuild(snapshot, canonical)
    let bravo = rebuild(snapshot, canonical)
    let charlie = rebuild(snapshot, canonical)

    let next = dispatchBattleEvent(alpha, { type: 'PHASE_CHANGED', payload: { phase: 'MOVEMENT' } }, { actorPlayerId: 'p-a' })
    publish(alpha, next, membership('p-a', true))
    alpha = rebuild(snapshot, canonical)
    bravo = rebuild(snapshot, canonical)
    charlie = rebuild(snapshot, canonical)

    const illegal = dispatchBattleEvent(bravo, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } }, { actorPlayerId: 'p-b' })
    expect(authorizeSharedMutation(bravo, illegal, membership('p-b')).allowed).toBe(false)

    next = dispatchBattleEvent(alpha, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } }, { actorPlayerId: 'p-a' })
    publish(alpha, next, membership('p-a', true))
    alpha = rebuild(snapshot, canonical)
    bravo = rebuild(snapshot, canonical)
    charlie = rebuild(snapshot, canonical)

    next = dispatchCauldronBattleEvent(bravo, {
      type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })
    publish(bravo, next, membership('p-b'))
    alpha = rebuild(snapshot, canonical)
    bravo = rebuild(snapshot, canonical)
    charlie = rebuild(snapshot, canonical)
    expect(alpha.state.players['p-a'].score.secondary).toBe(4)

    const charlieOffline = dispatchBattleEvent(charlie, { type: 'CP_GAINED', payload: { playerId: 'p-c', amount: 1 } }, { actorPlayerId: 'p-c' })
    const retry = findRetryableLocalEvents(rebuild(snapshot, canonical), charlieOffline)
    expect(retry).toHaveLength(1)
    expect(alpha.state.players['p-c'].cp).toBe(0)
    const offlineKnown = new Set(charlie.state.events.map((event) => event.id))
    const offlineEvents = charlieOffline.state.events.filter((event) => !offlineKnown.has(event.id))
    const offlineCanonical = offlineEvents.map((event: BattleEvent) => ({ sequence: ++sequence, roomId: 'room-1', event, receivedAt: event.timestamp }))
    canonical = [...canonical, ...offlineCanonical]

    alpha = rebuild(snapshot, canonical)
    bravo = rebuild(snapshot, canonical)
    charlie = rebuild(snapshot, canonical)
    expect(charlie.state.players['p-c'].cp).toBe(1)

    next = dispatchBattleEvent(alpha, {
      type: 'STATE_CORRECTED',
      payload: { correction: { kind: 'CP', playerId: 'p-b', value: 3 }, reason: 'Recovered missed CP' },
    }, { actorPlayerId: 'p-a' })
    publish(alpha, next, membership('p-a', true))

    const finalStates = [alpha, bravo, charlie].map(() => rebuild(snapshot, canonical))
    expect(finalStates.map((session) => session.state.players['p-b'].cp)).toEqual([3, 3, 3])
    expect(finalStates.map((session) => session.state.players['p-a'].score.secondary)).toEqual([4, 4, 4])
    expect(finalStates.map((session) => session.state.events.map((event) => event.id))).toEqual([
      finalStates[0].state.events.map((event) => event.id),
      finalStates[0].state.events.map((event) => event.id),
      finalStates[0].state.events.map((event) => event.id),
    ])
  })
})
