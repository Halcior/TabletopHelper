import { t as tr } from '../../features/i18n/locale'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { useBattleStore } from '../../stores/battleStore'
import { AppIcon } from '../AppIcon'
import { useSharedPresence } from './useSharedPresence'

export function SharedSessionStatus({ battleId }: { battleId: string }) {
  const navigate = useNavigate()
  const [working, setWorking] = useState(false)
  const session = useBattleStore((state) => state.session)
  const {
    configured,
    membership,
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

  const { onlineCount, seatCount } = useSharedPresence(battleId)

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
    return <Link aria-label={tr(`Open other room ${membership.roomCode}`, "Open other room {0}")} className="shared-status shared-status--idle" to={`/shared?room=${membership.roomCode}`}><AppIcon name="shared" /><span className="shared-status__copy"><span>{tr("Other room")}</span><strong>{membership.roomCode}</strong></span></Link>
  }

  if (!membership) return configured
    ? <button aria-label={working ? tr('Creating shared room') : tr('Create shared room')} className="shared-status shared-status--idle" disabled={working} onClick={() => void createLobby()} title={tr(error) ?? tr('Create a shared lobby from this battle')}><AppIcon name="shared" /><span className="shared-status__copy"><span>{tr("Multiplayer")}</span><strong>{working ? tr('Creating…') : tr('Create room')}</strong></span></button>
    : null

  const statusText = roomStartedAt === null && seatCount
    ? tr(`${onlineCount}/${seatCount} in lobby`, '{0}/{1} in lobby')
    : connectionStatus === 'connected'
      ? tr(`${onlineCount}/${seatCount} online`, '{0}/{1} online')
      : tr(connectionStatus)
  const summary = pendingEventCount
    ? tr(`${statusText} · ${pendingEventCount} queued`, '{0} · {1} queued')
    : statusText

  return <Link aria-label={tr(`Room ${membership.roomCode}, ${summary}`, "Room {0}, {1}")} className={`shared-status shared-status--${connectionStatus}`} to={`/shared?room=${membership.roomCode}`} title={tr(error) ?? undefined}>
    <AppIcon name={connectionStatus === 'connected' ? 'signal' : 'shared'} />
    <span className="shared-status__copy"><span>{tr("Room ")}{membership.roomCode}</span><strong>{summary}</strong></span>
  </Link>
}
