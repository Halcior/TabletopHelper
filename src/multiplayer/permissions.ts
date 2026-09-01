import type { BattleSession } from '../domain/battle/types'
import type { SharedMembership } from './types'

export type SharedSessionPermissions = {
  shared: boolean
  viewerPlayerId: string | null
  activePlayerId: string
  isViewerTurn: boolean
  canControlTurn: boolean
  canManageLifecycle: boolean
  waitingForPlayerName: string | null
}

export function getSharedSessionPermissions(
  session: BattleSession,
  membership: SharedMembership | null | undefined,
): SharedSessionPermissions {
  const activePlayerId = session.state.activePlayerId
  const shared = membership?.battleId === session.setup.gameId

  if (!shared) return {
    shared: false,
    viewerPlayerId: null,
    activePlayerId,
    isViewerTurn: true,
    canControlTurn: true,
    canManageLifecycle: true,
    waitingForPlayerName: null,
  }

  const viewerPlayerId = membership?.playerId ?? null
  const isViewerTurn = viewerPlayerId === activePlayerId
  return {
    shared: true,
    viewerPlayerId,
    activePlayerId,
    isViewerTurn,
    canControlTurn: isViewerTurn,
    canManageLifecycle: membership?.isHost === true,
    waitingForPlayerName: isViewerTurn ? null : session.state.players[activePlayerId]?.name ?? 'active player',
  }
}
