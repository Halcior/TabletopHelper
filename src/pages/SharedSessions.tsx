import { t as tr } from '../features/i18n/locale'
import { LobbyClockSettings } from '../features/battleClock/LobbyClockSettings'
import { social, errorText } from '../features/social/api'
import { LobbyArmyPicker } from '../features/social/LobbyArmyPicker'
import { LobbySeatSettings } from '../features/social/LobbySeatSettings'
import { LobbyHostSettings } from '../features/social/LobbyHostSettings'
import { DISPOSITION_NAMES } from '../rulesets/cauldronFFA3'
import { LobbyFriendInvites } from '../features/social/LobbyFriendInvites'
import { useRosterScope } from '../features/armyLibrary/scope'
import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CommandDialog } from '../components/ui/CommandDialog'
import { InfoDisclosure } from '../components/ui/InfoDisclosure'
import { RivalHelp } from '../components/battle/RivalClarity'
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
  const dispositionSeats = secondaryConfig?.primaryDeck === 'chapter-approved-duel'
    ? lobbySession?.setup.doubles?.forces.map(f => f.captainPlayerId) ?? lobbyPlayerIds
    : []
  const dispositionReady = !inspection?.room.bringYourArmy || dispositionSeats.every(id => participants.some(p => p.playerId === id && p.forceDisposition))
  const myDispositionReady = !inspection?.room.bringYourArmy || !dispositionSeats.includes(membership?.playerId ?? '') || Boolean(currentParticipant?.forceDisposition)
  const canStart = membership
    ? rosterReady && dispositionReady && canStartSharedLobby(membership.isHost, lobbyPlayerIds, participants, clock)
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
      <span className="eyebrow">{tr("Shared battle")}</span>
      <h1>{tr("Shared play is unavailable")}</h1>
      <p>{tr("This installation supports local play. You can still track a battle together on one device.")}</p>
      <Link className="button button--gold" to="/battle/setup">{tr("Set up a local battle")}</Link>
    </section>
  </div>

  if (membership) return <div className="page-shell shared-session-page shared-lobby-page">
    <section className="panel shared-room-focus shared-lobby">
      <div className="shared-room-focus__code"><span>{roomStartedAt ? tr('Battle room') : tr('Waiting room')}</span><strong>{membership.roomCode}</strong></div>
      {lobbySession && <div className="shared-room-format"><RulesSourceBadge source={rulesForSession(lobbySession).source} /><span>{tr(rulesForSession(lobbySession).title)}</span></div>}
      <div className="shared-room-focus__status shared-lobby__counters">
        <div><span>{tr("Sync")}</span><strong>{connectionStatus}</strong></div>
        <div><span>{tr("Online")}</span><strong>{lobbySummary.onlineCount}/{seatTarget}</strong></div>
        <div><span>{tr("Ready")}</span><strong>{lobbySummary.readyCount}/{seatTarget}</strong></div>
        <div><span>{tr("Last")}</span><strong>{syncTime(lastSyncedAt)}</strong></div>
      </div>
      {secondaryConfig && <InfoDisclosure label={tr("Room rules")}><p className="context-note" aria-label={tr("Secondary deck selected for this room")}>{tr("Secondary deck: ")}{secondaryConfig.secondaryDeck === 'chapter-approved'
        ? tr(`Chapter Approved 2026–27 · ${secondaryConfig.primaryDeck === 'chapter-approved-duel' ? 'each player chooses Fixed or Tactical' : secondaryConfig.officialSecondaryStrategy === 'fixed' ? 'Fixed' : 'Tactical'}`, "Chapter Approved 2026–27 · {0}")
        : tr('Cauldron')}. {secondaryConfig.mode === 'ffa3' && secondaryConfig.secondaryDeck === 'chapter-approved' ? tr('FFA cards retain their assigned Secondary Rival; enemy presence checks both opponents.') : ''}</p></InfoDisclosure>}

      <div className="shared-lobby__content">
        {secondaryConfig?.mode === 'ffa3' && secondaryConfig.secondaryDeck === 'chapter-approved' && <RivalHelp />}
        <div className="shared-lobby__seats" aria-label={tr("Player seats")}>
          {lobbyPlayerIds.map((playerId, index) => {
            const player = lobbySession?.state.players[playerId]
            const occupant = participants.find((participant) => participant.playerId === playerId)
            const online = occupant ? participantIsOnline(occupant, clock) : false
            const mine = occupant?.clientId === membership.clientId
            const seatState = !occupant ? 'empty' : !online ? 'offline' : occupant.isReady ? 'ready' : 'online'
            return <article className={`shared-lobby-seat shared-lobby-seat--player-${index} is-${seatState}${mine ? ' is-mine' : ''}`} key={playerId}>
              <div className="shared-lobby-seat__marker"><span>{String(index + 1).padStart(2, '0')}</span></div>
              <div className="shared-lobby-seat__identity">
                <span>{tr("Commander ")}{index + 1}{occupant?.isHost ? tr(' · host') : ''}</span>
                <strong>{inspection?.room.bringYourArmy && !roomStartedAt ? occupant?.displayName ?? tr(`Player ${index + 1}`, "Player {0}") : player?.name ?? occupant?.displayName ?? tr(`Player ${index + 1}`, "Player {0}")}</strong>
                <small>{player?.faction ?? tr('Commander')}{mine ? tr(' · this phone') : ''}</small>
                {inspection?.room.bringYourArmy && <small>{inspection.rosters?.find(r => r.playerId === playerId && r.clientId === occupant?.clientId)?.army.name ?? tr('Army not selected')}</small>}
                {dispositionSeats.includes(playerId) && inspection?.room.bringYourArmy && <small>{occupant?.forceDisposition ? DISPOSITION_NAMES[occupant.forceDisposition as keyof typeof DISPOSITION_NAMES] : tr('Force Disposition not selected')}</small>}
              </div>
              <div className="shared-lobby-seat__state">
                {occupant?.isHost && <span className="shared-lobby-seat__host"><AppIcon name="host" /> {tr(" Host")}</span>}
                <span className={online ? 'is-online' : 'is-offline'}><i aria-hidden="true" />{online ? tr('Online') : occupant ? tr('Disconnected') : tr('Empty seat')}</span>
                <strong className={online && occupant?.isReady ? 'is-ready' : ''}>{online && occupant?.isReady ? <><AppIcon name="ready" /> {tr(" Ready")}</> : tr('Not ready')}</strong>
              </div>
            </article>
          })}
        </div>

        <aside className="shared-lobby__invite">
          <button className="shared-lobby__qr" type="button" aria-label={tr("Enlarge QR invite")} onClick={() => setQrExpanded(true)}><QRCodeSVG value={inviteUrl} size={164} marginSize={2} /></button>
          <strong><AppIcon name="qr" /> {tr(" Scan to join")}</strong>
          <span>{tr("The room code is already included.")}</span>
          {localOnlyInvite && <small>{tr("Open the lobby using the PC's Wi-Fi IP address before scanning. A localhost link works only on this device.")}</small>}
          <button onClick={() => void shareInvite()}>{inviteStatus === 'copied' ? tr('Invite copied') : tr('Share invite')}</button>
        </aside>
      </div>

      {!roomStartedAt && <LobbyClockSettings key={`clock:${membership.roomId}`} />}
      {!roomStartedAt && membership.isHost && <LobbyHostSettings key={`host:${membership.roomId}:${membership.clientId}`} />}
      <LobbySeatSettings key={`${rosterOwner}:${membership.roomId}:${membership.clientId}`} />
      <LobbyArmyPicker key={`${rosterOwner}:${membership.roomId}`} />
      {!roomStartedAt && membership.isHost && <LobbyFriendInvites membership={membership} />}

      {qrExpanded && <CommandDialog label={tr("QR room invite")} onClose={() => setQrExpanded(false)}>
        <div className="shared-invite-overlay__panel" onClick={(event) => event.stopPropagation()}>
          <button className="shared-invite-overlay__close" type="button" aria-label={tr("Close QR invite")} onClick={() => setQrExpanded(false)}>×</button>
          <span className="eyebrow">{tr("Join battle room")}</span>
          <strong>{membership.roomCode}</strong>
          <div className="shared-invite-overlay__qr"><QRCodeSVG value={inviteUrl} size={280} marginSize={2} /></div>
          <p>{tr("Scan with another commander's phone.")}</p>
          <button className="button--gold" type="button" onClick={() => void shareInvite()}>{inviteStatus === 'copied' ? tr('Invite copied') : tr('Share invite')}</button>
        </div>
      </CommandDialog>}

      {pendingEventCount > 0 && <div className="alert alert--warning shared-room-focus__queue">{pendingEventCount} {tr(" local change")}{pendingEventCount === 1 ? '' : 's'} {tr(" waiting to sync.")}</div>}
      {backendCheckStatus === 'failed' && <div className="alert alert--danger shared-room-focus__queue">{backendCheckMessage}</div>}
      {error && <div className="alert alert--danger shared-room-focus__queue">{tr(error)}</div>}

      {!roomStartedAt && <div className="shared-lobby__ready-actions">
        <button className={currentParticipant?.isReady ? '' : 'button--gold'} disabled={working || !myRosterReady || !myDispositionReady || connectionStatus !== 'connected' || backendCheckStatus !== 'ready'} onClick={() => void toggleReady()}>
          {currentParticipant?.isReady ? tr('Cancel readiness') : tr('I am ready')}
        </button>
        {membership.isHost
          ? <button className="button--gold" disabled={working || !canStart || backendCheckStatus !== 'ready'} onClick={() => void startBattle()}>
              {working ? tr('Starting…') : canStart ? tr('Start battle') : tr(`Waiting · ${lobbySummary.readyCount}/${seatTarget} ready`, "Waiting · {0}/{1} ready")}
            </button>
          : <div className="shared-lobby__waiting">{lobbySummary.allReady ? tr('Everyone is ready. Waiting for the host.') : tr('Mark ready and wait for all commanders.')}</div>}
      </div>}

      <div className="shared-room-focus__actions shared-lobby__utility-actions">
        {roomStartedAt && <Link className="button button--gold" to={`/battle/${membership.battleId}`}>{tr("Open battle")}</Link>}
        <button onClick={() => void forceSync()}>{tr("Sync now")}</button>
        <button onClick={() => void leaveSharedRoom()}>{tr("Leave room")}</button>
      </div>
    </section>
  </div>

  return <div className="page-shell shared-session-page">
    <section className="shared-session-intro">
      <span className="eyebrow">{tr("Shared battle")}</span>
      <h1>{tr("Host or join.")}</h1>
      <p>{tr("Each commander uses one player seat. The current player controls phase progression.")}</p>
    </section>

    {(error || invitationError) && <div className="alert alert--danger" role="alert">{invitationError || tr(error)}</div>}
    {invitationError && !rosterOwner && <Link className="button" to="/account">{tr("Sign in")}</Link>}

    <div className={`shared-backend-check shared-backend-check--${backendCheckStatus}`} role="status">
      <div><span>{tr("Shared connection")}</span><strong>{backendCheckStatus === 'checking' ? tr('Connecting…') : backendCheckStatus === 'ready' ? tr('Ready') : backendCheckStatus === 'failed' ? tr('Needs attention') : tr('Waiting')}</strong></div>
      {backendCheckStatus === 'failed' && <p>{backendCheckMessage}</p>}
      {backendCheckStatus === 'failed' && <button disabled={working} onClick={() => void checkBackend(true)}>{tr("Test again")}</button>}
    </div>

    <div className="shared-session-grid shared-session-grid--simple">
      <section className="panel shared-session-card shared-session-card--join">
        <span className="eyebrow">{tr("Join")}</span>
        <h2>{inspection ? tr('Choose your commander') : tr('Enter room code')}</h2>
        {!inspection && <div className="shared-code-entry">
          <input
            aria-label={tr("Shared room code")}
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
            placeholder={tr("K7F4Q2")}
            value={roomCode}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
          />
          <button className="button--gold" disabled={working || roomCode.length !== 6} onClick={findRoom}>{working ? tr('Finding…') : tr('Continue')}</button>
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
                ? tr(`In use${reclaimSeconds > 0 ? ` · reclaim in ${reclaimSeconds}s if disconnected` : ''}`, "In use{0}")
                : occupant
                  ? tr('Available to reclaim')
                  : player.faction ?? tr('Available')}</small></span>
            </label>
          })}
          <button className="button button--gold button--wide" disabled={working || !joinPlayerId} onClick={join}>{working ? tr('Joining…') : inspection.room.startedAt ? tr('Join battle') : tr('Join lobby')}</button>
          <button onClick={() => { setRoomCode(''); navigate('/shared', { replace: true }) }}>{tr("Use another code")}</button>
        </div>}
      </section>

      <section className="panel shared-session-card shared-session-card--host">
        <span className="eyebrow">{tr("Host")}</span>
        <h2>{tr("Create an online lobby")}</h2>
        <p>{tr("Choose the format and rules first. Each commander selects their own saved army inside the lobby.")}</p>
        <Link className="button button--gold button--wide" to="/battle/setup?play=shared">{tr("Set up multiplayer")}</Link>
        {latestBattle && <details className="setup-custom-settings">
          <summary>{tr("Legacy: share an existing local battle")}</summary>
          <p className="context-note">{tr("Use this only to continue a previously created battle with host-selected armies. For new games use multiplayer setup above.")}</p>
          <div className="shared-host-summary"><strong>{tr("Round ")}{latestBattle.state.round}</strong><span>{latestBattle.state.phase.replaceAll('_', ' ')}</span></div>
          <label>{tr("You are ")}<select value={hostPlayerId} onChange={(event) => setHostPlayerId(event.target.value)}>
              {latestBattle.setup.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select>
          </label>
          <button className="button button--wide" disabled={working || backendCheckStatus === 'checking'} onClick={host}>{working ? tr('Creating…') : tr('Share existing battle')}</button>
        </details>}
      </section>
    </div>
  </div>
}
