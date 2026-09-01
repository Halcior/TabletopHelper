import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { BattleSession } from '../domain/battle/types'
import type { SharedParticipant } from '../multiplayer/types'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
import { normalizeRoomCode } from '../multiplayer/roomCode'
import { getLatestActiveBattle } from '../persistence/database'
import { useBattleStore } from '../stores/battleStore'

const ACTIVE_SEAT_MS = 30_000

function participantIsActive(participant: SharedParticipant): boolean {
  return Date.now() - Date.parse(participant.lastSeenAt) < ACTIVE_SEAT_MS
}

export default function SharedSessions() {
  const navigate = useNavigate()
  const [latestBattle, setLatestBattle] = useState<BattleSession | null>(null)
  const [hostPlayerId, setHostPlayerId] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [joinPlayerId, setJoinPlayerId] = useState('')
  const [working, setWorking] = useState(false)
  const loadBattle = useBattleStore((state) => state.loadBattle)
  const {
    configured,
    connectionStatus,
    membership,
    participants,
    inspection,
    error,
    inspectRoom,
    hostCurrentBattle,
    joinInspectedRoom,
    disconnect,
  } = useSharedSessionStore()

  useEffect(() => {
    void getLatestActiveBattle().then((battle) => {
      setLatestBattle(battle ?? null)
      setHostPlayerId((current) => current || battle?.state.activePlayerId || battle?.state.turnOrder[0] || '')
    })
  }, [])

  useEffect(() => {
    if (!inspection) return
    const occupied = new Set(inspection.participants.filter(participantIsActive).map((participant) => participant.playerId))
    const firstFree = inspection.room.sessionSnapshot.state.turnOrder.find((playerId) => !occupied.has(playerId))
    setJoinPlayerId(firstFree ?? '')
  }, [inspection])

  const joinedBattle = membership && latestBattle?.setup.gameId === membership.battleId
  const activeParticipants = useMemo(() => participants.filter(participantIsActive), [participants])

  async function host() {
    if (!latestBattle || !hostPlayerId) return
    setWorking(true)
    try {
      await loadBattle(latestBattle.setup.gameId)
      await hostCurrentBattle(hostPlayerId)
    } finally {
      setWorking(false)
    }
  }

  async function findRoom() {
    if (!roomCode) return
    setWorking(true)
    try {
      await inspectRoom(roomCode)
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

  if (!configured) return <div className="page-shell shared-session-page">
    <section className="hero-panel">
      <span className="eyebrow">Shared battle · preview</span>
      <h1>Three phones, one battle state.</h1>
      <p>The client-side sync layer is installed, but this build needs a Supabase project before it can create rooms.</p>
      <div className="alert">Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong>, then apply <code>supabase/shared_sessions.sql</code>.</div>
      <Link className="button" to="/">Return home</Link>
    </section>
  </div>

  return <div className="page-shell shared-session-page">
    <section className="hero-panel shared-session-hero">
      <span className="eyebrow">Shared battle</span>
      <h1>Bring all three commanders into one session.</h1>
      <p>One device hosts the battle. The other players join with a six-character code and claim their player seat.</p>
      {membership && <div className="shared-room-banner">
        <div><span>Room</span><strong>{membership.roomCode}</strong></div>
        <div><span>Sync</span><strong>{connectionStatus}</strong></div>
        <div><span>Connected</span><strong>{activeParticipants.length || participants.length}</strong></div>
        <button onClick={() => disconnect(true)}>Leave shared room</button>
        {joinedBattle && <Link className="button button--gold" to={`/battle/${membership.battleId}`}>Open battle</Link>}
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
          <small>The host controls phase progression and battle lifecycle in the first multiplayer milestone.</small>
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
            const occupiedNow = occupant ? participantIsActive(occupant) : false
            return <label className={occupiedNow ? 'is-occupied' : ''} key={playerId}>
              <input type="radio" name="shared-seat" value={playerId} checked={joinPlayerId === playerId} disabled={occupiedNow} onChange={() => setJoinPlayerId(playerId)} />
              <span><strong>{player.name}</strong><small>{occupiedNow
                ? `Active · ${occupant?.displayName}`
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
