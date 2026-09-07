import { describe, expect, it } from 'vitest'
import type { SharedParticipant } from './types'
import { canStartSharedLobby, sharedBattleHasStarted, sharedLobbyNotReadyMessage, summarizeSharedLobby } from './sharedLobby'

const NOW = Date.parse('2026-09-03T12:00:00.000Z')
const FFA_PLAYERS = ['player-a', 'player-b', 'player-c']
const DUEL_PLAYERS = ['player-a', 'player-b']

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

describe('shared lobby', () => {
  it('keeps the battle blocked until the start state is known and confirmed', () => {
    expect(sharedBattleHasStarted(undefined)).toBe(false)
    expect(sharedBattleHasStarted(null)).toBe(false)
    expect(sharedBattleHasStarted('')).toBe(false)
    expect(sharedBattleHasStarted('2026-09-03T12:00:00.000Z')).toBe(true)
  })

  it('starts FFA only after all three online phones are ready and survives a reconnect', () => {
    const joined = FFA_PLAYERS.map((playerId) => phone(playerId))
    expect(summarizeSharedLobby(FFA_PLAYERS, joined, NOW)).toMatchObject({
      seatCount: 3,
      onlineCount: 3,
      readyCount: 0,
      allReady: false,
    })

    const ready = joined.map((participant) => ({ ...participant, isReady: true }))
    expect(canStartSharedLobby(true, FFA_PLAYERS, ready, NOW)).toBe(true)
    expect(canStartSharedLobby(false, FFA_PLAYERS, ready, NOW)).toBe(false)

    const disconnected = ready.map((participant) => participant.playerId === 'player-c'
      ? { ...participant, lastSeenAt: new Date(NOW - 21_000).toISOString() }
      : participant)
    expect(summarizeSharedLobby(FFA_PLAYERS, disconnected, NOW)).toMatchObject({
      onlineCount: 2,
      readyCount: 2,
      allSeatsOnline: false,
      allReady: false,
    })

    const reconnected = disconnected.map((participant) => participant.playerId === 'player-c'
      ? { ...participant, lastSeenAt: new Date(NOW).toISOString() }
      : participant)
    expect(canStartSharedLobby(true, FFA_PLAYERS, reconnected, NOW)).toBe(true)
  })

  it('starts a Duel as soon as both online seats are ready', () => {
    const ready = DUEL_PLAYERS.map((playerId) => phone(playerId, true))
    expect(summarizeSharedLobby(DUEL_PLAYERS, ready, NOW)).toMatchObject({
      seatCount: 2,
      onlineCount: 2,
      readyCount: 2,
      allSeatsOnline: true,
      allReady: true,
    })
    expect(canStartSharedLobby(true, DUEL_PLAYERS, ready, NOW)).toBe(true)
    expect(sharedLobbyNotReadyMessage(DUEL_PLAYERS)).toBe('All 2 player seats must be online and ready before starting.')
    expect(sharedLobbyNotReadyMessage(FFA_PLAYERS)).toBe('All 3 player seats must be online and ready before starting.')
  })
})
