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
  if (!value) return 'Waiting for first sync'
  return `Last sync ${new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
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
    if (!inspection) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [inspection])

  const joinedBattle = Boolean(membership)
  const activeParticipants = useMemo(() => participants.filter((participant) => participantIsActive(participant)), [participants, clock])

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
      // Cancelling native sharing should leave the room untouched.
    }
  }

  if (!configured) return <div className="page-shell shared-session-page">
    <section className="hero-panel">
      <span className="eyebrow">Shared battle · preview</span>
      <h1>Three phones, one battle state.</h1>
      <p>The client-side sync layer is installed, but this build needs a Supabase project before it can create rooms.</p>
      <div className="alert">Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_PUBLISHABLE_KEY</strong> (or the legacy <strong>VITE_SUPABASE_ANON_KEY</strong>), then apply <code>supabase/shared_sessions.sql</code>.</div>
      <Link className="button" to="/">Return home</Link>
    </section>
  </div>

  return <div className="page-shell shared-session-page">
    <section className="hero-panel shared-session-hero">
      <span className="eyebrow">Shared battle</span>
      <h1>Bring all three commanders into one session.</h1>
      <p>One device creates the room. Each commander claims a player seat and controls phase progression during their own turn.</p>
      {membership && <div className="shared-room-banner">
        <div><span>Room</span><strong>{membership.roomCode}</strong></div>
        <div><span>Sync</span><strong>{connectionStatus}</strong></div>
        <div><span>Connected</span><strong>{activeParticipants.length || participants.length}/3</strong></div>
        <button onClick={() => void shareInvite()}>{inviteStatus === 'copied' ? 'Invite copied' : 'Share invite'}</button>
        <button onClick={() => void forceSync()}>Sync now</button>
        <button onClick={() => void leaveSharedRoom()}>Leave shared room</button>
        {joinedBattle && <Link className="button button--gold" to={`/battle/${membership.battleId}`}>Open battle</Link>}
        <div className="shared-room-banner__health">
          <small>{syncTime(lastSyncedAt)}</small>
          {pendingEventCount > 0 && <small>{pendingEventCount} local change{pendingEventCount === 1 ? '' : 's'} waiting to sync</small>}
        </div>
      </div>}
    </section>

    {error && <div className="alert alert--danger">{error}</div>}

    <div className="shared-session-grid">
      <section className="panel shared-session-card">
        <span className="eyebrow">Host</span>
        <h2>Share your active battle</h2>
        {!latestBattle ? <><p>No active local battle is available.</p><Link className="button button--gold" to="/battle/setup">Create battle</Link></> : <>
          <p>Round {latestBattle.state.round} · {latestBattle.state.phase.replaceAll('_', ' ')}</p>
          <label>Which player are you?
            <select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
              {latestBattle.state.turnOrder.map((playerId) => <option key={playerId} value={playerId}>{latestBattle.state.players[playerId].name}</option>)}
            </select>
          </label>
          <button className="button button--gold button--wide" disabled={working || Boolean(membership)} onClick={host}>{working ? 'Creating room…' : 'Create shared room'}</button>
          <small>The host keeps session administration. Normal phase flow belongs to whichever player is currently taking their turn.</small>
        </>}
      </section>

      <section className="panel shared-session-card">
        <span className="eyebrow">Join</span>
        <h2>Enter room code</h2>
        <div className="shared-code-entry">
          <input
            aria-label="Shared room code"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
            placeholder="K7F4Q2"
            value={roomCode}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
          />
          <button disabled={working || roomCode.length !== 6} onClick={findRoom}>Find room</button>
        </div>
        {inspection && <div className="shared-seat-picker">
          <p><strong>Battle found.</strong> Choose your seat:</p>
          {inspection.room.sessionSnapshot.state.turnOrder.map((playerId) => {
            const player = inspection.room.sessionSnapshot.state.players[playerId]
            const occupant = inspection.participants.find((participant) => participant.playerId === playerId)
            const occupiedNow = occupant ? participantIsActive(occupant, clock) : false
            const reclaimSeconds = occupant ? secondsUntilSeatReclaim(occupant, clock) : 0
            return <label className={occupiedNow ? 'is-occupied' : ''} key={playerId}>
              <input type="radio" name="shared-seat" value={playerId} checked={joinPlayerId === playerId} disabled={occupiedNow} onChange={() => setJoinPlayerId(playerId)} />
              <span><strong>{player.name}</strong><small>{occupiedNow
                ? `Active · ${occupant?.displayName}${reclaimSeconds > 0 ? ` · reclaim in ${reclaimSeconds}s if disconnected` : ''}`
                : occupant
                  ? 'Disconnected seat · available to reclaim'
                  : player.faction ?? 'Available'}</small></span>
            </label>
          })}
          <button className="button button--gold button--wide" disabled={working || !joinPlayerId} onClick={join}>{working ? 'Joining…' : 'Join battle'}</button>
        </div>}
      </section>
    </div>
  </div>
}