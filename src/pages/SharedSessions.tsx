import { social, errorText } from '../features/social/api'
import { LobbyArmyPicker } from '../features/social/LobbyArmyPicker'
import { LobbyFriendInvites } from '../features/social/LobbyFriendInvites'
import { useRosterScope } from '../features/armyLibrary/scope'
import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CommandDialog } from '../components/ui/CommandDialog'
import { InfoDisclosure } from '../components/ui/InfoDisclosure'
import { RulesSourceBadge } from '../components/ui/RulesSourceBadge'
import { rulesForSession } from '../rulesets/rulesSource'
import { AppIcon } from '../components/AppIcon'
import type { BattleSession } from '../domain/battle/types'
import { canStartSharedLobby, summarizeSharedLobby } from '../multiplayer/sharedLobby'
import { participantIsActive, participantIsOnline, secondsUntilSeatReclaim } from '../multiplayer/presence'
import { normalizeRoomCode } from '../multiplayer/roomCode'
import { buildSharedInviteUrl, roomCodeFromSearch } from '../multiplayer/sharedInvite'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
import { getLatestActiveBattle } from '../persistence/database'
import { useBattleStore } from '../stores/battleStore'
import { CAULDRON_RULESET_ID, getCauldronConfig } from '../rulesets/cauldronFFA3'

function syncTime(value: string | null): string {
  if (!value) return 'Waiting for sync'
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function SharedSessions() {
  const rosterOwner = useRosterScope(s => s.userId)
  const navigate = useNavigate()
  const location = useLocation()
  const [latestBattle, setLatestBattle] = useState<BattleSession | null>(null)
  const [hostPlayerId, setHostPlayerId] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [joinPlayerId, setJoinPlayerId] = useState('')
  const [working, setWorking] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'copied'>('idle')
  const [qrExpanded, setQrExpanded] = useState(false)
  const [invitationError, setInvitationError] = useState('')
  const [clock, setClock] = useState(() => Date.now())
  const previousStartedAt = useRef<string | null | undefined>(undefined)
  const loadBattle = useBattleStore((state) => state.loadBattle)
  const {
    configured,
    connectionStatus,
    membership,
    participants,
    roomStartedAt,
    inspection,
    error,
    lastSyncedAt,
    pendingEventCount,
    backendCheckStatus,
    backendCheckMessage,
    checkBackend,
    inspectRoom,
    hostCurrentBattle,
    joinInspectedRoom,
    restoreForBattle,
    forceSync,
    setReady,
    startSharedBattle,
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
    if (configured) void checkBackend()
  }, [checkBackend, configured])

  useEffect(() => {
    if (!configured || !membership) return
    const recoverConnection = () => void forceSync()
    window.addEventListener('online', recoverConnection)
    return () => window.removeEventListener('online', recoverConnection)
  }, [configured, forceSync, membership?.battleId])

  useEffect(() => {
    const invitation = new URLSearchParams(location.search).get('invite')
    setInvitationError('')
    if (!invitation) return
    if (!rosterOwner) { setInvitationError('Sign in to open this invitation.'); return }
    let active = true
    void social<{ room_code: string }>(rosterOwner, 'resolve-invite', { id: invitation }).then(async result => {
      if (!active) return
      setRoomCode(result.room_code)
      await inspectRoom(result.room_code)
    }).catch(error => { if (active) setInvitationError(errorText(error)) })
    return () => { active = false }
  }, [location.search, rosterOwner, inspectRoom])

  useEffect(() => {
    if (!configured) return
    const code = roomCodeFromSearch(location.search)
    if (!code) return
    setRoomCode(code)
    if (membership?.roomCode === code || inspection?.room.code === code) return
    void inspectRoom(code)
  }, [configured, inspectRoom, inspection?.room.code, location.search, membership?.roomCode])

  useEffect(() => {
    if (!inspection || membership) return
    const occupied = new Set(inspection.participants
      .filter((participant) => participantIsActive(participant))
      .map((participant) => participant.playerId))
    const firstFree = inspection.room.sessionSnapshot.setup.players.map((player) => player.id).find((playerId) => !occupied.has(playerId))
    setJoinPlayerId(firstFree ?? '')
  }, [inspection, membership])

  useEffect(() => {
    if (!inspection && !membership) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [inspection, membership])

  useEffect(() => {
    if (!qrExpanded) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQrExpanded(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [qrExpanded])

  useEffect(() => {
    if (previousStartedAt.current === null && roomStartedAt && membership) {
      navigate(`/battle/${membership.battleId}`, { replace: true })
    }
    previousStartedAt.current = roomStartedAt
  }, [membership, navigate, roomStartedAt])

  const lobbySession = inspection?.room.sessionSnapshot ?? latestBattle
  const secondaryConfig = lobbySession?.setup.rulesetId === CAULDRON_RULESET_ID ? getCauldronConfig(lobbySession) : null
  const lobbyPlayerIds = lobbySession?.setup.players.map((player) => player.id) ?? []
  const seatTarget = lobbyPlayerIds.length
  const lobbySummary = useMemo(
    () => summarizeSharedLobby(lobbyPlayerIds, participants, clock),
    [clock, lobbyPlayerIds, participants],
  )
  const currentParticipant = membership
    ? participants.find((participant) => participant.clientId === membership.clientId)
    : undefined
  const rosterReady = !inspection?.room.bringYourArmy || lobbyPlayerIds.every(id => inspection.rosters?.some(r => r.playerId === id && participants.some(p => p.playerId === id && p.clientId === r.clientId)))
  const myRosterReady = !inspection?.room.bringYourArmy || inspection.rosters?.some(r => r.playerId === membership?.playerId && r.clientId === membership?.clientId)
  const canStart = membership
    ? rosterReady && canStartSharedLobby(membership.isHost, lobbyPlayerIds, participants, clock)
    : false
  const inviteUrl = membership ? buildSharedInviteUrl(window.location.origin, membership.roomCode) : ''
  const localOnlyInvite = ['localhost', '127.0.0.1'].includes(window.location.hostname)

  async function host() {
    if (!latestBattle || !hostPlayerId) return
    setWorking(true)
    try {
      await loadBattle(latestBattle.setup.gameId)
      const created = await hostCurrentBattle(hostPlayerId)
      navigate(`/shared?room=${created.roomCode}`, { replace: true })
    } catch {
      // The shared-session store exposes the actionable error on this page.
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
      if (useSharedSessionStore.getState().roomStartedAt) navigate(`/battle/${joined.battleId}`)
      else navigate(`/shared?room=${joined.roomCode}`, { replace: true })
    } catch {
      // The shared-session store exposes the actionable error on this page.
    } finally {
      setWorking(false)
    }
  }

  async function toggleReady() {
    if (!currentParticipant) return
    setWorking(true)
    try {
      await setReady(!currentParticipant.isReady)
    } catch {
      // The shared-session store exposes the actionable error on this page.
    } finally {
      setWorking(false)
    }
  }

  async function startBattle() {
    setWorking(true)
    try {
      await startSharedBattle()
    } catch {
      // The shared-session store exposes the actionable error on this page.
    } finally {
      setWorking(false)
    }
  }

  async function shareInvite() {
    if (!membership) return
    const localOnly = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    const url = buildSharedInviteUrl(window.location.origin, membership.roomCode)
    const text = localOnly
      ? `TabletopHelper room code: ${membership.roomCode}`
      : `Join my TabletopHelper battle: ${membership.roomCode}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'TabletopHelper shared battle', text, ...(localOnly ? {} : { url }) })
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
      <h1>Shared play is unavailable</h1>
      <p>This installation supports local play. You can still track a battle together on one device.</p>
      <Link className="button button--gold" to="/battle/setup">Set up a local battle</Link>
    </section>
  </div>

  if (membership) return <div className="page-shell shared-session-page shared-lobby-page">
    <section className="panel shared-room-focus shared-lobby">
      <div className="shared-room-focus__code"><span>{roomStartedAt ? 'Battle room' : 'Waiting room'}</span><strong>{membership.roomCode}</strong></div>
      {lobbySession && <div className="shared-room-format"><RulesSourceBadge source={rulesForSession(lobbySession).source} /><span>{rulesForSession(lobbySession).title}</span></div>}
      <div className="shared-room-focus__status shared-lobby__counters">
        <div><span>Sync</span><strong>{connectionStatus}</strong></div>
        <div><span>Online</span><strong>{lobbySummary.onlineCount}/{seatTarget}</strong></div>
        <div><span>Ready</span><strong>{lobbySummary.readyCount}/{seatTarget}</strong></div>
        <div><span>Last</span><strong>{syncTime(lastSyncedAt)}</strong></div>
      </div>
      {secondaryConfig && <InfoDisclosure label="Room rules"><p className="context-note" aria-label="Secondary deck selected for this room">Secondary deck: {secondaryConfig.secondaryDeck === 'chapter-approved'
        ? `Chapter Approved 2026–27 · ${secondaryConfig.primaryDeck === 'chapter-approved-duel' ? 'each player chooses Fixed or Tactical' : secondaryConfig.officialSecondaryStrategy === 'fixed' ? 'Fixed' : 'Tactical'}`
        : 'Cauldron'}. {secondaryConfig.mode === 'ffa3' && secondaryConfig.secondaryDeck === 'chapter-approved' ? 'FFA cards retain their assigned Secondary Rival; enemy presence checks both opponents.' : ''}</p></InfoDisclosure>}

      <div className="shared-lobby__content">
        <div className="shared-lobby__seats" aria-label="Player seats">
          {lobbyPlayerIds.map((playerId, index) => {
            const player = lobbySession?.state.players[playerId]
            const occupant = participants.find((participant) => participant.playerId === playerId)
            const online = occupant ? participantIsOnline(occupant, clock) : false
            const mine = occupant?.clientId === membership.clientId
            const seatState = !occupant ? 'empty' : !online ? 'offline' : occupant.isReady ? 'ready' : 'online'
            return <article className={`shared-lobby-seat shared-lobby-seat--player-${index} is-${seatState}${mine ? ' is-mine' : ''}`} key={playerId}>
              <div className="shared-lobby-seat__marker"><span>{String(index + 1).padStart(2, '0')}</span></div>
              <div className="shared-lobby-seat__identity">
                <span>Commander {index + 1}{occupant?.isHost ? ' · host' : ''}</span>
                <strong>{player?.name ?? occupant?.displayName ?? `Player ${index + 1}`}</strong>
                <small>{player?.faction ?? 'Commander'}{mine ? ' · this phone' : ''}</small>
                {inspection?.room.bringYourArmy && <small>{inspection.rosters?.find(r => r.playerId === playerId && r.clientId === occupant?.clientId)?.army.name ?? 'Army not selected'}</small>}
              </div>
              <div className="shared-lobby-seat__state">
                {occupant?.isHost && <span className="shared-lobby-seat__host"><AppIcon name="host" /> Host</span>}
                <span className={online ? 'is-online' : 'is-offline'}><i aria-hidden="true" />{online ? 'Online' : occupant ? 'Disconnected' : 'Empty seat'}</span>
                <strong className={online && occupant?.isReady ? 'is-ready' : ''}>{online && occupant?.isReady ? <><AppIcon name="ready" /> Ready</> : 'Not ready'}</strong>
              </div>
            </article>
          })}
        </div>

        <aside className="shared-lobby__invite">
          <button className="shared-lobby__qr" type="button" aria-label="Enlarge QR invite" onClick={() => setQrExpanded(true)}><QRCodeSVG value={inviteUrl} size={164} marginSize={2} /></button>
          <strong><AppIcon name="qr" /> Scan to join</strong>
          <span>The room code is already included.</span>
          {localOnlyInvite && <small>Open the lobby using the PC's Wi-Fi IP address before scanning. A localhost link works only on this device.</small>}
          <button onClick={() => void shareInvite()}>{inviteStatus === 'copied' ? 'Invite copied' : 'Share invite'}</button>
        </aside>
      </div>

      <LobbyArmyPicker key={`${rosterOwner}:${membership.roomId}`} />
      {!roomStartedAt && membership.isHost && <LobbyFriendInvites membership={membership} />}

      {qrExpanded && <CommandDialog label="QR room invite" onClose={() => setQrExpanded(false)}>
        <div className="shared-invite-overlay__panel" onClick={(event) => event.stopPropagation()}>
          <button className="shared-invite-overlay__close" type="button" aria-label="Close QR invite" onClick={() => setQrExpanded(false)}>×</button>
          <span className="eyebrow">Join battle room</span>
          <strong>{membership.roomCode}</strong>
          <div className="shared-invite-overlay__qr"><QRCodeSVG value={inviteUrl} size={280} marginSize={2} /></div>
          <p>Scan with another commander's phone.</p>
          <button className="button--gold" type="button" onClick={() => void shareInvite()}>{inviteStatus === 'copied' ? 'Invite copied' : 'Share invite'}</button>
        </div>
      </CommandDialog>}

      {pendingEventCount > 0 && <div className="alert alert--warning shared-room-focus__queue">{pendingEventCount} local change{pendingEventCount === 1 ? '' : 's'} waiting to sync.</div>}
      {backendCheckStatus === 'failed' && <div className="alert alert--danger shared-room-focus__queue">{backendCheckMessage}</div>}
      {error && <div className="alert alert--danger shared-room-focus__queue">{error}</div>}

      {!roomStartedAt && <div className="shared-lobby__ready-actions">
        <button className={currentParticipant?.isReady ? '' : 'button--gold'} disabled={working || !myRosterReady || connectionStatus !== 'connected' || backendCheckStatus !== 'ready'} onClick={() => void toggleReady()}>
          {currentParticipant?.isReady ? 'Cancel readiness' : 'I am ready'}
        </button>
        {membership.isHost
          ? <button className="button--gold" disabled={working || !canStart || backendCheckStatus !== 'ready'} onClick={() => void startBattle()}>
              {working ? 'Starting…' : canStart ? 'Start battle' : `Waiting · ${lobbySummary.readyCount}/${seatTarget} ready`}
            </button>
          : <div className="shared-lobby__waiting">{lobbySummary.allReady ? 'Everyone is ready. Waiting for the host.' : 'Mark ready and wait for all commanders.'}</div>}
      </div>}

      <div className="shared-room-focus__actions shared-lobby__utility-actions">
        {roomStartedAt && <Link className="button button--gold" to={`/battle/${membership.battleId}`}>Open battle</Link>}
        <button onClick={() => void forceSync()}>Sync now</button>
        <button onClick={() => void leaveSharedRoom()}>Leave room</button>
      </div>
    </section>
  </div>

  return <div className="page-shell shared-session-page">
    <section className="shared-session-intro">
      <span className="eyebrow">Shared battle</span>
      <h1>Host or join.</h1>
      <p>Each commander uses one player seat. The current player controls phase progression.</p>
    </section>

    {(error || invitationError) && <div className="alert alert--danger" role="alert">{invitationError || error}</div>}
    {invitationError && !rosterOwner && <Link className="button" to="/account">Sign in</Link>}

    <div className={`shared-backend-check shared-backend-check--${backendCheckStatus}`} role="status">
      <div><span>Shared connection</span><strong>{backendCheckStatus === 'checking' ? 'Connecting…' : backendCheckStatus === 'ready' ? 'Ready' : backendCheckStatus === 'failed' ? 'Needs attention' : 'Waiting'}</strong></div>
      {backendCheckStatus === 'failed' && <p>{backendCheckMessage}</p>}
      {backendCheckStatus === 'failed' && <button disabled={working} onClick={() => void checkBackend(true)}>Test again</button>}
    </div>

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
          <RulesSourceBadge source={rulesForSession(inspection.room.sessionSnapshot).source} />
          {inspection.room.sessionSnapshot.setup.players.map((player) => player.id).map((playerId) => {
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
          <button className="button button--gold button--wide" disabled={working || !joinPlayerId} onClick={join}>{working ? 'Joining…' : inspection.room.startedAt ? 'Join battle' : 'Join lobby'}</button>
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
              {latestBattle.setup.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select>
          </label>
          <button className="button button--gold button--wide" disabled={working || backendCheckStatus === 'checking'} onClick={host}>{working ? 'Creating…' : 'Create lobby'}</button>
        </>}
      </section>
    </div>
  </div>
}
