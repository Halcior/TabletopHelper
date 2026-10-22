import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from '../account/store'
import { useRemote } from './hooks'
import { errorText, social, type Friend } from './api'
import type { SharedMembership } from '../../multiplayer/types'

export function LobbyFriendInvites({
  membership,
}: {
  membership: SharedMembership
}) {
  const user = useAccount((s) => s.user)
  if (!user) return <Link to="/account">Sign in to invite friends</Link>
  return <Invites key={user.id} owner={user.id} membership={membership} />
}
function Invites({
  owner,
  membership,
}: {
  owner: string
  membership: SharedMembership
}) {
  const friends = useRemote(() => social<Friend[]>(owner, 'list'), [owner])
  const [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  return (
    <section className="lobby-roster-picker">
      <h3>Invite a friend</h3>
      <label>
        Friend
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose a commander…</option>
          {friends.data
            ?.filter((f) => f.status === 'accepted')
            .map((f) => (
              <option key={f.user_id} value={f.user_id}>
                {f.display_name}
              </option>
            ))}
        </select>
      </label>
      <button
        disabled={busy || !selected}
        onClick={() => {
          setBusy(true)
          setMessage('')
          void social(
            owner,
            'invite',
            { user_id: selected, room_id: membership.roomId },
            membership,
          )
            .then(() => setMessage('Game invitation sent.'))
            .catch((e) => setMessage(errorText(e)))
            .finally(() => setBusy(false))
        }}
      >
        Invite to Game
      </button>
      {(message || friends.error) && (
        <p role="status">{message || friends.error}</p>
      )}
      <Link to="/friends">Manage friends & invitations</Link>
    </section>
  )
}
