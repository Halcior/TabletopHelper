import { t as tr } from '../features/i18n/locale'
import { useRef, useState } from 'react'
import { cloudMediaId } from '../features/armyLibrary/identity'
import { duplicateRoster } from '../features/armyLibrary/repository'
import { useRosterScope } from '../features/armyLibrary/scope'
import { Link, useParams } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import { ArmyBanner, UnitPortrait } from '../features/factionVisuals/components'
import { useAccount } from '../features/account/store'
import { Avatar } from '../features/social/ProfilePanel'
import { useRemote } from '../features/social/hooks'
import {
  social,
  sharedArmies,
  errorText,
  type Friend,
  type Profile,
  type GameInvite,
} from '../features/social/api'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
import { CommandDialog } from '../components/ui/CommandDialog'

export default function Friends() {
  const user = useAccount((s) => s.user)
  const { friendId } = useParams()
  if (!user)
    return (
      <div className="page-shell narrow-page">
        <h1>{tr("Friends")}</h1>
        <p>{tr("Sign in to add friends and share armies.")}</p>
        <Link className="button" to="/account">
          {tr(" Sign in ")}</Link>
      </div>
    )
  return (
    <SocialScreen
      key={`${user.id}:${friendId ?? ''}`}
      owner={user.id}
      friendId={friendId}
    />
  )
}
function SocialScreen({
  owner,
  friendId,
}: {
  owner: string
  friendId?: string
}) {
  const friends = useRemote(() => social<Friend[]>(owner, 'list'), [owner])
  const invites = useRemote(
    () => social<GameInvite[]>(owner, 'invites'),
    [owner],
  )
  const armies = useRemote(
    () => (friendId ? sharedArmies(owner, friendId) : Promise.resolve([])),
    [owner, friendId],
    true,
  )
  const [code, setCode] = useState(''),
    [found, setFound] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const [remove, setRemove] = useState<Friend | null>(null)
  const lock = useRef(false)
  const membership = useSharedSessionStore((s) => s.membership)
  const started = useSharedSessionStore((s) => s.roomStartedAt)
  async function act(fn: () => Promise<unknown>, notice = '') {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await fn()
      setMessage(notice)
      await friends.refresh()
      await invites.refresh()
      if (friendId) await armies.refresh(true) // In-place refresh keeps open roster details expanded.
    } catch (e) {
      setError(errorText(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const friend = friends.data?.find(
    (f) => f.user_id === friendId && f.status === 'accepted',
  )
  const relationship = found
    ? friends.data?.find((f) => f.user_id === found.user_id)
    : undefined
  const invite = (f: Profile) =>
    act(() => {
      if (!membership?.isHost || started !== null)
        throw new Error('Create or open your host lobby first.')
      return social(
        owner,
        'invite',
        { user_id: f.user_id, room_id: membership.roomId },
        membership,
      )
    }, 'Game invitation sent.')
  return (
    <div className="page-shell social-page">
      <section className="page-intro roster-heading">
        <div>
          <span className="eyebrow">{tr("Commander network")}</span>
          <h1>
            {friendId ? (friend?.display_name ?? tr('Friend Profile')) : tr('Friends')}
          </h1>
          <p>{tr("Share selected rosters. Bring your own army to the battle.")}</p>
        </div>
        <div className="roster-actions">
          <Link className="button" to={friendId ? '/friends' : '/account'}>
            {friendId ? tr('← Friends') : tr('My Profile')}
          </Link>
          <button disabled={busy} onClick={() => void act(async () => {})}>
            {tr(" Refresh ")}</button>
        </div>
      </section>
      {(error || friends.error || invites.error) && (
        <p className="alert alert--danger" role="alert">
          {tr(error) || tr(friends.error) || tr(invites.error)}
        </p>
      )}
      {message && (
        <p role="status" className="alert">
          {tr(message)}
        </p>
      )}
      {friendId ? (
        <>
          {friends.loading && !friends.data && (
            <p role="status">{tr("Loading friend…")}</p>
          )}
          {friend && (
            <section className="panel account-panel">
              <div className="commander-identity">
                <Avatar profile={friend} />
                <div>
                  <h2>{friend.display_name}</h2>
                  <code className="friend-code">{friend.friend_code}</code>
                </div>
              </div>
              <p>{tr("Shared Armies · Read only")}</p>
              <button
                disabled={busy || !membership?.isHost || started !== null}
                onClick={() => void invite(friend)}
              >
                {tr(" Invite to Game ")}</button>
              {!membership?.isHost && (
                <Link to="/battle/setup">
                  {tr(" Create a lobby to invite this friend ")}</Link>
              )}
            </section>
          )}
          {armies.error && (
            <p role="alert" className="alert">
              {tr(armies.error)}
            </p>
          )}
          {armies.loading && <p role="status">{tr("Checking shared army access…")}</p>}
          {!armies.loading && armies.data?.length === 0 && (
            <p className="empty-state">
              {tr(" No shared armies. Private lists are visible only to their owner. ")}</p>
          )}
          {armies.data && (
            <SharedRosterList
              armies={armies.data}
              ownerName={friend?.display_name ?? 'Friend'}
              friendOwner={friendId}
            />
          )}
        </>
      ) : (
        <>
          <section className="panel account-panel">
            <h2>{tr("Add Friend")}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setFound(null)
                void act(async () => {
                  const p = await social<Profile | null>(owner, 'search', {
                    code,
                  })
                  setFound(p)
                  if (!p) throw new Error('No commander with this code.')
                })
              }}
            >
              <label>
                {tr(" Friend code ")}<input
                  required
                  autoComplete="off"
                  maxLength={36}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value)
                    setFound(null)
                  }}
                />
              </label>
              <button disabled={busy || !code.trim()}>{tr("Find commander")}</button>
            </form>
            {found && (
              <div className="social-card">
                <div className="commander-identity">
                  <Avatar profile={found} />
                  <div>
                    <strong>{found.display_name}</strong>
                    <code className="friend-code">{found.friend_code}</code>
                  </div>
                </div>
                <button
                  disabled={busy || found.user_id === owner || !!relationship}
                  onClick={() =>
                    void act(
                      () =>
                        social(owner, 'request', { user_id: found.user_id }),
                      'Friend request sent.',
                    )
                  }
                >
                  {found.user_id === owner
                    ? tr('This is you')
                    : relationship?.status === 'accepted'
                      ? tr('Friends')
                      : relationship
                        ? relationship.incoming
                          ? tr('Invitation received')
                          : tr('Invitation sent')
                        : tr('Add Friend')}
                </button>
              </div>
            )}
          </section>
          {friends.loading && !friends.data && (
            <p role="status">{tr("Loading commanders…")}</p>
          )}
          {(['accepted', 'incoming', 'sent'] as const).map((section) => {
            const list =
              friends.data?.filter((f) =>
                section === 'accepted'
                  ? f.status === 'accepted'
                  : f.status === 'pending' &&
                    f.incoming === (section === 'incoming'),
              ) ?? []
            return (
              <section className="social-section" key={section}>
                <h2>
                  {section === 'accepted'
                    ? tr('My Friends')
                    : section === 'incoming'
                      ? tr('Incoming Requests')
                      : tr('Sent Requests')}{' '}
                  · {list.length}
                </h2>
                {!list.length && (
                  <p className="empty-state">
                    {section === 'accepted'
                      ? tr('Add a commander using their friend code.')
                      : tr('No pending requests.')}
                  </p>
                )}
                <div className="roster-card-grid">
                  {list.map((f) => (
                    <article className="panel social-card" key={f.user_id}>
                      <div className="commander-identity">
                        <Avatar profile={f} />
                        <div>
                          <h3>{f.display_name}</h3>
                          <code className="friend-code">{f.friend_code}</code>
                        </div>
                      </div>
                      {section === 'accepted' ? (
                        <>
                          <span>{f.army_count} {tr(" shared armies")}</span>
                          <div className="roster-actions">
                            <Link
                              className="button"
                              to={`/friends/${f.user_id}`}
                            >
                              {tr(" View Armies ")}</Link>
                            <button
                              disabled={
                                busy || !membership?.isHost || started !== null
                              }
                              onClick={() => void invite(f)}
                            >
                              {tr(" Invite to Game ")}</button>
                          </div>
                          <details>
                            <summary>{tr("More actions")}</summary>
                            <button onClick={() => setRemove(f)}>
                              {tr(" Remove Friend ")}</button>
                          </details>
                        </>
                      ) : (
                        <div className="roster-actions">
                          {section === 'incoming' && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void act(() =>
                                  social(owner, 'accept', {
                                    user_id: f.user_id,
                                  }),
                                )
                              }
                            >
                              {tr(" Accept ")}</button>
                          )}
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act(() =>
                                social(
                                  owner,
                                  section === 'incoming' ? 'reject' : 'cancel',
                                  { user_id: f.user_id },
                                ),
                              )
                            }
                          >
                            {section === 'incoming'
                              ? tr('Decline')
                              : tr('Cancel request')}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
          <section className="social-section">
            <h2>{tr("Game Invitations")}</h2>
            {!invites.data?.length && (
              <p className="empty-state">{tr("No active lobby invitations.")}</p>
            )}
            {invites.data?.map((i) => (
              <article className="panel social-card" key={i.id}>
                <h3>
                  {i.sender_id === owner
                    ? tr('Invitation sent')
                    : tr(`${i.display_name} invited you`, "{0} invited you")}
                </h3>
                <p>
                  {tr(" Lobby ")}{i.room_code} {tr(" · expires")}{' '}
                  {new Date(i.expires_at).toLocaleTimeString()}
                </p>
                <div className="roster-actions">
                  {i.recipient_id === owner && (
                    <Link
                      className="button button--gold"
                      to={`/shared?invite=${encodeURIComponent(i.id)}`}
                    >
                      {tr(" Join ")}</Link>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(() =>
                        social(
                          owner,
                          i.recipient_id === owner
                            ? 'decline-invite'
                            : 'cancel-invite',
                          { id: i.id },
                        ),
                      )
                    }
                  >
                    {i.recipient_id === owner
                      ? tr('Decline invitation')
                      : tr('Cancel invitation')}
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      {remove && (
        <CommandDialog
          label={tr(`Remove friend: ${remove.display_name}`, "Remove friend: {0}")}
          onClose={() => setRemove(null)}
        >
          <h2>{tr("Remove ")}{remove.display_name}?</h2>
          <p>
            {tr(" Both commanders lose access to shared lists. Started battles keep their snapshots. ")}</p>
          <div className="roster-actions">
            <button autoFocus onClick={() => setRemove(null)}>
              {tr(" Cancel ")}</button>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await social(owner, 'remove', { user_id: remove.user_id })
                  setRemove(null)
                })
              }
            >
              {tr(" Confirm removal ")}</button>
          </div>
        </CommandDialog>
      )}
    </div>
  )
}
function SharedRosterList({
  armies,
  ownerName,
  friendOwner,
}: {
  armies: Army[]
  ownerName: string
  friendOwner?: string
}) {
  const owner = useRosterScope((s) => s.userId)
  const [copying, setCopying] = useState<string | null>(null)
  const [copied, setCopied] = useState<Record<string, string>>({})
  const [copyError, setCopyError] = useState<Record<string, string>>({})
  const lock = useRef(false)
  async function copyFriendArmy(army: Army) {
    if (lock.current) return
    lock.current = true
    setCopying(army.id)
    setCopyError((errors) => ({ ...errors, [army.id]: '' }))
    try {
      if (!owner) throw new Error('Sign in to save a copy of a friend’s roster.')
      // A new independent UUID and rewritten unit references, never a write to
      // the friend's remote record. Owner check guards account switches.
      const copy = await duplicateRoster(army, `${army.name} — copy from ${ownerName}`, owner)
      setCopied((current) => ({ ...current, [army.id]: copy.id }))
    } catch (error) {
      setCopyError((errors) => ({ ...errors, [army.id]: errorText(error) }))
    } finally {
      lock.current = false
      setCopying(null)
    }
  }
  return (
    <div className="roster-card-grid">
      {armies.map((army) => (
        <article className="panel library-card" key={army.id}>
          <ArmyBanner army={friendOwner?{...army,localMediaId:cloudMediaId(friendOwner,army.id)}:army} forceCustom />
          <h2>{army.name}</h2>
          <p>{ownerName} {tr(" · Read only")}</p>
          <div className="roster-actions">
            <button type="button" disabled={copying !== null} onClick={() => void copyFriendArmy(army)}>
              {copying === army.id ? tr('Copying…') : tr('Copy to My Armies')}
            </button>
            {copied[army.id] && <Link className="button" to={`/army/${encodeURIComponent(copied[army.id])}/edit`}>{tr("Open my copy")}</Link>}
          </div>
          {copied[army.id] && <p role="status">{tr("Copied to your library. The original roster remains unchanged.")}</p>}
          {copyError[army.id] && <p role="alert" className="alert alert--danger">{copyError[army.id]}</p>}
          <p>
            {army.faction} · {army.totalPoints} {tr(" pts · ")}{army.units.length} {tr(" units ")}</p>
          <p>
            {army.detachments.map((d) => d.name).join(' · ') ||
              tr('No detachment data')}
          </p>
          <details>
            <summary>{tr("View units")}</summary>
            <div className="roster-unit-list">
              {army.units.map((u) => (
                <section className="roster-unit" key={u.id}>
                  <UnitPortrait army={friendOwner ? {...army,localMediaId:cloudMediaId(friendOwner,army.id)} : army} unit={u} forceCustom />
                  <h3>
                    {u.name}
                    {u.isWarlord ? tr(' · Warlord') : ''}
                  </h3>
                  <p>
                    {u.startingModels} {tr(" models · ")}{u.points} {tr(" pts ")}</p>
                  {u.leaderOfUnitId && (
                    <p>
                      {tr(" Leads:")}{' '}
                      {army.units.find((t) => t.id === u.leaderOfUnitId)?.name}
                    </p>
                  )}
                  {u.ledByUnitIds.length > 0 && (
                    <p>
                      {tr(" Leaders:")}{' '}
                      {u.ledByUnitIds
                        .map((id) => army.units.find((t) => t.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                  {u.modelGroups.map((g, i) => (
                    <p key={i}>
                      {g.startingCount} × {g.name}
                      {g.equipment.length ? tr(` · ${g.equipment.join(', ')}`, " · {0}") : ''}
                    </p>
                  ))}
                  {u.enhancements.map((e, i) => (
                    <p key={i}>
                      {tr(" Enhancement: ")}{e.name} · {e.points} {tr(" pts ")}{e.description ? tr(` · ${e.description}`, " · {0}") : ''}
                    </p>
                  ))}
                  {u.wargear.map((w, i) => (
                    <p key={i}>
                      {w.name} · {w.points} {tr(" pts ")}</p>
                  ))}
                  <details>
                    <summary>{tr("Imported weapon profiles & abilities")}</summary>
                    {[...u.rangedWeapons, ...u.meleeWeapons].map((w, i) => (
                      <p key={i}>
                        <strong>{w.name}</strong> ·{' '}
                        {[
                          w.range,
                          w.attacks && `A ${w.attacks}`,
                          w.skill && `Skill ${w.skill}`,
                          w.strength && `S ${w.strength}`,
                          w.ap && `AP ${w.ap}`,
                          w.damage && `D ${w.damage}`,
                          ...w.keywords,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ))}
                    {u.abilities.map((a, i) => (
                      <p key={i}>
                        <strong>{a.name}</strong>
                        {a.description ? tr(` · ${a.description}`, " · {0}") : ''}
                      </p>
                    ))}
                  </details>
                </section>
              ))}
            </div>
            <p>
              {tr(" Only imported data is shown. Alternative loadouts and list legality are not verified. ")}</p>
          </details>
        </article>
      ))}
    </div>
  )
}
