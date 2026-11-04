import { t as tr } from '../features/i18n/locale'
import { LanguageSettings } from '../features/i18n/LanguageSettings'
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
import { syncLocalCloudMedia } from '../features/factionVisuals/cloudMedia'

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
      'Imported on this device. Originals were kept. Cloud upload is queued; use Sync my existing photos to backfill custom images.',
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
      <Link to="/armies">{tr("← My Armies")}</Link>
      <section className="page-intro">
        <span className="eyebrow">{tr("Optional cloud sync")}</span>
        <h1>{tr("My Account")}</h1>
        <p>
          {tr(" Use TabletopHelper as a guest, or sign in to sync your private army lists across devices. ")}</p>
      </section>
      <section className="panel account-panel"><LanguageSettings /><Link className="button" to="/archive">{tr("Battle Archive & Statistics")}</Link><Link className="button" to="/campaigns">{tr("Narrative Campaigns")}</Link></section>
      {(error || authError) && (
        <p role="alert" className="alert alert--danger">
          {tr(error) || tr(authError)}
        </p>
      )}
      {message && (
        <p role="status" className="alert">
          {tr(message)}
        </p>
      )}
      {!ready ? (
        <p role="status">{tr("Restoring session…")}</p>
      ) : user ? (
        <>
          <ProfilePanel key={user.id} owner={user.id} />
          <section className="panel account-panel">
            <h2>{user.email ?? tr('Signed in')}</h2>
            <p>
              {tr(" Private library ·")}{' '}
              {sync.owner === user.id && sync.busy
                ? tr('Syncing…')
                : sync.owner === user.id && sync.error
                  ? tr('Pending / error — your local edits are safe')
                  : tr('Ready')}
            </p>
            {sync.owner === user.id && sync.error && (
              <p role="alert">{tr(sync.error)}</p>
            )}
            <div className="roster-actions">
              <button
                className="button"
                disabled={busy || sync.busy}
                onClick={() => void syncArmies(user.id)}
              >
                {tr(" Sync now ")}</button>
              <Link className="button" to="/armies">
                {tr(" Open My Armies ")}</Link>
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
                {tr(" Sign out ")}</button>
            </div>
          </section>
          {local.length > 0 && (
            <section
              className="panel account-panel"
              aria-label={tr("Import local rosters")}
            >
              <h2>
                {tr(" Found ")}{local.length} {tr(" local armies. Import them to your account? ")}</h2>
              <p>
                {tr(" A JSON backup will download before import. Your local originals are kept. Names are never used to merge lists. ")}</p>
              <div className="roster-actions">
                <button
                  className="button button--gold"
                  disabled={busy}
                  onClick={() =>
                    void act(() => migrate(local.map((r) => r.id)))
                  }
                >
                  {tr(" Import all ")}</button>
                <button
                  className="button"
                  onClick={() => setChoosing((c) => !c)}
                >
                  {tr(" Choose armies ")}</button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void act(() => postpone('local'))}
                >
                  {tr(" Keep local only ")}</button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void act(() => postpone('later'))}
                >
                  {tr(" Not now ")}</button>
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
                      {row.army.name} · {row.army.totalPoints} {tr(" pts ")}</label>
                  ))}
                  <button
                    className="button"
                    disabled={busy || !selected.length}
                    onClick={() => void act(() => migrate(selected))}
                  >
                    {tr(" Import selected ")}</button>
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <section className="panel account-panel">
          <h2>{tr("Guest on this device")}</h2>
          <p>
            {tr(" Import, edit and play without an account. Guest lists are stored on this device and are not synced. ")}</p>
          {!accountClient ? (
            <p>
              {tr(" Cloud accounts are not configured for this installation. The local library is ready to use. ")}</p>
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
                  {tr(" Email ")}<input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <button className="button button--gold" disabled={busy}>
                  {tr(" Send sign-in link ")}</button>
              </form>
              <details>
                <summary>{tr("Enter email code")}</summary>
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
                    {tr(" Email code ")}<input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy || !email}>
                    {tr(" Verify code ")}</button>
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
                  {tr(" Continue with Google ")}</button>
              )}
            </>
          )}
          <Link className="button" to="/armies">
            {tr(" Continue as guest ")}</Link>
        </section>
      )}
      {user && <section className="panel">
        <h2>{tr("Cloud media")}</h2>
        <p>{tr("Custom army banners and unit portraits are stored privately in Supabase Storage. Friends can see them only for armies you share with them.")}</p>
        <button type="button" disabled={busy} onClick={() => void act(async () => {
          const result = await syncLocalCloudMedia()
          setMessage(`Cloud photos synchronized: ${result.uploaded} checked, ${result.failed} failed. Images already stored in the cloud are not overwritten.`)
        })}>{tr("Sync my existing photos")}</button>
      </section>}
      <p className="context-note">{tr("Images still have an offline copy on this device. Cloud media is not included in JSON exports. Friends only see photos belonging to shared armies.")}</p>
    </div>
  )
}
