import { withClockSnapshot, type ClockSnapshot, type ClockCommand, type ClockConfig } from '../features/battleClock/model'
import { create } from 'zustand'
import { rehydrateBattleSession } from '../domain/battle/engine'
import type { BattleEvent, BattleSession } from '../domain/battle/types'
import { getBattle } from '../persistence/database'
import { persistBattleSnapshot, useBattleStore } from '../stores/battleStore'
import { participantIsActive } from './presence'
import { canStartSharedLobby, sharedLobbyNotReadyMessage } from './sharedLobby'
import { classifySeatRestore, shouldPreserveHostClaim } from './seatOwnership'
import { setSharedRuntimeMembership } from './sharedRuntime'
import { acknowledgeSharedOutbox, appendSharedOutbox, readSharedOutbox, readSharedStartedAt, writeSharedStartedAt } from './sharedResumeCache'
import { findRetryableLocalEvents, mergeCanonicalEnvelopes } from './sharedSync'
import { SharedRequestError, sharedSessionTransport } from './supabaseRestTransport'
import type {
  SharedConnectionStatus,
  SharedBackendCheckStatus,
  SharedEventEnvelope,
  SharedMembership,
  SharedParticipant,
  SharedRoomInspection,
} from './types'
import { createPortableUuid } from './uuid'
import { sharedBackendMessage } from './sharedBackend'

const MEMBERSHIP_KEY = 'tabletop-companion.shared-membership'
const CLIENT_KEY = 'tabletop-companion.client-id'
const POLL_MS = 900
const PRESENCE_EVERY_POLLS = 5
const LOBBY_REFRESH_EVERY_POLLS = 2
const PREFLIGHT_FRESH_MS = 30_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeBattle: (() => void) | null = null
let baseSnapshot: BattleSession | null = null
let baseRosterStartedAt: string | null = null
let canonicalEvents: SharedEventEnvelope[] = []
let pendingLocalEvents = new Map<string, BattleEvent>()
let suppressBattlePublish = false
let pollCounter = 0
let pollInFlight = false
let publishBlocked = false
let removeBrowserListeners: (() => void) | null = null
let syncGeneration = 0
let preflightPromise: Promise<boolean> | null = null
let restoreRequest: { membership: SharedMembership; generation: number; promise: Promise<boolean> } | null = null

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

function createClientId(): string {
  return createPortableUuid()
}

function clientId(): string {
  const target = storage()
  const stored = target?.getItem(CLIENT_KEY)
  if (stored) return stored
  const created = createClientId()
  target?.setItem(CLIENT_KEY, created)
  return created
}

function saveMembership(membership: SharedMembership | null): void {
  const target = storage()
  if (!target) return
  if (!membership) target.removeItem(MEMBERSHIP_KEY)
  else target.setItem(MEMBERSHIP_KEY, JSON.stringify(membership))
}

function readMembership(): SharedMembership | null {
  try {
    const raw = storage()?.getItem(MEMBERSHIP_KEY)
    return raw ? JSON.parse(raw) as SharedMembership : null
  } catch {
    return null
  }
}

const initialMembership = readMembership()
setSharedRuntimeMembership(initialMembership)

function sameSeat(current: SharedMembership | null, membership: SharedMembership): boolean {
  return current?.roomId === membership.roomId
    && current.battleId === membership.battleId
    && current.clientId === membership.clientId
    && current.playerId === membership.playerId
}

function syncIsCurrent(generation: number, membership: SharedMembership): boolean {
  return generation === syncGeneration && sameSeat(useSharedSessionStore.getState().membership, membership)
}

function checkpointOutbox(write: () => void): void {
  let failure = useSharedSessionStore.getState().outboxError
  try {
    write()
    if (pendingLocalEvents.size === 0) failure = null
  } catch (error) {
    failure = message(error)
  }
  useSharedSessionStore.setState({ pendingEventCount: pendingLocalEvents.size, outboxError: failure })
}

async function saveStartedSnapshot(session: BattleSession, membership: SharedMembership, startedAt: string): Promise<void> {
  try {
    await persistBattleSnapshot(session)
    if (sameSeat(readMembership(), membership)) writeSharedStartedAt(storage(), membership, startedAt)
  } catch (error) {
    if (sameSeat(useSharedSessionStore.getState().membership, membership)) {
      useSharedSessionStore.setState({ error: message(error) })
    }
  }
}

function stopSyncLoop(): void {
  syncGeneration += 1
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  unsubscribeBattle?.()
  unsubscribeBattle = null
  removeBrowserListeners?.()
  removeBrowserListeners = null
  baseSnapshot = null
  baseRosterStartedAt = null
  canonicalEvents = []
  pendingLocalEvents.clear()
  pollCounter = 0
  pollInFlight = false
  publishBlocked = false
}

function replayCachedOutbox(persisted: BattleSession, queued: BattleEvent[]): BattleSession {
  const knownIds = new Set(persisted.state.events.map((event) => event.id))
  const missing = queued.filter((event) => !knownIds.has(event.id))
  return rehydrateBattleSession({
    ...persisted,
    state: { ...persisted.state, events: [...persisted.state.events, ...missing] },
    redoActions: [],
  })
}

function rebuildFromCanonical(
  nextEvents = canonicalEvents,
  nextPending = pendingLocalEvents,
): BattleSession | undefined {
  const membership = useSharedSessionStore.getState().membership
  const current = useBattleStore.getState().session
  if (!membership || !baseSnapshot) return
  const eventIds = new Set(baseSnapshot.state.events.map((event) => event.id))
  const orderedRemote = nextEvents.map(({ event }) => event).filter((event) => {
    if (eventIds.has(event.id)) return false
    eventIds.add(event.id)
    return true
  })
  const pending = [...nextPending.values()].filter((event) => !eventIds.has(event.id))
  const session = rehydrateBattleSession({
    ...baseSnapshot,
    battleClock: useSharedSessionStore.getState().clockSnapshot?.clock ?? undefined,
    state: {
      ...baseSnapshot.state,
      events: [...baseSnapshot.state.events, ...orderedRemote, ...pending],
    },
    redoActions: [],
  })
  if (current?.setup.gameId === membership.battleId) {
    suppressBattlePublish = true
    try {
      useBattleStore.setState({ session, error: null })
    } finally {
      suppressBattlePublish = false
    }
  }
  return session
}

/** Ready acknowledgements and restores can observe Start before the poller.
 * Adopt the frozen setup once regardless of which request sees it first. */
function adoptFinalRosters(inspection: SharedRoomInspection): void {
  const membership = useSharedSessionStore.getState().membership
  if (!membership || membership.roomId !== inspection.room.id || !inspection.room.startedAt || baseRosterStartedAt === inspection.room.startedAt) return
  baseSnapshot = inspection.room.sessionSnapshot
  const clock = useSharedSessionStore.getState().clockSnapshot
  if (clock) baseSnapshot = withClockSnapshot(baseSnapshot, clock)
  const session = rebuildFromCanonical()
  baseRosterStartedAt = inspection.room.startedAt
  if (session) void saveStartedSnapshot(session, membership, inspection.room.startedAt)
}

async function pollRoom(): Promise<void> {
  const store = useSharedSessionStore.getState()
  const membership = store.membership
  if (!membership || pollInFlight) return
  const generation = syncGeneration
  if (!browserOnline()) {
    useSharedSessionStore.setState({ connectionStatus: 'offline' })
    return
  }

  pollInFlight = true
  try {
    if (pendingLocalEvents.size > 0 && !publishBlocked) {
      try {
        await sharedSessionTransport.publishEvents(
          membership.roomId,
          [...pendingLocalEvents.values()],
          membership.playerId,
          membership.clientId,
        )
        if (!syncIsCurrent(generation, membership)) return
      } catch (error) {
        if (!syncIsCurrent(generation, membership)) return
        if (!(error instanceof SharedRequestError) || !error.permanent) throw error
        publishBlocked = true
        useSharedSessionStore.setState({ pendingEventError: message(error) })
      }
    }

    const afterSequence = canonicalEvents.at(-1)?.sequence ?? 0
    const incoming = await sharedSessionTransport.listEvents(membership.roomId, afterSequence)
    if (!syncIsCurrent(generation, membership)) return
    if (incoming.length > 0) {
      const nextEvents = mergeCanonicalEnvelopes(canonicalEvents, incoming)
      const acknowledged = new Set(incoming.map(envelope => envelope.event.id))
      const nextPending = new Map(pendingLocalEvents)
      for (const eventId of acknowledged) nextPending.delete(eventId)
      const session = rebuildFromCanonical(nextEvents, nextPending)
      if (session) await persistBattleSnapshot(session)
      if (!syncIsCurrent(generation, membership)) return
      canonicalEvents = nextEvents
      for (const eventId of acknowledged) pendingLocalEvents.delete(eventId)
      checkpointOutbox(() => acknowledgeSharedOutbox(storage(), membership, acknowledged))
      if (!pendingLocalEvents.size) {
        publishBlocked = false
        useSharedSessionStore.setState({ pendingEventError: null })
      }
    }

    const clockRequestAt = performance.now()
    const clockSnapshot = await sharedSessionTransport.battleClock(membership.roomId, membership.clientId)
    if (!syncIsCurrent(generation, membership)) return
    adoptClockSnapshot(clockSnapshot, clockRequestAt)

    pollCounter += 1
    if (pollCounter % PRESENCE_EVERY_POLLS === 0) {
      await sharedSessionTransport.touchParticipant(membership.roomId, membership.clientId)
      if (!syncIsCurrent(generation, membership)) return
    }

    const currentRoomStartedAt = useSharedSessionStore.getState().roomStartedAt
    const shouldRefreshRoom = currentRoomStartedAt === null
      ? pollCounter % LOBBY_REFRESH_EVERY_POLLS === 0
      : pollCounter % PRESENCE_EVERY_POLLS === 0
    if (shouldRefreshRoom) {
      const inspection = await sharedSessionTransport.inspectRoom(membership.roomCode)
      if (!syncIsCurrent(generation, membership)) return
      if (!inspection) throw new Error('The shared room no longer exists.')
      adoptFinalRosters(inspection)
      useSharedSessionStore.setState({
        inspection,
        participants: inspection.participants,
        roomStatus: inspection.room.status,
        roomStartedAt: inspection.room.startedAt,
      })
    }

    const session = useBattleStore.getState().session
    if (membership.isHost && session?.setup.gameId === membership.battleId && !pendingLocalEvents.size
      && session.state.status !== useSharedSessionStore.getState().roomStatus) {
      await sharedSessionTransport.updateRoomStatus(membership.roomId, session.state.status, membership.clientId)
      if (!syncIsCurrent(generation, membership)) return
      useSharedSessionStore.setState({ roomStatus: session.state.status })
    }
    if (!syncIsCurrent(generation, membership)) return
    useSharedSessionStore.setState({
      connectionStatus: 'connected',
      error: null,
      lastSyncedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      pendingEventCount: pendingLocalEvents.size,
    })
  } catch (error) {
    if (!syncIsCurrent(generation, membership)) return
    useSharedSessionStore.setState((current) => ({
      connectionStatus: browserOnline() ? 'reconnecting' : 'offline',
      error: message(error),
      consecutiveFailures: current.consecutiveFailures + 1,
      pendingEventCount: pendingLocalEvents.size,
    }))
  } finally {
    if (generation === syncGeneration) pollInFlight = false
  }
}

function adoptClockSnapshot(snapshot: ClockSnapshot, requestAt: number): void {
  const shared = useSharedSessionStore.getState()
  const previous = shared.clockSnapshot
  if (previous && (snapshot.serverNow < previous.serverNow
    || (snapshot.clock && previous.clock && snapshot.clock.revision < previous.clock.revision))) return
  const receivedAt = performance.now()
  // Approximate half the round trip; display error is bounded by network jitter.
  useSharedSessionStore.setState({ clockSnapshot: snapshot, clockAnchor: {
    serverNow: snapshot.serverNow + (receivedAt - requestAt) / 2, monotonicAt: receivedAt,
  } })
  if (baseSnapshot) baseSnapshot = withClockSnapshot(baseSnapshot, snapshot)
  const current = useBattleStore.getState().session
  if (!current || current.setup.gameId !== shared.membership?.battleId) return
  const unchanged = JSON.stringify(current.setup.battleClock) === JSON.stringify(snapshot.config.preset === 'off' ? undefined : snapshot.config)
    && current.battleClock?.revision === snapshot.clock?.revision
  if (unchanged) return
  const session = withClockSnapshot(current, snapshot)
  useBattleStore.setState({ session })
  if (shared.roomStartedAt) void persistBattleSnapshot(session)
}

function attachBrowserSyncListeners(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const onOnline = () => {
    useSharedSessionStore.setState({ connectionStatus: 'reconnecting', error: null })
    const { membership, restoreForBattle } = useSharedSessionStore.getState()
    if (pollTimer) void pollRoom()
    else if (membership) void restoreForBattle(membership.battleId)
  }
  const onOffline = () => useSharedSessionStore.setState({ connectionStatus: 'offline' })
  const onVisibility = () => { if (pollTimer && document.visibilityState === 'visible') void pollRoom() }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibility)
  removeBrowserListeners = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

function watchLocalChanges(membership: SharedMembership): void {
  unsubscribeBattle?.()
  unsubscribeBattle = useBattleStore.subscribe((state, previous) => {
    if (suppressBattlePublish || !sameSeat(useSharedSessionStore.getState().membership, membership)) return
    const current = state.session
    const before = previous.session
    if (current?.setup.gameId !== membership.battleId || before?.setup.gameId !== membership.battleId) return
    if (current.state.events === before.state.events) return
    const previousIds = new Set(before.state.events.map((event) => event.id))
    const newEvents = current.state.events.filter((event) => !event.derivedFromCombatId && !previousIds.has(event.id))
    if (newEvents.length === 0) return
    for (const event of newEvents) pendingLocalEvents.set(event.id, event)
    checkpointOutbox(() => appendSharedOutbox(storage(), membership, newEvents))
    if (pollTimer) void pollRoom()
  })
}

function startSyncLoop(inspection: SharedRoomInspection, membership: SharedMembership, stored?: BattleSession): void {
  const sameRoom = sameSeat(useSharedSessionStore.getState().membership, membership)
  const fromMemory = sameRoom ? [...pendingLocalEvents.values()] : []
  const current = useBattleStore.getState().session
  const localSession = current?.setup.gameId === membership.battleId ? current : stored
  const cachedStarted = readSharedStartedAt(storage(), membership)
  const savedOutbox = readSharedOutbox(storage(), membership)
  stopSyncLoop()
  baseSnapshot = inspection.room.sessionSnapshot
  const retryable = savedOutbox ?? (localSession
    ? findRetryableLocalEvents(baseSnapshot, localSession, membership.playerId) : [])
  for (const event of [...retryable, ...fromMemory]) pendingLocalEvents.set(event.id, event)
  setSharedRuntimeMembership(membership)
  useSharedSessionStore.setState({
    membership,
    clockSnapshot: null, clockAnchor: null,
    participants: inspection.participants,
    roomStatus: inspection.room.status,
    roomStartedAt: inspection.room.startedAt,
    inspection,
    connectionStatus: browserOnline() ? 'connecting' : 'offline',
    error: null,
    lastSyncedAt: null,
    pendingEventCount: pendingLocalEvents.size,
    pendingEventError: null,
    outboxError: null,
    consecutiveFailures: 0,
  })
  saveMembership(membership)
  const savedIds = new Set(savedOutbox?.map(event => event.id))
  const unrecorded = [...pendingLocalEvents.values()].filter(event => !savedIds.has(event.id))
  if (savedOutbox === null || unrecorded.length) {
    checkpointOutbox(() => appendSharedOutbox(storage(), membership, unrecorded))
  }

  const keepCachedBattle = localSession && cachedStarted && cachedStarted === inspection.room.startedAt
  const initialSession = keepCachedBattle
    ? replayCachedOutbox(localSession, [...pendingLocalEvents.values()])
    : rehydrateBattleSession(inspection.room.sessionSnapshot)
  useBattleStore.setState({ session: initialSession, error: null })
  if (keepCachedBattle) {
    baseRosterStartedAt = cachedStarted
  } else if (inspection.room.startedAt) {
    adoptFinalRosters(inspection)
  } else if (!inspection.room.bringYourArmy) {
    void persistBattleSnapshot(initialSession)
  }

  watchLocalChanges(membership)
  attachBrowserSyncListeners()
  pollTimer = setInterval(() => void pollRoom(), POLL_MS)
  void pollRoom()
}

function restoreCachedBattle(membership: SharedMembership, stored: BattleSession): void {
  const startedAt = readSharedStartedAt(storage(), membership)
  if (!startedAt || stored.setup.gameId !== membership.battleId || unsubscribeBattle) return
  for (const event of readSharedOutbox(storage(), membership) ?? []) pendingLocalEvents.set(event.id, event)
  const session = replayCachedOutbox(stored, [...pendingLocalEvents.values()])
  useBattleStore.setState({ session, loading: false, error: null })
  watchLocalChanges(membership)
  attachBrowserSyncListeners()
  useSharedSessionStore.setState({
    roomStartedAt: startedAt,
    roomStatus: session.state.status,
    pendingEventCount: pendingLocalEvents.size,
  })
}

async function restoreSharedRoom(membership: SharedMembership): Promise<boolean> {
  const generation = syncGeneration
  const set = useSharedSessionStore.setState
  setSharedRuntimeMembership(membership)
  set({ connectionStatus: browserOnline() ? 'connecting' : 'offline', membership, error: null })
  const stored = await getBattle(membership.battleId).catch(() => undefined)
  if (!syncIsCurrent(generation, membership)) return false
  if (stored) restoreCachedBattle(membership, stored)
  if (!browserOnline()) return false
  try {
    let inspection = await sharedSessionTransport.inspectRoom(membership.roomCode)
    if (!syncIsCurrent(generation, membership)) return false
    if (!inspection) throw new Error('The shared room no longer exists.')
    const restoreDecision = classifySeatRestore(membership, inspection.participants)
    if (restoreDecision === 'blocked') {
      throw new Error(membership.isHost
        ? 'The host seat belongs to a different browser identity. Re-open this room from the original host device.'
        : 'Your saved player seat is currently active on another device.')
    }
    if (restoreDecision === 'reclaim') {
      if (membership.isHost) {
        throw new Error('The host seat cannot be transferred automatically. Re-open this room from the original host device.')
      }
      await sharedSessionTransport.joinRoom(inspection.room, membership.playerId, membership.clientId)
      if (!syncIsCurrent(generation, membership)) return false
      inspection = await sharedSessionTransport.inspectRoom(membership.roomCode) ?? inspection
    }
    if (!syncIsCurrent(generation, membership)) return false
    const seat = inspection.participants.find((participant) => participant.playerId === membership.playerId)
    if (!seat || seat.clientId !== membership.clientId) throw new Error('Your saved player seat could not be restored.')
    startSyncLoop(inspection, { ...membership, isHost: seat.isHost }, stored)
    return true
  } catch (error) {
    if (syncIsCurrent(generation, membership)) set({ connectionStatus: browserOnline() ? 'error' : 'offline', error: message(error) })
    return false
  }
}

type SharedSessionStore = {
  clockSnapshot: ClockSnapshot | null
  clockAnchor: { serverNow: number; monotonicAt: number } | null
  clockCommand: (command: ClockCommand | { type: 'configure'; config: ClockConfig }) => Promise<boolean>
  configured: boolean
  connectionStatus: SharedConnectionStatus
  membership: SharedMembership | null
  participants: SharedParticipant[]
  roomStatus: BattleSession['state']['status'] | null
  roomStartedAt: string | null | undefined
  inspection: SharedRoomInspection | null
  error: string | null
  lastSyncedAt: string | null
  pendingEventCount: number
  pendingEventError: string | null
  outboxError: string | null
  consecutiveFailures: number
  backendCheckStatus: SharedBackendCheckStatus
  backendCheckMessage: string | null
  backendCheckedAt: number | null
  checkBackend: (force?: boolean) => Promise<boolean>
  inspectRoom: (code: string) => Promise<SharedRoomInspection | null>
  hostCurrentBattle: (playerId: string, bringYourArmy?: boolean) => Promise<SharedMembership>
  joinInspectedRoom: (playerId: string) => Promise<SharedMembership>
  restoreForBattle: (battleId: string) => Promise<boolean>
  forceSync: () => Promise<void>
  setReady: (ready: boolean) => Promise<void>
  startSharedBattle: () => Promise<void>
  leaveSharedRoom: () => Promise<void>
  disconnect: (forget?: boolean) => void
}

export const useSharedSessionStore = create<SharedSessionStore>((set, get) => ({
  clockSnapshot: null,
  clockAnchor: null,
  async clockCommand(command) {
    const { membership, connectionStatus, clockSnapshot } = get()
    if (!membership || connectionStatus !== 'connected' || !browserOnline()) throw new Error('Połącz się ponownie, aby zmienić zegar.')
    const generation = syncGeneration
    const started = performance.now()
    const snapshot = await sharedSessionTransport.battleClock(membership.roomId, membership.clientId, command, clockSnapshot?.clock?.revision)
    if (!syncIsCurrent(generation, membership)) return false
    adoptClockSnapshot(snapshot, started)
    return snapshot.applied
  },
  configured: sharedSessionTransport.configured,
  connectionStatus: 'idle',
  membership: initialMembership,
  participants: [],
  roomStatus: null,
  roomStartedAt: initialMembership ? undefined : null,
  inspection: null,
  error: null,
  lastSyncedAt: null,
  pendingEventCount: 0,
  pendingEventError: null,
  outboxError: null,
  consecutiveFailures: 0,
  backendCheckStatus: 'idle',
  backendCheckMessage: null,
  backendCheckedAt: null,

  async checkBackend(force = false) {
    const state = get()
    if (!sharedSessionTransport.configured) {
      set({
        backendCheckStatus: 'failed',
        backendCheckMessage: 'Add the Supabase URL and publishable key, then restart the app.',
        backendCheckedAt: null,
      })
      return false
    }
    if (!browserOnline()) {
      set({ backendCheckStatus: 'failed', backendCheckMessage: 'This device is offline.', backendCheckedAt: null })
      return false
    }
    if (!force && state.backendCheckStatus === 'ready' && state.backendCheckedAt && Date.now() - state.backendCheckedAt < PREFLIGHT_FRESH_MS) {
      return true
    }
    if (preflightPromise) return preflightPromise
    try {
      set({ backendCheckStatus: 'checking', backendCheckMessage: null })
      preflightPromise = sharedSessionTransport.preflight().then(() => {
        set({ backendCheckStatus: 'ready', backendCheckMessage: 'Supabase and the shared-room schema are ready.', backendCheckedAt: Date.now() })
        return true
      }).catch((error: unknown) => {
        set({ backendCheckStatus: 'failed', backendCheckMessage: sharedBackendMessage(error), backendCheckedAt: null })
        return false
      })
      return await preflightPromise
    } finally {
      preflightPromise = null
    }
  },

  async inspectRoom(code) {
    if (!sharedSessionTransport.configured) {
      set({ error: 'Shared sessions are not configured on this build.' })
      return null
    }
    set({ connectionStatus: browserOnline() ? 'connecting' : 'offline', error: null })
    if (!browserOnline()) return null
    try {
      const inspection = await sharedSessionTransport.inspectRoom(code)
      set({ inspection, connectionStatus: 'idle', error: inspection ? null : 'Shared room not found.' })
      return inspection
    } catch (error) {
      set({ connectionStatus: 'error', error: message(error) })
      return null
    }
  },

  async hostCurrentBattle(playerId, bringYourArmy = false) {
    const session = useBattleStore.getState().session
    if (!session) throw new Error('Open or create a battle before hosting a shared session.')
    if (!browserOnline()) throw new Error('Go online before creating a shared room.')
    if (!await get().checkBackend()) {
      const failure = get().backendCheckMessage ?? 'Supabase connection check failed.'
      set({ error: failure })
      throw new Error(failure)
    }
    set({ connectionStatus: 'connecting', error: null })
    try {
      const id = clientId()
      const inspection = await sharedSessionTransport.createRoom(session, playerId, id, bringYourArmy)
      const membership: SharedMembership = {
        roomId: inspection.room.id,
        roomCode: inspection.room.code,
        battleId: inspection.room.battleId,
        clientId: id,
        playerId,
        isHost: true,
      }
      startSyncLoop(inspection, membership)
      return membership
    } catch (error) {
      set({ connectionStatus: 'error', error: message(error) })
      throw error
    }
  },

  async joinInspectedRoom(playerId) {
    const inspection = get().inspection
    if (!inspection) throw new Error('Find a shared room first.')
    const occupied = inspection.participants.find((participant) => participant.playerId === playerId)
    const id = clientId()
    const occupiedRecently = occupied && participantIsActive(occupied)
    if (occupiedRecently && occupied?.clientId !== id) throw new Error(`${occupied.displayName} is already active on another device.`)
    if (!browserOnline()) throw new Error('Go online before joining a shared room.')
    if (!await get().checkBackend()) throw new Error(get().backendCheckMessage ?? 'Supabase connection check failed.')
    set({ connectionStatus: 'connecting', error: null })
    try {
      const joinedParticipant = await sharedSessionTransport.joinRoom(
        inspection.room,
        playerId,
        id,
        shouldPreserveHostClaim(occupied, id),
      )
      const refreshed = await sharedSessionTransport.inspectRoom(inspection.room.code) ?? inspection
      const currentParticipant = refreshed.participants.find((participant) => participant.clientId === id) ?? joinedParticipant
      const membership: SharedMembership = {
        roomId: inspection.room.id,
        roomCode: inspection.room.code,
        battleId: inspection.room.battleId,
        clientId: id,
        playerId,
        isHost: currentParticipant.isHost,
      }
      startSyncLoop(refreshed, membership)
      return membership
    } catch (error) {
      set({ connectionStatus: 'error', error: message(error) })
      throw error
    }
  },

  async restoreForBattle(battleId) {
    const savedMembership = readMembership()
    if (!savedMembership || savedMembership.battleId !== battleId || !sharedSessionTransport.configured) return false
    // Joining already starts a loop before its first poll marks it connected.
    // Restarting that same loop here would invalidate in-flight Ready commands.
    if (
      (get().connectionStatus === 'connected' || pollTimer !== null)
      && get().membership?.battleId === battleId
      && get().membership?.roomId === savedMembership.roomId
      && get().membership?.clientId === savedMembership.clientId
      && get().membership?.playerId === savedMembership.playerId
      && get().inspection?.room.id === savedMembership.roomId
    ) return true
    if (restoreRequest?.generation === syncGeneration && sameSeat(restoreRequest.membership, savedMembership)) return restoreRequest.promise
    const generation = syncGeneration
    const promise = restoreSharedRoom(savedMembership)
    restoreRequest = { membership: savedMembership, generation, promise }
    try {
      return await promise
    } finally {
      if (restoreRequest?.promise === promise) restoreRequest = null
    }
  },

  async forceSync() {
    const membership = get().membership
    if (!membership) return
    if (!browserOnline()) {
      set({ connectionStatus: 'offline' })
      return
    }
    set({ connectionStatus: 'reconnecting', error: null })
    if (!pollTimer || !get().inspection || get().backendCheckStatus === 'failed') {
      if (!await get().checkBackend(true)) return
      if (!await get().restoreForBattle(membership.battleId)) return
    }
    publishBlocked = false
    set({ pendingEventError: null })
    await pollRoom()
  },

  async setReady(ready) {
    const membership = get().membership
    if (!membership) return
    const generation = syncGeneration
    if (get().roomStartedAt) return
    if (!await get().checkBackend()) throw new Error(get().backendCheckMessage ?? 'Supabase connection check failed.')
    if (!syncIsCurrent(generation, membership)) return
    set({ error: null })
    try {
      await sharedSessionTransport.setParticipantReady(membership.roomId, membership.clientId, ready)
      if (!syncIsCurrent(generation, membership)) return
      const inspection = await sharedSessionTransport.inspectRoom(membership.roomCode)
      if (!syncIsCurrent(generation, membership)) return
      if (!inspection) throw new Error('The shared room no longer exists.')
      adoptFinalRosters(inspection)
      set({ inspection, participants: inspection.participants, roomStartedAt: inspection.room.startedAt })
    } catch (error) {
      if (!syncIsCurrent(generation, membership)) return
      set({ error: message(error) })
      throw error
    }
  },

  async startSharedBattle() {
    const initial = get()
    const membership = initial.membership
    const inspection = initial.inspection
    const generation = syncGeneration
    if (!membership || !inspection) throw new Error('Open the shared lobby first.')
    if (!membership.isHost) throw new Error('Only the room host can start the battle.')
    if (!await get().checkBackend()) throw new Error(get().backendCheckMessage ?? 'Supabase connection check failed.')
    const current = get()
    if (current.membership?.roomId !== membership.roomId || current.inspection?.room.id !== inspection.room.id) {
      throw new Error('The active shared room changed. Open its lobby and try again.')
    }
    const playerIds = current.inspection.room.sessionSnapshot.setup.players.map((player) => player.id)
    if (current.inspection.room.bringYourArmy && !playerIds.every(id => current.inspection?.rosters?.some(r => r.playerId === id && current.participants.some(p => p.playerId === id && p.clientId === r.clientId)))) {
      throw new Error('Every commander must choose an army before starting.')
    }
    if (!canStartSharedLobby(true, playerIds, current.participants)) {
      throw new Error(sharedLobbyNotReadyMessage(playerIds))
    }
    set({ error: null })
    try {
      const startedAt = await sharedSessionTransport.startRoom(membership.roomId, membership.clientId)
      if (!syncIsCurrent(generation, membership)) return
      const refreshed = await sharedSessionTransport.inspectRoom(membership.roomCode)
      if (!syncIsCurrent(generation, membership)) return
      if (refreshed) adoptFinalRosters(refreshed)
      if (current.inspection.room.bringYourArmy && !refreshed?.room.startedAt) return
      if (!refreshed) {
        const session = useBattleStore.getState().session
        if (session?.setup.gameId === membership.battleId) void saveStartedSnapshot(session, membership, startedAt)
      }
      set({
        roomStartedAt: refreshed?.room.startedAt ?? startedAt,
        inspection: refreshed ?? current.inspection,
        participants: refreshed?.participants ?? current.participants,
      })
    } catch (error) {
      if (!syncIsCurrent(generation, membership)) return
      set({ error: message(error) })
      throw error
    }
  },

  async leaveSharedRoom() {
    const membership = get().membership
    if (!membership) return
    const pending = [...pendingLocalEvents.values()]
    if (browserOnline()) {
      try {
        if (pending.length > 0) {
          await sharedSessionTransport.publishEvents(
            membership.roomId,
            pending,
            membership.playerId,
            membership.clientId,
          )
        }
        if (membership.isHost && !get().roomStartedAt && get().inspection?.room.bringYourArmy) {
          await sharedSessionTransport.closeWaitingRoom(membership.roomId, membership.clientId)
        }
        await sharedSessionTransport.releaseParticipant(membership.roomId, membership.clientId)
      } catch {
        // The seat automatically becomes reclaimable after the stale-presence timeout.
      }
    }
    stopSyncLoop()
    saveMembership(null)
    setSharedRuntimeMembership(null)
    set({
      connectionStatus: 'idle',
      membership: null,
      participants: [],
      roomStatus: null,
      roomStartedAt: null,
      inspection: null,
      error: null,
      lastSyncedAt: null,
      pendingEventCount: 0,
      pendingEventError: null,
      outboxError: null,
      consecutiveFailures: 0,
    })
  },

  disconnect(forget = false) {
    stopSyncLoop()
    if (forget) saveMembership(null)
    const membership = forget ? null : readMembership()
    setSharedRuntimeMembership(membership)
    set({
      connectionStatus: 'idle',
      membership,
      participants: [],
      roomStatus: null,
      roomStartedAt: membership ? undefined : null,
      inspection: null,
      error: null,
      lastSyncedAt: null,
      pendingEventCount: 0,
      pendingEventError: null,
      outboxError: null,
      consecutiveFailures: 0,
    })
  },
}))
