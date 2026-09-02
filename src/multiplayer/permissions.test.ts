import { describe, expect, it } from 'vitest'
import type { BattleSession } from '../domain/battle/types'
import { getSharedSessionPermissions } from './permissions'
import type { SharedMembership } from './types'

function session(activePlayerId = 'p1'): BattleSession {
  return {
    setup: { gameId: 'battle-1' },
    state: {
      activePlayerId,
      players: {
        p1: { name: 'Player One' },
        p2: { name: 'Player Two' },
        p3: { name: 'Player Three' },
      },
    },
  } as unknown as BattleSession
}

function membership(playerId: string, isHost = false): SharedMembership {
  return {
    roomId: 'room-1',
    roomCode: 'ABC234',
    battleId: 'battle-1',
    clientId: `client-${playerId}`,
    playerId,
    isHost,
  }
}

describe('shared session permissions', () => {
  it('keeps local battles fully controllable', () => {
    const permissions = getSharedSessionPermissions(session(), null)
    expect(permissions.canControlTurn).toBe(true)
    expect(permissions.canManageLifecycle).toBe(true)
    expect(permissions.shared).toBe(false)
  })

  it('gives phase control to the player whose turn is active', () => {
    const permissions = getSharedSessionPermissions(session('p2'), membership('p2'))
    expect(permissions.isViewerTurn).toBe(true)
    expect(permissions.canControlTurn).toBe(true)
    expect(permissions.canManageLifecycle).toBe(false)
  })

  it('does not let the host drive another player turn', () => {
    const permissions = getSharedSessionPermissions(session('p2'), membership('p1', true))
    expect(permissions.isViewerTurn).toBe(false)
    expect(permissions.canControlTurn).toBe(false)
    expect(permissions.canManageLifecycle).toBe(true)
    expect(permissions.waitingForPlayerName).toBe('Player Two')
  })
})
