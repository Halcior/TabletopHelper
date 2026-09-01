import { describe, expect, it } from 'vitest'
import { participantIsActive, participantIsOnline, secondsUntilSeatReclaim } from './presence'
import type { SharedParticipant } from './types'

function participant(lastSeenAt: string): SharedParticipant {
  return {
    id: 'participant',
    roomId: 'room',
    clientId: 'client',
    playerId: 'player',
    displayName: 'Player',
    isHost: false,
    lastSeenAt,
  }
}

describe('shared presence', () => {
  const now = Date.parse('2026-09-01T15:00:30.000Z')

  it('keeps a seat reserved longer than the online badge threshold', () => {
    const recent = participant('2026-09-01T15:00:12.000Z')
    expect(participantIsOnline(recent, now)).toBe(true)
    expect(participantIsActive(recent, now)).toBe(true)

    const reconnecting = participant('2026-09-01T15:00:06.000Z')
    expect(participantIsOnline(reconnecting, now)).toBe(false)
    expect(participantIsActive(reconnecting, now)).toBe(true)
    expect(secondsUntilSeatReclaim(reconnecting, now)).toBe(6)
  })

  it('releases a stale seat after thirty seconds', () => {
    const stale = participant('2026-09-01T15:00:00.000Z')
    expect(participantIsActive(stale, now)).toBe(false)
    expect(secondsUntilSeatReclaim(stale, now)).toBe(0)
  })
})
