import { useEffect, useMemo, useState } from 'react'
import { participantIsOnline } from '../../multiplayer/presence'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'

export function SharedSyncWarning({ battleId }: { battleId: string }) {
  const [clock, setClock] = useState(() => Date.now())
  const {
    membership,
    participants,
    connectionStatus,
    pendingEventCount,
    lastSyncedAt,
    error,
    forceSync,
  } = useSharedSessionStore()

  useEffect(() => {
    if (!membership || membership.battleId !== battleId) return
    const timer = window.setInterval(() => setClock(Date.now()), 2000)
    return () => window.clearInterval(timer)
  }, [battleId, membership])

  const onlineCount = useMemo(
    () => participants.filter((participant) => participantIsOnline(participant, clock)).length,
    [clock, participants],
  )
  if (!membership || membership.battleId !== battleId) return null

  const lastSyncMs = lastSyncedAt ? clock - Date.parse(lastSyncedAt) : 0
  const stale = connectionStatus === 'connected' && lastSyncedAt !== null && lastSyncMs > 8_000
  const ownConnectionLost = connectionStatus === 'offline' || connectionStatus === 'reconnecting' || connectionStatus === 'error' || stale
  const commanderMissing = connectionStatus === 'connected' && onlineCount < 3
  const hasQueue = pendingEventCount > 0
  if (!ownConnectionLost && !commanderMissing && !hasQueue && connectionStatus !== 'connecting') return null

  const title = connectionStatus === 'offline'
    ? 'This phone is offline'
    : connectionStatus === 'reconnecting' || connectionStatus === 'error'
      ? 'Shared synchronization interrupted'
      : stale
        ? 'No recent confirmation from Supabase'
        : commanderMissing
          ? `Only ${onlineCount}/3 phones are online`
          : 'Connecting to the shared room'
  const detail = ownConnectionLost
    ? `Your changes stay on this phone${pendingEventCount > 0 ? ` (${pendingEventCount} queued)` : ''} and will retry automatically.`
    : commanderMissing
      ? 'Another commander may have lost network access or put the browser to sleep.'
      : hasQueue
        ? `${pendingEventCount} change${pendingEventCount === 1 ? '' : 's'} waiting to upload.`
        : 'Wait before making the first shared change.'

  return <div className={`shared-sync-warning ${ownConnectionLost ? 'shared-sync-warning--danger' : 'shared-sync-warning--warning'}`} role="alert" aria-live="assertive">
    <div><strong>{title}</strong><span>{detail}</span>{error && ownConnectionLost && <small>{error}</small>}</div>
    <button onClick={() => void forceSync()}>Retry now</button>
  </div>
}
