import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { BattleSession } from '../domain/battle/types'
import { participantIsActive, secondsUntilSeatReclaim } from '../multiplayer/presence'
import { normalizeRoomCode } from '../multiplayer/roomCode'
import { buildSharedInviteUrl, roomCodeFromSearch } from '../multiplayer/sharedInvite'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
import type { SharedParticipant } from '../multiplayer/types'
import { getLatestActiveBattle } from '../persistence/database'
import { useBattleStore } from '../stores/battleStore'

function syncTime(value: string | null): string {
  if (!value) return 'Waiting for sync'
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function SharedSessions() {
  const navigate = useNavigate()
  const location = useLocation()
  const [latestBattle, setLatestBattle] = useState<BattleSession | null>(null)
  const [hostPlayerId, setHostPlayerId] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [joinPlayerId, setJoinPlayerId] = useState('')
  const [working, setWorking] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'copied'>('idle')
  const [clock, setClock] = useState(() => Date.now())
  const loadBattle = useBattleStore((state) => state.loadBattle)
  const {
    configured,
    connectionStatus,
    membership,
    participants,
    inspection,
    error,
    lastSyncedAt,
    pendingEventCount,
    inspectRoom,
    hostCurrentBattle,
    joinInspectedRoom,
    restoreForBattle,
    forceSync,
    leaveSharedRoom,
  } = useSharedSessionStore()

  useEffect(() => {
    void getLatestActiveBattle().then((battle) => {
      setLatestBattle(battle ?? null)
      setHostPlayerId((current) => current || battle?.state.activePlayerId || battle?.state.turnOrder[0] || '')
    })
  }, [])

  useEffect(() => {
    if (!configured || !membership) return
    void restoreForBattle(membership.battleId)
  }, [configured, membership?.battleId, restoreForBattle])

  useEffect(() => {
    if (!configured) return
    const code = roomCodeFromSearch(location.search)
    if (!code) return
    setRoomCode(code)
    if (membership?.roomCode === code || inspection?.room.code === code) return
    void inspectRoom(code)
  }, [configured, inspectRoom, inspection?.room.code, location.search, membership?.roomCode])

  useEffect(() => {
    if (!inspection) return
    const occupied = new Set(inspection.participants.filter((participant) => participantIsActive(participant)).map((participant) => participant.playerId))
    const firstFree = inspection.room.sessionSnapshot.state.turnOrder.find((playerId) => !occupied.has(playerId))
    setJoinPlayerId(firstFree ?? '')
  }, [inspection])

  useEffect(() => {
    if (!inspection && !membership) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [inspection, membership])

  const activeParticipants = useMemo(() => participants.filter((participant) => participantIsActive(participant, clock)), [participants, clock])

  async function host() {
    if (!latestBattle || !hostPlayerId) return
    setWorking(true)
    try {
      await loadBattle(latestBattle.setup.gameId)
      const created = await hostCurrentBattle(hostPlayerId)
      navigate(`/shared?room=${created.roomCode}`, { replace: true })
    } finally {
      setWorking(false)
    }
  }

  async function findRoom() {
    if (!roomCode) return
    setWorking(true)
    try {
      const found = await inspectRoom(roomCode)
      if (found) navigate(`/shared?room=${found.room.code}`, { replace: true })
    } finally {
      setWorking(false)
    }
  }

  async function join() {
    if (!joinPlayerId) return
    setWorking(true)
    try {
      const joined = await joinInspectedRoom(joinPlayerId)
      navigate(`/battle/${joined.battleId}`)
    } finally {
      setWorking(false)
    }
  }

  async function shareInvite() {
    if (!membership) return
    const localOnly = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    const url = buildSharedInviteUrl(window.location.origin, membership.roomCode)
    const text = localOnly
      ? `Tabletop Companion room code: ${membership.roomCode}`
      : `Join my Tabletop Companion battle: ${membership.roomCode}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Tabletop Companion shared battle', text, ...(localOnly ? {} : { url }) })
        return
      }
      await navigator.clipboard.writeText(localOnly ? membership.roomCode : url)
      setInviteStatus('copied')
      window.setTimeout(() => setInviteStatus('idle'), 1800)
    } catch {
      // Native share cancellation leaves the room untouched.
    }
  }

  if (!configured) return <div className="page-shell shared-session-page">
    <section className="hero-panel shared-session-hero">
      <span className="eyebrow">Shared battle</span>
      <h1>Multiplayer needs backend configuration.</h1>
      <p>Add the Supabase environment values for this build, then reload the app.</p>
      <Link className="button" to="/">Return home</Link>
    </section>
  </div>

  if (membership) return <div className="page-shell shared-session-page">
    <section className="panel shared-room-focus">
      <div className="shared-room-focus__code"><span>Room</span><strong>{membership.roomCode}</strong></div>
      <div className="shared-room-focus__status">
        <div><span>Sync</span><strong>{connectionStatus}</strong></div>
        <div><span>Online</span><strong>{activeParticipants.length || participants.length}/3</strong></div>
        <div><span>Last</span><strong>{syncTime(lastSyncedAt)}</strong></div>
      </div>
      {pendingEventCount > 0 && <div className="alert alert--warning shared-room-focus__queue">{pendingEventCount} local change{pendingEventCount === 1 ? '' : 's'} waiting to sync.</div>}
      {error && <div className="alert alert--danger shared-room-focus__queue">{error}</div>}
      <div className="shared-room-focus__actions">
        <Link className="button button--gold" to={`/battle/${membership.battleId}`}>Open battle</Link>
        <button onClick={() => void shareInvite()}>{inviteStatus === 'copied' ? 'Invite copied' : 'Share invite'}</button>
        <button onClick={() => void forceSync()}>Sync now</button>
        <button onClick={() => void leaveSharedRoom()}>Leave</button>
      </div>
    </section>
  </div>

  return <div className="page-shell shared-session-page">
    <section className="shared-session-intro">
      <span className="eyebrow">Shared battle</span>
      <h1>Host or join.</h1>
      <p>Each commander uses one player seat. The current player controls phase progression.</p>
    </section>

    {error && <div className="alert alert--danger">{error}</div>}

    <div className="shared-session-grid shared-session-grid--simple">
      <section className="panel shared-session-card shared-session-card--join">
        <span className="eyebrow">Join</span>
        <h2>{inspection ? 'Choose your commander' : 'Enter room code'}</h2>
        {!inspection && <div className="shared-code-entry">
          <input
            aria-label="Shared room code"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
            placeholder="K7F4Q2"
            value={roomCode}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
          />
          <button className="button--gold" disabled={working || roomCode.length !== 6} onClick={findRoom}>{working ? 'Finding…' : 'Continue'}</button>
        </div>}
        {inspection && <div className="shared-seat-picker">
          {inspection.room.sessionSnapshot.state.turnOrder.map((playerId) => {
            const player = inspection.room.sessionSnapshot.state.players[playerId]
            const occupant = inspection.participants.find((participant) => participant.playerId === playerId)
            const occupiedNow = occupant ? participantIsActive(occupant, clock) : false
            const reclaimSeconds = occupant ? secondsUntilSeatReclaim(occupant, clock) : 0
            return <label className={occupiedNow ? 'is-occupied' : ''} key={playerId}>
              <input type="radio" name="shared-seat" value={playerId} checked={joinPlayerId === playerId} disabled={occupiedNow} onChange={() => setJoinPlayerId(playerId)} />
              <span><strong>{player.name}</strong><small>{occupiedNow
                ? `In use${reclaimSeconds > 0 ? ` · reclaim in ${reclaimSeconds}s if disconnected` : ''}`
                : occupant
                  ? 'Available to reclaim'
                  : player.faction ?? 'Available'}</small></span>
            </label>
          })}
          <button className="button button--gold button--wide" disabled={working || !joinPlayerId} onClick={join}>{working ? 'Joining…' : 'Join battle'}</button>
          <button onClick={() => { setRoomCode(''); navigate('/shared', { replace: true }) }}>Use another code</button>
        </div>}
      </section>

      <section className="panel shared-session-card shared-session-card--host">
        <span className="eyebrow">Host</span>
        <h2>Share an active battle</h2>
        {!latestBattle ? <><p>Create a battle first, then return here to share it.</p><Link className="button" to="/battle/setup">Create battle</Link></> : <>
          <div className="shared-host-summary"><strong>Round {latestBattle.state.round}</strong><span>{latestBattle.state.phase.replaceAll('_', ' ')}</span></div>
          <label>You are
            <select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
              {latestBattle.state.turnOrder.map((playerId) => <option key={playerId} value={playerId}>{latestBattle.state.players[playerId].name}</option>)}
            </select>
          </label>
          <button className="button button--gold button--wide" disabled={working} onClick={host}>{working ? 'Creating…' : 'Create room'}</button>
        </>}
      </section>
    </div>
  </div>
}
