import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'

export function SharedSessionStatus({ battleId }: { battleId: string }) {
  const {
    configured,
    membership,
    participants,
    connectionStatus,
    error,
    restoreForBattle,
  } = useSharedSessionStore()

  useEffect(() => {
    if (configured) void restoreForBattle(battleId)
  }, [battleId, configured, restoreForBattle])

  const activeCount = useMemo(() => {
    const cutoff = Date.now() - 20_000
    return participants.filter((participant) => Date.parse(participant.lastSeenAt) >= cutoff).length
  }, [participants])

  if (!membership || membership.battleId !== battleId) return configured
    ? <Link className="shared-status shared-status--idle" to="/shared"><span>Shared</span><strong>Offline</strong></Link>
    : null

  return <Link className={`shared-status shared-status--${connectionStatus}`} to="/shared" title={error ?? undefined}>
    <span>Room {membership.roomCode}</span>
    <strong>{connectionStatus === 'connected' ? `${activeCount || participants.length}/3 online` : connectionStatus}</strong>
  </Link>
}
