import { describe, expect, it } from 'vitest'
import type { SharedMembership, SharedParticipant } from './types'
import { classifySeatRestore, shouldPreserveHostClaim } from './seatOwnership'

function membership(overrides: Partial<SharedMembership> = {}): SharedMembership {
  return {
    roomId: 'room-1', roomCode: 'ABC234', battleId: 'battle-1', clientId: 'client-a', playerId: 'p-a', isHost: false,
    ...overrides,
  }
}

function participant(overrides: Partial<SharedParticipant> = {}): SharedParticipant {
  return {
    id: 'participant-1', roomId: 'room-1', clientId: 'client-a', playerId: 'p-a', displayName: 'Alpha', isHost: false, isReady: false,
    lastSeenAt: new Date(1_000_000).toISOString(),
    ...overrides,
  }
}

describe('shared seat restore ownership', () => {
  it('preserves host authority only for the original browser identity', () => {
    const host = participant({ isHost: true })
    expect(shouldPreserveHostClaim(host, 'client-a')).toBe(true)
    expect(shouldPreserveHostClaim(host, 'client-b')).toBe(false)
    expect(shouldPreserveHostClaim(participant(), 'client-a')).toBe(false)
  })

  it('reuses the seat on the same browser identity', () => {
    expect(classifySeatRestore(membership(), [participant()], 1_010_000)).toBe('reuse')
  })

  it('blocks a seat that is active on another device', () => {
    expect(classifySeatRestore(membership(), [participant({ clientId: 'client-b' })], 1_010_000)).toBe('blocked')
  })

  it('reclaims a stale non-host seat', () => {
    expect(classifySeatRestore(membership(), [participant({ clientId: 'client-b' })], 1_040_000)).toBe('reclaim')
  })

  it('never silently transfers the host seat to a different client identity', () => {
    expect(classifySeatRestore(
      membership({ isHost: true }),
      [participant({ clientId: 'client-b', isHost: true })],
      1_040_000,
    )).toBe('blocked')
  })
})
