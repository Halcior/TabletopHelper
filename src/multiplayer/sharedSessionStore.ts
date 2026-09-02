import { create } from 'zustand'
import { rehydrateBattleSession } from '../domain/battle/engine'
import type { BattleEvent, BattleSession } from '../domain/battle/types'
import { saveBattle } from '../persistence/database'
import { useBattleStore } from '../stores/battleStore'
import { participantIsActive } from './presence'
import { classifySeatRestore } from './seatOwnership'
import { setSharedRuntimeMembership } from './sharedRuntime'
import { findRetryableLocalEvents, mergeCanonicalEnvelopes } from './sharedSync'
import { sharedSessionTransport } from './supabaseRestTransport'
import type {
  SharedConnectionStatus,
  SharedEventEnvelope,
  SharedMembership,
  SharedParticipant,
  SharedRoomInspection,
} from './types'
import { createPortableUuid } from './uuid'

const MEMBERSHIP_KEY = 'tabletop-companion.shared-membership'
const CLIENT_KEY = 'tabletop-companion.client-id'
const POLL_MS = 900
const PRESENCE_EVERY_POLLS = 5

let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeBattle: (() => void) | null = null
let baseSnapshot: BattleSession | null = null
let canonicalEvents: SharedEventEnvelope[] = []
let pendingLocalEvents = new Map<string, BattleEvent>()
let suppressBattlePublish = false
let pollCounter = 0
let pollInFlight = false
let removeBrowserListeners: (() => void) | null = null
let syncGeneration = 0

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

function syncIsCurrent(generation: number, membership: SharedMembership): boolean {
  const current = useSharedSessionStore.getState().membership
  return generation === syncGeneration
    && current?.roomId === membership.roomId
    && current.clientId === membership.clientId
    && current.playerId === membership.playerId
}

function updatePendingCount(): void {
  useSharedSessionStore.setState({ pendingEventCount: pendingLocalEvents.size })
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
  canonicalEvents = []
  pendingLocalEvents.clear()
  pollCounter = 0
  pollInFlight = false
}

function rebuildFromCanonical(): void {
  const membership = useSharedSessionStore.getState().membership
  const current = useBattleStore.getState().session
  if (!membership || !baseSnapshot || current?.setup.gameId !== membership.battleId) return
  const eventIds = new Set(baseSnapshot.state.events.map((event) => event.id))
  const orderedRemote = canonicalEvents.map(({ event }) => event).filter((event) => {
    if (eventIds.has(event.id)) return false
    eventIds.add(event.id)
    return true
  })
  const pending = [...pendingLocalEvents.values()].filter((event) => !eventIds.has(event.id))
  const session = rehydrateBattleSession({
    ...baseSnapshot,
    state: {
      ...baseSnapshot.state,
      events: [...baseSnapshot.state.events, ...orderedRemote, ...pending],
    },
    redoActions: [],
  })
  suppressBattlePublish = true
  useBattleStore.setState({ session, error: null })
  suppressBattlePublish = false
  void saveBattle(session)
}

async function publishLocalEvents(events: BattleEvent[]): Promise<void> {
  const state = useSharedSessionStore.getState()
  const membership = state.membership
  if (!membership || events.length === 0) return
  const generation = syncGeneration
  events.forEach((event) => pendingLocalEvents.set(event.id, event))
  updatePendingCount()
  if (!browserOnline()) {
    if (syncIsCurrent(generation, membership)) useSharedSessionStore.setState({ connectionStatus: 'offline' })
    return
  }
  try {
    await sharedSessionTransport.publishEvents(membership.roomId, events, membership.playerId, membership.clientId)
    if (!syncIsCurrent(generation, membership)) return
    useSharedSessionStore.setState({ connectionStatus: 'connected', error: null })
  } catch (error) {
    if (!syncIsCurrent(generation, membership)) return
    useSharedSessionStore.setState((current) => ({
      connectionStatus: 'reconnecting',
      error: message(error),
      consecutiveFailures: current.consecutiveFailures + 1,
    }))
  }
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
    if (pendingLocalEvents.size > 0) {
      await sharedSessionTransport.publishEvents(
        membership.roomId,
        [...pendingLocalEvents.values()],
        membership.playerId,
        membership.clientId,
      )
      if (!syncIsCurrent(generation, membership)) return
    }

    const afterSequence = canonicalEvents.at(-1)?.sequence ?? 0
    const incoming = await sharedSessionTransport.listEvents(membership.roomId, afterSequence)
    if (!syncIsCurrent(generation, membership)) return
    if (incoming.length > 0) {
      canonicalEvents = mergeCanonicalEnvelopes(canonicalEvents, incoming)
      for (const envelope of incoming) pendingLocalEvents.delete(envelope.event.id)
      updatePendingCount()
      rebuildFromCanonical()
    }

    pollCounter += 1
    if (pollCounter % PRESENCE_EVERY_POLLS === 0) {
      await sharedSessionTransport.touchParticipant(membership.roomId, membership.clientId)
      if (!syncIsCurrent(generation, membership)) return
      const participants = await sharedSessionTransport.listParticipants(membership.roomId)
      if (!syncIsCurrent(generation, membership)) return
      useSharedSessionStore.setState({ participants })
    }

    const session = useBattleStore.getState().session
    if (membership.isHost && session && session.state.status !== store.roomStatus) {
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

function attachBrowserSyncListeners(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const onOnline = () => {
    useSharedSessionStore.setState({ connectionStatus: 'reconnecting', error: null })
    void pollRoom()
  }
  const onOffline = () => useSharedSessionStore.setState({ connectionStatus: 'offline' })
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void pollRoom()
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibility)
  removeBrowserListeners = () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

function startSyncLoop(inspection: SharedRoomInspection, membership: SharedMembership): void {
  stopSyncLoop()
  baseSnapshot = inspection.room.sessionSnapshot
  setSharedRuntimeMembership(membership)
  useSharedSessionStore.setState({
    membership,
    participants: inspection.participants,
    roomStatus: inspection.room.status,
    connectionStatus: browserOnline() ? 'connecting' : 'offline',
    error: null,
    lastSyncedAt: null,
    pendingEventCount: 0,
    consecutiveFailures: 0,
  })
  saveMembership(membership)

  const localSession = useBattleStore.getState().session
  if (!localSession || localSession.setup.gameId !== membership.battleId) {
    const session = rehydrateBattleSession(inspection.room.sessionSnapshot)
    useBattleStore.setState({ session, error: null })
    void saveBattle(session)
  } else {
    for (const event of findRetryableLocalEvents(inspection.room.sessionSnapshot, localSession)) {
      pendingLocalEvents.set(event.id, event)
    }
    updatePendingCount()
  }

  unsubscribeBattle = useBattleStore.subscribe((state, previous) => {
    if (suppressBattlePublish) return
    const current = state.session
    const before = previous.session
    if (!current || current.setup.gameId !== membership.battleId) return
    const previousIds = new Set(before?.state.events.map((event) => event.id) ?? [])
    const newEvents = current.state.events.filter((event) => !previousIds.has(event.id))
    if (newEvents.length > 0) void publishLocalEvents(newEvents)
  })

  attachBrowserSyncListeners()
  void pollRoom()
  pollTimer = setInterval(() => void pollRoom(), POLL_MS)
}

type SharedSessionStore = {
  configured: boolean
  connectionStatus: SharedConnectionStatus
  membership: SharedMembership | null
  participants: SharedParticipant[]
  roomStatus: BattleSession['state']['status'] | null
  inspection: SharedRoomInspection | null
  error: string | null
  lastSyncedAt: string | null
  pendingEventCount: number
  consecutiveFailures: number
  inspectRoom: (code: string) => Promise<SharedRoomInspection | null>
  hostCurrentBattle: (playerId: string) => Promise<SharedMembership>
  joinInspectedRoom: (playerId: string) => Promise<SharedMembership>
  restoreForBattle: (battleId: string) => Promise<boolean>
  forceSync: () => Promise<void>
  leaveSharedRoom: () => Promise<void>
  disconnect: (forget?: boolean) => void
}

export const useSharedSessionStore = create<SharedSessionStore>((set, get) => ({
  configured: sharedSessionTransport.configured,
  connectionStatus: 'idle',
  membership: initialMembership,
  participants: [],
  roomStatus: null,
  inspection: null,
  error: null,
  lastSyncedAt: null,
  pendingEventCount: 0,
  consecutiveFailures: 0,

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

  async hostCurrentBattle(playerId) {
    const session = useBattleStore.getState().session
    if (!session) throw new Error('Open or create a battle before hosting a shared session.')
    if (!browserOnline()) throw new Error('Go online before creating a shared room.')
    set({ connectionStatus: 'connecting', error: null })
    try {
      const id = clientId()
      const inspection = await sharedSessionTransport.createRoom(session, playerId, id)
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
    set({ connectionStatus: 'connecting', error: null })
    try {
      await sharedSessionTransport.joinRoom(inspection.room, playerId, id)
      const refreshed = await sharedSessionTransport.inspectRoom(inspection.room.code) ?? inspection
      const membership: SharedMembership = {
        roomId: inspection.room.id,
        roomCode: inspection.room.code,
        battleId: inspection.room.battleId,
        clientId: id,
        playerId,
        isHost: false,
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
    if (get().connectionStatus === 'connected' && get().membership?.battleId === battleId) return true
    setSharedRuntimeMembership(savedMembership)
    set({ connectionStatus: browserOnline() ? 'connecting' : 'offline', membership: savedMembership, error: null })
    if (!browserOnline()) return false
    try {
      let inspection = await sharedSessionTransport.inspectRoom(savedMembership.roomCode)
      if (!inspection) throw new Error('The shared room no longer exists.')
      const restoreDecision = classifySeatRestore(savedMembership, inspection.participants)
      if (restoreDecision === 'blocked') {
        throw new Error(savedMembership.isHost
          ? 'The host seat belongs to a different browser identity. Re-open this room from the original host device.'
          : 'Your saved player seat is currently active on another device.')
      }
      if (restoreDecision === 'reclaim') {
        if (savedMembership.isHost) {
          throw new Error('The host seat cannot be transferred automatically. Re-open this room from the original host device.')
        }
        await sharedSessionTransport.joinRoom(inspection.room, savedMembership.playerId, savedMembership.clientId)
        inspection = await sharedSessionTransport.inspectRoom(savedMembership.roomCode) ?? inspection
      }
      const seat = inspection.participants.find((participant) => participant.playerId === savedMembership.playerId)
      if (!seat || seat.clientId !== savedMembership.clientId) throw new Error('Your saved player seat could not be restored.')
      const membership = { ...savedMembership, isHost: seat.isHost }
      startSyncLoop(inspection, membership)
      return true
    } catch (error) {
      set({ connectionStatus: 'error', error: message(error) })
      return false
    }
  },

  async forceSync() {
    if (!get().membership) return
    set({ connectionStatus: browserOnline() ? 'reconnecting' : 'offline', error: null })
    await pollRoom()
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
      inspection: null,
      error: null,
      lastSyncedAt: null,
      pendingEventCount: 0,
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
      inspection: null,
      error: null,
      lastSyncedAt: null,
      pendingEventCount: 0,
      consecutiveFailures: 0,
    })
  },
}))
