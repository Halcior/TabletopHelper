import { t as tr } from '../i18n/locale'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRosterLibrary } from '../armyLibrary/repository'
import { useRosterScope } from '../armyLibrary/scope'
import { syncArmies } from '../armyLibrary/sync'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { sharedSessionTransport } from '../../multiplayer/supabaseRestTransport'
import { errorText } from './api'

export function LobbyArmyPicker() {
  const { rows, loading } = useRosterLibrary()
  const owner = useRosterScope((s) => s.userId)
  const { membership, inspection, forceSync } = useSharedSessionStore()
  const [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const lock = useRef(false)
  if (
    !membership ||
    !inspection?.room.bringYourArmy ||
    inspection.room.startedAt
  )
    return null
  const current = inspection.rosters?.find(
    (r) =>
      r.playerId === membership.playerId && r.clientId === membership.clientId,
  )
  return (
    <section className="panel lobby-roster-picker" aria-label={tr("Your lobby army")}>
      <h2>{tr("Your army")}</h2>
      <p>
        {current
          ? tr(`${current.army.name} · ${current.army.faction} · ${current.army.totalPoints} pts`, "{0} · {1} · {2} pts")
          : tr('Choose a roster from your own library before marking Ready.')}
      </p>
      <label>
        {tr(" Saved army ")}<select
          value={selected}
          disabled={busy || loading}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">{tr("Choose your army…")}</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.army.name} · {r.army.totalPoints} {tr(" pts ")}</option>
          ))}
        </select>
      </label>
      <div className="roster-actions">
        <button
          disabled={busy || !rows.some((r) => r.id === selected)}
          onClick={() => {
            if (lock.current) return
            const army = rows.find((r) => r.id === selected)?.army
            if (!army) return
            lock.current = true
            setBusy(true)
            setError('')
            const roomId = membership.roomId
            void (async () => {
              if (owner) await syncArmies(owner)
              const now = useSharedSessionStore.getState().membership
              if (
                now?.roomId !== roomId ||
                now.clientId !== membership.clientId ||
                useRosterScope.getState().userId !== owner
              )
                throw new Error(
                  'Your account or lobby changed. Choose your army again.',
                )
              await sharedSessionTransport.stageRoster(
                roomId,
                membership.clientId,
                army,
                owner,
              )
              // Explicit inspection is needed even if the polling loop is already busy.
              const updated = await sharedSessionTransport.inspectRoom(
                membership.roomCode,
              )
              if (
                updated &&
                useSharedSessionStore.getState().membership?.roomId === roomId
              )
                useSharedSessionStore.setState({
                  inspection: updated,
                  participants: updated.participants,
                })
              await forceSync()
            })()
              .catch((e) => setError(errorText(e)))
              .finally(() => {
                lock.current = false
                setBusy(false)
              })
          }}
        >
          {busy ? tr('Selecting…') : current ? tr('Change Army') : tr('Select army')}
        </button>
        <Link className="button" to="/army-import">
          {tr(" Import another army ")}</Link>
      </div>
      {error && (
        <p role="alert" className="alert">
          {tr(error)}
        </p>
      )}
      <p className="context-note">
        {tr(" Changing your selection cancels Ready. At Start the server freezes every roster; later library edits and deletions do not change this battle. ")}</p>
    </section>
  )
}
