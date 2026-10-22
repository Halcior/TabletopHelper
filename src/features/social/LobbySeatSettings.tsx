import { useEffect, useRef, useState } from 'react'
import { useRosterScope } from '../armyLibrary/scope'
import { getCauldronConfig, DISPOSITIONS, DISPOSITION_NAMES, DUEL_MISSIONS, DUEL_PRIMARY_MATRIX } from '../../rulesets/cauldronFFA3'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { sharedSessionTransport } from '../../multiplayer/supabaseRestTransport'
import { errorText } from './api'

/** The seat holder, not the host, supplies their identity and official Primary choice. */
export function LobbySeatSettings() {
  const owner = useRosterScope(s => s.userId)
  const { membership, inspection, participants, forceSync } = useSharedSessionStore()
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const room = inspection?.room
  const playerId = membership?.playerId
  const participant = participants.find(p => p.playerId === playerId && p.clientId === membership?.clientId)
  const config = room ? getCauldronConfig(room.sessionSnapshot) : null
  const official = config?.primaryDeck === 'chapter-approved-duel'
  const force = room?.sessionSnapshot.setup.doubles?.forces.find(f => f.captainPlayerId === playerId)
  const captainRequired = Boolean(official && (!room?.sessionSnapshot.setup.doubles || force))
  const remoteChoice = participant?.forceDisposition ?? ''
  const seatKey = membership ? `${membership.roomId}:${membership.clientId}` : ''

  useEffect(() => setChoice(remoteChoice), [remoteChoice, seatKey])

  async function revalidate(roomId: string, roomCode: string) {
    const updated = await sharedSessionTransport.inspectRoom(roomCode)
    const active = useSharedSessionStore.getState().membership
    if (updated && active?.roomId === roomId && active.clientId === membership?.clientId) {
      useSharedSessionStore.setState({
        inspection: updated,
        participants: updated.participants,
      })
    }
    await forceSync()
  }

  // Authenticate the nickname from player_profiles. The server derives it from
  // auth.uid(); no user-supplied name is ever trusted for this online path.
  useEffect(() => {
    if (!owner || !membership || !room?.bringYourArmy || room.startedAt) return
    let active = true
    void sharedSessionTransport.setSeatSettings(membership.roomId, membership.clientId, null, owner)
      .then(() => { if (active) return revalidate(membership.roomId, membership.roomCode) })
      .catch(e => { if (active) setError(errorText(e)) })
    return () => { active = false }
  }, [owner, seatKey, room?.bringYourArmy, room?.startedAt])

  async function confirm() {
    if (!membership || !captainRequired || !DISPOSITIONS.includes(choice as typeof DISPOSITIONS[number]) || lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await sharedSessionTransport.setSeatSettings(membership.roomId, membership.clientId, choice, owner)
      await revalidate(membership.roomId, membership.roomCode)
    } catch (e) {
      setError(errorText(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  if (!membership || !room?.bringYourArmy || room.startedAt) return null

  const opposingForce = room.sessionSnapshot.setup.doubles?.forces.find(f => f.captainPlayerId !== playerId)
  const opposingChoice = opposingForce
    ? participants.find(p => p.playerId === opposingForce.captainPlayerId)?.forceDisposition
    : participants.find(p => p.playerId !== playerId)?.forceDisposition
  const mission = captainRequired && remoteChoice && opposingChoice
    ? DUEL_MISSIONS[DUEL_PRIMARY_MATRIX[remoteChoice as typeof DISPOSITIONS[number]][opposingChoice as typeof DISPOSITIONS[number]]]
    : undefined

  return <section className="panel lobby-seat-settings" aria-label="Your player settings">
    <h2>Your player profile and mission</h2>
    <p>Playing as: <strong>{participant?.displayName ?? 'Loading profile…'}</strong>{owner ? ' · account profile' : ' · guest'}</p>
    {captainRequired && <>
      <label>Force Disposition
        <select value={choice} disabled={busy} onChange={event => setChoice(event.target.value)}>
          <option value="">Choose your Force Disposition…</option>
          {DISPOSITIONS.map(id => <option key={id} value={id}>{DISPOSITION_NAMES[id]}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy || !choice || choice === remoteChoice} onClick={() => void confirm()}>
        {busy ? 'Saving…' : remoteChoice ? 'Change Force Disposition' : 'Confirm Force Disposition'}
      </button>
      <p className="context-note">This choice belongs to your seat. Changing it cancels Ready. The official Primary pairing is calculated after both forces confirm.</p>
      {remoteChoice && <p>Selected: <strong>{DISPOSITION_NAMES[remoteChoice as typeof DISPOSITIONS[number]]}</strong></p>}
      {mission && <p>Your Primary: <strong>{mission.name}</strong> · <a href={mission.url} target="_blank" rel="noreferrer">Full card</a></p>}
    </>}
    {official && room.sessionSnapshot.setup.doubles && !force && <p className="context-note">Your team captain chooses one shared Force Disposition for both teammates.</p>}
    {error && <p className="alert alert--danger" role="alert">{error}</p>}
  </section>
}
