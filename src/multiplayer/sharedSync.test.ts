import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../domain/battle/engine'
import { testCauldronGame } from '../rulesets/cauldronFFA3/cauldronTestUtils'
import { findRetryableLocalEvents, mergeCanonicalEnvelopes } from './sharedSync'

describe('shared sync helpers', () => {
  it('recovers persisted local events created after the room snapshot', () => {
    const snapshot = testCauldronGame()
    const local = dispatchBattleEvent(snapshot, {
      type: 'CP_GAINED',
      payload: { playerId: 'p-a', amount: 1 },
    }, { actorPlayerId: 'p-a' })

    const retryable = findRetryableLocalEvents(snapshot, local)
    expect(retryable).toHaveLength(1)
    expect(retryable[0]).toMatchObject({ type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 1 } })
  })

  it('never republishes another commander’s canonical events under the restoring seat', () => {
    const base = testCauldronGame()
    let session = dispatchBattleEvent(base, { type: 'UNIT_TRACKING_CHANGED', payload: { enabled: true } }, { actorPlayerId: 'p-a' })
    session = dispatchBattleEvent(session, { type: 'UNIT_MAP_CHANGED', payload: { playerId: 'p-b', unitId: 'infantry', status: 'battlefield', position: { x: .2, y: .3 }, expectedRevision: null } }, { actorPlayerId: 'p-b' })
    session = dispatchBattleEvent(session, { type: 'CP_GAINED', payload: { playerId: 'p-b', amount: 1 } })
    const retry = findRetryableLocalEvents(base, session, 'p-b')
    expect(retry.map(event => event.type)).toEqual(['UNIT_MAP_CHANGED', 'CP_GAINED'])
  })

  it('does not retry events from another battle', () => {
    const snapshot = testCauldronGame()
    const local = {
      ...snapshot,
      setup: { ...snapshot.setup, gameId: 'different-battle' },
    }
    expect(findRetryableLocalEvents(snapshot, local)).toEqual([])
  })

  it('deduplicates canonical polling results by sequence and keeps order', () => {
    expect(mergeCanonicalEnvelopes(
      [{ sequence: 2, value: 'b' }],
      [{ sequence: 3, value: 'c' }, { sequence: 2, value: 'duplicate' }, { sequence: 1, value: 'a' }],
    )).toEqual([
      { sequence: 1, value: 'a' },
      { sequence: 2, value: 'b' },
      { sequence: 3, value: 'c' },
    ])
  })
})
