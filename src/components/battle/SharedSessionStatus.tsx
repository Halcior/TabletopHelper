import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { participantIsOnline } from '../../multiplayer/presence'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { useBattleStore } from '../../stores/battleStore'
import { AppIcon } from '../AppIcon'

export function SharedSessionStatus({ battleId }: { battleId: string }) {
  const navigate = useNavigate()
  const [working, setWorking] = useState(false)
  const session = useBattleStore((state) => state.session)
  const {
    configured,
    membership,
    participants,
    roomStartedAt,
    connectionStatus,
    pendingEventCount,
    error,
    restoreForBattle,
    hostCurrentBattle,
  } = useSharedSessionStore()

  useEffect(() => {
    if (configured) void restoreForBattle(battleId)
  }, [battleId, configured, restoreForBattle])

  const activeCount = useMemo(() => (
    participants.filter((participant) => participantIsOnline(participant)).length
  ), [participants])

  async function createLobby() {
    if (!session || session.setup.gameId !== battleId) return
    setWorking(true)
    try {
      const created = await hostCurrentBattle(session.state.activePlayerId)
      navigate(`/shared?room=${created.roomCode}`)
    } catch {
      // The status title uses the error exposed by the shared-session store.
    } finally {
      setWorking(false)
    }
  }

  if (membership && membership.battleId !== battleId) {
    return <Link aria-label={`Open other room ${membership.roomCode}`} className="shared-status shared-status--idle" to={`/shared?room=${membership.roomCode}`}><AppIcon name="shared" /><span className="shared-status__copy"><span>Other room</span><strong>{membership.roomCode}</strong></span></Link>
  }

  if (!membership) return configured
    ? <button aria-label={working ? 'Creating shared room' : 'Create shared room'} className="shared-status shared-status--idle" disabled={working} onClick={() => void createLobby()} title={error ?? 'Create a shared lobby from this battle'}><AppIcon name="shared" /><span className="shared-status__copy"><span>Multiplayer</span><strong>{working ? 'Creating…' : 'Create room'}</strong></span></button>
    : null

  const statusText = roomStartedAt === null
    ? `${activeCount || participants.length}/3 in lobby`
    : connectionStatus === 'connected'
      ? `${activeCount || participants.length}/3 online`
      : pendingEventCount > 0
        ? `${connectionStatus} · ${pendingEventCount} queued`
        : connectionStatus

  return <Link aria-label={`Room ${membership.roomCode}, ${statusText}`} className={`shared-status shared-status--${connectionStatus}`} to={`/shared?room=${membership.roomCode}`} title={error ?? undefined}>
    <AppIcon name={connectionStatus === 'connected' ? 'signal' : 'shared'} />
    <span className="shared-status__copy"><span>Room {membership.roomCode}</span><strong>{statusText}</strong></span>
  </Link>
}
