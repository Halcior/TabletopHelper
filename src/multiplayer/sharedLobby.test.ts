import { describe, expect, it } from 'vitest'
import type { SharedParticipant } from './types'
import { canStartSharedLobby, summarizeSharedLobby } from './sharedLobby'

const NOW = Date.parse('2026-09-03T12:00:00.000Z')
const PLAYERS = ['player-a', 'player-b', 'player-c']

function phone(playerId: string, ready = false, seenAt = NOW): SharedParticipant {
  return {
    id: `seat-${playerId}`,
    roomId: 'room-1',
    clientId: `phone-${playerId}`,
    playerId,
    displayName: playerId,
    isHost: playerId === 'player-a',
    isReady: ready,
    lastSeenAt: new Date(seenAt).toISOString(),
  }
}

describe('three-phone shared lobby', () => {
  it('starts only after all three online phones are ready and survives a reconnect', () => {
    const joined = PLAYERS.map((playerId) => phone(playerId))
    expect(summarizeSharedLobby(PLAYERS, joined, NOW)).toMatchObject({
      seatCount: 3,
      onlineCount: 3,
      readyCount: 0,
      allReady: false,
    })

    const ready = joined.map((participant) => ({ ...participant, isReady: true }))
    expect(canStartSharedLobby(true, PLAYERS, ready, NOW)).toBe(true)
    expect(canStartSharedLobby(false, PLAYERS, ready, NOW)).toBe(false)

    const disconnected = ready.map((participant) => participant.playerId === 'player-c'
      ? { ...participant, lastSeenAt: new Date(NOW - 21_000).toISOString() }
      : participant)
    expect(summarizeSharedLobby(PLAYERS, disconnected, NOW)).toMatchObject({
      onlineCount: 2,
      readyCount: 2,
      allSeatsOnline: false,
      allReady: false,
    })

    const reconnected = disconnected.map((participant) => participant.playerId === 'player-c'
      ? { ...participant, lastSeenAt: new Date(NOW).toISOString() }
      : participant)
    expect(canStartSharedLobby(true, PLAYERS, reconnected, NOW)).toBe(true)
  })
})
