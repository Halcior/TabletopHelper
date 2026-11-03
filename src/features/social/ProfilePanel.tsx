import { t as tr } from '../i18n/locale'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRosterLibrary } from '../armyLibrary/repository'
import { errorText, social, type Friend, type Profile } from './api'
import { useRemote } from './hooks'

export function Avatar({
  profile,
}: {
  profile: Pick<Profile, 'avatar' | 'display_name'>
}) {
  return (
    <span className="commander-avatar" aria-hidden="true">
      {profile.avatar || profile.display_name.slice(0, 2).toUpperCase()}
    </span>
  )
}
export function ProfilePanel({ owner }: { owner: string }) {
  const profile = useRemote(() => social<Profile>(owner, 'profile'), [owner])
  const friends = useRemote(() => social<Friend[]>(owner, 'list'), [owner])
  const { rows } = useRosterLibrary()
  const [name, setName] = useState<string | null>(null),
    [avatar, setAvatar] = useState('')
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  return (
    <section className="panel account-panel">
      <h2>{tr("Player Profile")}</h2>
      {profile.loading && !profile.data && (
        <p role="status">{tr("Loading profile…")}</p>
      )}
      {profile.error && <p role="alert">{tr(profile.error)}</p>}
      {profile.data && (
        <>
          <div className="commander-identity">
            <Avatar profile={profile.data} />
            <div>
              <h3>{profile.data.display_name}</h3>
              <code className="friend-code">{profile.data.friend_code}</code>
            </div>
          </div>
          <div className="roster-actions">
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(profile.data!.friend_code)
                  .then(() => setMessage('Code copied.'))
                  .catch((e) => setMessage(errorText(e)))
              }
            >
              {tr(" Copy friend code ")}</button>
            <button
              onClick={() => {
                setName(profile.data!.display_name)
                setAvatar(profile.data!.avatar)
              }}
            >
              {tr(" Change name / initials ")}</button>
            <Link className="button" to="/friends">
              {tr(" Friends ·")}{' '}
              {friends.data?.filter((f) => f.status === 'accepted').length ??
                '—'}
            </Link>
            <span>{rows.length} {tr(" saved armies")}</span>
          </div>
          {name !== null && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (busy) return
                setBusy(true)
                void social(owner, 'profile', { display_name: name, avatar })
                  .then(async () => {
                    setName(null)
                    await profile.refresh()
                  })
                  .catch((e) => setMessage(errorText(e)))
                  .finally(() => setBusy(false))
              }}
            >
              <label>
                {tr(" Display name ")}<input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                {tr(" Avatar initials ")}<input
                  maxLength={4}
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                />
              </label>
              <div className="roster-actions">
                <button disabled={busy || !name.trim()}>{tr("Save profile")}</button>
                <button type="button" onClick={() => setName(null)}>
                  {tr(" Cancel ")}</button>
              </div>
            </form>
          )}
        </>
      )}
      {message && <p role="status">{tr(message)}</p>}
    </section>
  )
}
