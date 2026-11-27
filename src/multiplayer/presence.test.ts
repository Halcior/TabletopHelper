import { describe, expect, it } from 'vitest'
import { countOnlineSeats, participantIsActive, participantIsOnline, secondsUntilSeatReclaim } from './presence'
import type { SharedParticipant } from './types'

function participant(lastSeenAt: string): SharedParticipant {
  return {
    id: 'participant',
    roomId: 'room',
    clientId: 'client',
    playerId: 'player',
    displayName: 'Player',
    isHost: false,
    isReady: false,
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

  it('counts unique online seats, excluding expired heartbeats and rows outside the format', () => {
    const recent = participant('2026-09-01T15:00:25.000Z')
    const rows = [
      { ...recent, playerId: 'a' }, { ...recent, playerId: 'a', clientId: 'previous' }, { ...recent, playerId: 'c' },
      { ...recent, playerId: 'd', lastSeenAt: '2026-09-01T15:00:10.000Z' }, { ...recent, playerId: 'unknown' },
    ]
    expect(countOnlineSeats(['a', 'b', 'c', 'd'], rows, now)).toBe(2)
    expect(countOnlineSeats(['a', 'b'], rows, now)).toBe(1)
    expect(countOnlineSeats(['a', 'b', 'c', 'd'], rows, now + 30_000)).toBe(0)
  })
})
