import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { participantIsOnline } from '../../multiplayer/presence'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'

export function SharedSessionStatus({ battleId }: { battleId: string }) {
  const {
    configured,
    membership,
    participants,
    connectionStatus,
    pendingEventCount,
    error,
    restoreForBattle,
  } = useSharedSessionStore()

  useEffect(() => {
    if (configured) void restoreForBattle(battleId)
  }, [battleId, configured, restoreForBattle])

  const activeCount = useMemo(() => (
    participants.filter((participant) => participantIsOnline(participant)).length
  ), [participants])

  if (!membership || membership.battleId !== battleId) return configured
    ? <Link className="shared-status shared-status--idle" to="/shared"><span>Shared</span><strong>Offline</strong></Link>
    : null

  const statusText = connectionStatus === 'connected'
    ? `${activeCount || participants.length}/3 online`
    : pendingEventCount > 0
      ? `${connectionStatus} · ${pendingEventCount} queued`
      : connectionStatus

  return <Link className={`shared-status shared-status--${connectionStatus}`} to={`/shared?room=${membership.roomCode}`} title={error ?? undefined}>
    <span>Room {membership.roomCode}</span>
    <strong>{statusText}</strong>
  </Link>
}
