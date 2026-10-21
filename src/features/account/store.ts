import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { liveQuery } from 'dexie'
import { database } from '../../persistence/storage'
import { accountClient } from './client'
import { useRosterScope } from '../armyLibrary/scope'
import { syncArmies, useSyncState } from '../armyLibrary/sync'

export const useAccount = create<{
  user: User | null
  ready: boolean
  error?: string
}>(() => ({ user: null, ready: !accountClient }))
function cachedUser(): User | null {
  // Offline cache selection only. This never supplies a network token or
  // authorizes a server request; the SDK and database RLS still do that.
  try {
    const session = JSON.parse(
      localStorage.getItem('tabletophelper-account') ?? 'null',
    )
    return typeof session?.user?.id === 'string' && session?.access_token
      ? (session.user as User)
      : null
  } catch {
    return null
  }
}
function restoreOfflineUser() {
  const user = cachedUser()
  if (!user) return
  useRosterScope.setState({ userId: user.id })
  useAccount.setState({
    user,
    ready: true,
    error:
      'Offline session: cached rosters are available. Reconnect to refresh your session and sync.',
  })
}
export function startAccount(): () => void {
  if (!accountClient) return () => {}
  let active = true
  if (!navigator.onLine) restoreOfflineUser()
  let pendingTimer: number | undefined
  let lastOutbox = ''
  const outbox = liveQuery(async () =>
    (await database.accountArmies.toArray())
      .filter((row) => row.pending)
      .map((row) => `${row.ownerId}:${row.id}:${row.changeId}`)
      .sort()
      .join('|'),
  ).subscribe({
    next: (value) => {
      if (value === lastOutbox) return
      lastOutbox = value
      window.clearTimeout(pendingTimer)
      pendingTimer = window.setTimeout(() => {
        if (active) void syncArmies()
      }, 700)
    },
    error: (reason) => {
      if (active) useAccount.setState({ error: String(reason) })
    },
  })
  const { data } = accountClient.auth.onAuthStateChange((event, session) => {
    if (!active) return
    if (
      event === 'INITIAL_SESSION' &&
      !session &&
      !navigator.onLine &&
      cachedUser()
    ) {
      restoreOfflineUser()
      return
    }
    const owner = session?.user.id ?? null
    useRosterScope.setState({ userId: owner })
    useAccount.setState({
      user: session?.user ?? null,
      ready: true,
      error: undefined,
    })
    // SDK auth callbacks must stay synchronous: avoid its internal auth lock.
    if (owner)
      queueMicrotask(() => {
        if (active) void syncArmies(owner)
      })
    else
      useSyncState.setState({
        owner: null,
        busy: false,
        error: undefined,
        lastSync: undefined,
      })
  })
  // getSession resolves redirect exchange + initial restoration and reports
  // failures without disabling the guest library.
  void accountClient.auth
    .getSession()
    .then(({ error }) => {
      if (active && error) {
        if (error.name === 'AuthRetryableFetchError' || !navigator.onLine)
          restoreOfflineUser()
        else {
          useAccount.setState({ user: null, ready: true, error: error.message })
          useRosterScope.setState({ userId: null })
        }
      }
    })
    .catch((reason) => {
      if (active) useAccount.setState({ ready: true, error: String(reason) })
    })
  const reconnect = () => {
    void syncArmies()
  }
  window.addEventListener('online', reconnect)
  const timer = window.setInterval(reconnect, 20_000)
  return () => {
    active = false
    data.subscription.unsubscribe()
    outbox.unsubscribe()
    window.clearTimeout(pendingTimer)
    window.removeEventListener('online', reconnect)
    window.clearInterval(timer)
  }
}
