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
