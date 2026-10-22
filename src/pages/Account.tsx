import { ProfilePanel } from '../features/social/ProfilePanel'
import { useEffect, useState } from 'react'
import { liveQuery } from 'dexie'
import { Link } from 'react-router-dom'
import { accountClient, authRedirect } from '../features/account/client'
import { useAccount } from '../features/account/store'
import { database, type StoredArmy } from '../persistence/storage'
import {
  listArmies,
  migrateLocalArmies,
  migrationCandidates,
} from '../features/armyLibrary/repository'
import { syncArmies, useSyncState } from '../features/armyLibrary/sync'
import { downloadJson } from '../features/armyLibrary/download'
import { exportRosters } from '../domain/army/roster'

export default function Account() {
  const { user, ready, error: authError } = useAccount()
  const sync = useSyncState()
  const [email, setEmail] = useState(''),
    [token, setToken] = useState('')
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const [local, setLocal] = useState<StoredArmy[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [choosing, setChoosing] = useState(false)
  useEffect(() => {
    setLocal([])
    setSelected([])
    setChoosing(false)
    setError('')
    setMessage('')
    if (!user) return
    const sub = liveQuery(() => migrationCandidates(user.id)).subscribe({
      next: (rows) => setLocal(rows),
      error: (e) => setError(String(e)),
    })
    return () => sub.unsubscribe()
  }, [user?.id])
  async function act(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await fn()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  async function migrate(ids: string[]) {
    if (!user) return
    // Make a reviewable, portable backup before touching the migration queue.
    const rows = await listArmies(user.id)
    downloadJson(
      exportRosters(rows.map((r) => r.army)),
      'TabletopHelper-before-cloud-import.json',
    )
    await migrateLocalArmies(ids, user.id)
    await database.libraryPreferences.put({ ownerId: user.id })
    setMessage(
      'Imported on this device. Originals were kept. Cloud upload is queued; photos stay local.',
    )
    void syncArmies(user.id)
  }
  async function postpone(choice: 'local' | 'later') {
    if (user)
      await database.libraryPreferences.put({
        ownerId: user.id,
        localImportChoice: choice,
      })
    setMessage(
      choice === 'local'
        ? 'Existing armies stay local. You can import them here later.'
        : 'Import postponed. You can return here any time.',
    )
  }
  return (
    <div className="page-shell narrow-page account-page">
      <Link to="/armies">← My Armies</Link>
      <section className="page-intro">
        <span className="eyebrow">Optional cloud sync</span>
        <h1>My Account</h1>
        <p>
          Use TabletopHelper as a guest, or sign in to sync your private army
          lists across devices.
        </p>
      </section>
      {(error || authError) && (
        <p role="alert" className="alert alert--danger">
          {error || authError}
        </p>
      )}
      {message && (
        <p role="status" className="alert">
          {message}
        </p>
      )}
      {!ready ? (
        <p role="status">Restoring session…</p>
      ) : user ? (
        <>
          <ProfilePanel key={user.id} owner={user.id} />
          <section className="panel account-panel">
            <h2>{user.email ?? 'Signed in'}</h2>
            <p>
              Private library ·{' '}
              {sync.owner === user.id && sync.busy
                ? 'Syncing…'
                : sync.owner === user.id && sync.error
                  ? 'Pending / error — your local edits are safe'
                  : 'Ready'}
            </p>
            {sync.owner === user.id && sync.error && (
              <p role="alert">{sync.error}</p>
            )}
            <div className="roster-actions">
              <button
                className="button"
                disabled={busy || sync.busy}
                onClick={() => void syncArmies(user.id)}
              >
                Sync now
              </button>
              <Link className="button" to="/armies">
                Open My Armies
              </Link>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const result = await accountClient!.auth.signOut({
                      scope: 'local',
                    })
                    if (result.error) throw result.error
                    setMessage(
                      'Signed out on this device. Pending edits remain in the private cache for this account.',
                    )
                  })
                }
              >
                Sign out
              </button>
            </div>
          </section>
          {local.length > 0 && (
            <section
              className="panel account-panel"
              aria-label="Import local rosters"
            >
              <h2>
                Found {local.length} local armies. Import them to your account?
              </h2>
              <p>
                A JSON backup will download before import. Your local originals
                are kept. Names are never used to merge lists.
              </p>
              <div className="roster-actions">
                <button
                  className="button button--gold"
                  disabled={busy}
                  onClick={() =>
                    void act(() => migrate(local.map((r) => r.id)))
                  }
                >
                  Import all
                </button>
                <button
                  className="button"
                  onClick={() => setChoosing((c) => !c)}
                >
                  Choose armies
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void act(() => postpone('local'))}
                >
                  Keep local only
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void act(() => postpone('later'))}
                >
                  Not now
                </button>
              </div>
              {choosing && (
                <div className="account-migration-list">
                  {local.map((row) => (
                    <label key={row.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, row.id]
                              : ids.filter((id) => id !== row.id),
                          )
                        }
                      />
                      {row.army.name} · {row.army.totalPoints} pts
                    </label>
                  ))}
                  <button
                    className="button"
                    disabled={busy || !selected.length}
                    onClick={() => void act(() => migrate(selected))}
                  >
                    Import selected
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="panel account-panel">
          <h2>Guest on this device</h2>
          <p>
            Import, edit and play without an account. Guest lists are stored on
            this device and are not synced.
          </p>
          {!accountClient ? (
            <p>
              Cloud accounts are not configured for this installation. The local
              library is ready to use.
            </p>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void act(async () => {
                    const { error } = await accountClient!.auth.signInWithOtp({
                      email,
                      options: { emailRedirectTo: authRedirect() },
                    })
                    if (error) throw error
                    setMessage(
                      'Check your email for a sign-in link. Open it in this browser. If the email includes a code, enter it below.',
                    )
                  })
                }}
              >
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <button className="button button--gold" disabled={busy}>
                  Send sign-in link
                </button>
              </form>
              <details>
                <summary>Enter email code</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void act(async () => {
                      const { error } = await accountClient!.auth.verifyOtp({
                        email,
                        token,
                        type: 'email',
                      })
                      if (error) throw error
                    })
                  }}
                >
                  <label>
                    Email code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy || !email}>
                    Verify code
                  </button>
                </form>
              </details>
              {import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true' && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const { error } =
                        await accountClient!.auth.signInWithOAuth({
                          provider: 'google',
                          options: { redirectTo: authRedirect() },
                        })
                      if (error) throw error
                    })
                  }
                >
                  Continue with Google
                </button>
              )}
            </>
          )}
          <Link className="button" to="/armies">
            Continue as guest
          </Link>
        </section>
      )}
      <p className="context-note">
        Miniature photos remain on this device and are not part of cloud sync or
        JSON exports. Battle snapshots and multiplayer seats keep their existing
        behaviour.
      </p>
    </div>
  )
}
