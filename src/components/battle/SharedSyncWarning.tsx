import { t as tr } from '../../features/i18n/locale'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { useSharedPresence } from './useSharedPresence'

export function SharedSyncWarning({ battleId }: { battleId: string }) {
  const {
    membership,
    connectionStatus,
    pendingEventCount,
    pendingEventError,
    outboxError,
    lastSyncedAt,
    error,
    forceSync,
  } = useSharedSessionStore()

  const { onlineCount, seatCount, now } = useSharedPresence(battleId)
  if (!membership || membership.battleId !== battleId) return null

  const lastSyncMs = lastSyncedAt ? now - Date.parse(lastSyncedAt) : 0
  const stale = connectionStatus === 'connected' && lastSyncedAt !== null && lastSyncMs > 8_000
  const ownConnectionLost = connectionStatus === 'offline' || connectionStatus === 'reconnecting' || connectionStatus === 'error' || stale
  const commanderMissing = connectionStatus === 'connected' && onlineCount < seatCount
  const hasQueue = pendingEventCount > 0
  if (!ownConnectionLost && !commanderMissing && !hasQueue && connectionStatus !== 'connecting') return null

  let title = tr('Connecting to the shared room')
  let detail = tr('Wait before making the first shared change.')
  if (commanderMissing) {
    title = tr(`Only ${onlineCount}/${seatCount} phones are online`, 'Only {0}/{1} phones are online')
    detail = tr('Another commander may have lost network access or put the browser to sleep.')
  }
  if (hasQueue) {
    if (!commanderMissing) title = tr('Waiting for sync confirmation')
    detail = tr(`Changes awaiting confirmation: ${pendingEventCount}.`, 'Changes awaiting confirmation: {0}.')
  }
  if (ownConnectionLost) {
    title = tr(connectionStatus === 'offline' ? 'This phone is offline'
      : stale ? 'No recent confirmation from Supabase' : 'Shared synchronization interrupted')
    if (!hasQueue) detail = tr('Showing the last saved battle on this phone.')
  }
  if (pendingEventError) {
    title = tr('Some changes were rejected by the room')
    detail = tr(`Changes waiting for a retry: ${pendingEventCount}.`, 'Changes waiting for a retry: {0}.')
  }
  if (outboxError && hasQueue) detail = tr('Pending changes could not be saved on this phone. Keep this battle open until they sync.')

  return <div className={`shared-sync-warning ${ownConnectionLost || pendingEventError || outboxError ? 'shared-sync-warning--danger' : 'shared-sync-warning--warning'}`} role="alert" aria-live="assertive">
    <div><strong>{title}</strong><span>{detail}</span>{(pendingEventError || (ownConnectionLost && error)) && <small>{tr(pendingEventError ?? error)}</small>}</div>
    <button onClick={() => void forceSync()}>{tr("Retry now")}</button>
  </div>
}
