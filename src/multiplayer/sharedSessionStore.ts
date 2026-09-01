import { create } from 'zustand'
import { rehydrateBattleSession } from '../domain/battle/engine'
import type { BattleEvent, BattleSession } from '../domain/battle/types'
import { saveBattle } from '../persistence/database'
import { useBattleStore } from '../stores/battleStore'
import { sharedSessionTransport } from './supabaseRestTransport'
import type {
  SharedConnectionStatus,
  SharedEventEnvelope,
  SharedMembership,
  SharedParticipant,
  SharedRoomInspection,
} from './types'

const MEMBERSHIP_KEY = 'tabletop-companion.shared-membership'
const CLIENT_KEY = 'tabletop-companion.client-id'
const POLL_MS = 900
const PRESENCE_EVERY_POLLS = 5
const ACTIVE_SEAT_MS = 30_000

let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeBattle: (() => void) | null = null
let baseSnapshot: BattleSession | null = null
let canonicalEvents: SharedEventEnvelope[] = []
let pendingLocalEvents = new Map<string, BattleEvent>()
let suppressBattlePublish = false
let pollCounter = 0

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function clientId(): string {
  const target = storage()
  const stored = target?.getItem(CLIENT_KEY)
  if (stored) return stored
  const created = crypto.randomUUID()
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

function stopSyncLoop(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
  unsubscribeBattle?.()
  unsubscribeBattle = null
  baseSnapshot = null
  canonicalEvents = []
  pendingLocalEvents.clear()
  pollCounter = 0
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
  events.forEach((event) => pendingLocalEvents.set(event.id, event))
  try {
    await sharedSessionTransport.publishEvents(membership.roomId, events)
    useSharedSessionStore.setState({ connectionStatus: 'connected', error: null })
  } catch (error) {
    useSharedSessionStore.setState({ connectionStatus: 'reconnecting', error: message(error) })
  }
}

async function pollRoom(): Promise<void> {
  const store = useSharedSessionStore.getState()
  const membership = store.membership
  if (!membership) return
  try {
    if (pendingLocalEvents.size > 0) {
      await sharedSessionTransport.publishEvents(membership.roomId, [...pendingLocalEvents.values()])
    }

    const afterSequence = canonicalEvents.at(-1)?.sequence ?? 0
    const incoming = await sharedSessionTransport.listEvents(membership.roomId, afterSequence)
    if (incoming.length > 0) {
      for (const envelope of incoming) {
        if (!canonicalEvents.some((known) => known.sequence === envelope.sequence)) canonicalEvents.push(envelope)
        pendingLocalEvents.delete(envelope.event.id)
      }
      canonicalEvents.sort((left, right) => left.sequence - right.sequence)
      rebuildFromCanonical()
    }

    pollCounter += 1
    if (pollCounter % PRESENCE_EVERY_POLLS === 0) {
      await sharedSessionTransport.touchParticipant(membership.roomId, membership.clientId)
      const participants = await sharedSessionTransport.listParticipants(membership.roomId)
      useSharedSessionStore.setState({ participants })
    }

    const session = useBattleStore.getState().session
    if (membership.isHost && session && session.state.status !== store.roomStatus) {
      await sharedSessionTransport.updateRoomStatus(membership.roomId, session.state.status)
      useSharedSessionStore.setState({ roomStatus: session.state.status })
    }
    useSharedSessionStore.setState({ connectionStatus: 'connected', error: null })
  } catch (error) {
    useSharedSessionStore.setState({ connectionStatus: 'reconnecting', error: message(error) })
  }
}

function startSyncLoop(inspection: SharedRoomInspection, membership: SharedMembership): void {
  stopSyncLoop()
  baseSnapshot = inspection.room.sessionSnapshot
  useSharedSessionStore.setState({
    membership,
    participants: inspection.participants,
    roomStatus: inspection.room.status,
    connectionStatus: 'connecting',
    error: null,
  })
  saveMembership(membership)

  const localSession = useBattleStore.getState().session
  if (!localSession || localSession.setup.gameId !== membership.battleId) {
    const session = rehydrateBattleSession(inspection.room.sessionSnapshot)
    useBattleStore.setState({ session, error: null })
    void saveBattle(session)
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
  inspectRoom: (code: string) => Promise<SharedRoomInspection | null>
  hostCurrentBattle: (playerId: string) => Promise<SharedMembership>
  joinInspectedRoom: (playerId: string) => Promise<SharedMembership>
  restoreForBattle: (battleId: string) => Promise<boolean>
  disconnect: (forget?: boolean) => void
}

export const useSharedSessionStore = create<SharedSessionStore>((set, get) => ({
  configured: sharedSessionTransport.configured,
  connectionStatus: 'idle',
  membership: readMembership(),
  participants: [],
  roomStatus: null,
  inspection: null,
  error: null,

  async inspectRoom(code) {
    if (!sharedSessionTransport.configured) {
      set({ error: 'Shared sessions are not configured on this build.' })
      return null
    }
    set({ connectionStatus: 'connecting', error: null })
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
    const occupiedRecently = occupied && Date.now() - Date.parse(occupied.lastSeenAt) < ACTIVE_SEAT_MS
    if (occupiedRecently && occupied?.clientId !== id) throw new Error(`${occupied.displayName} is already active on another device.`)
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
    const membership = readMembership()
    if (!membership || membership.battleId !== battleId || !sharedSessionTransport.configured) return false
    if (get().connectionStatus === 'connected' && get().membership?.battleId === battleId) return true
    set({ connectionStatus: 'connecting', membership, error: null })
    try {
      const inspection = await sharedSessionTransport.inspectRoom(membership.roomCode)
      if (!inspection) throw new Error('The shared room no longer exists.')
      startSyncLoop(inspection, membership)
      return true
    } catch (error) {
      set({ connectionStatus: 'error', error: message(error) })
      return false
    }
  },

  disconnect(forget = false) {
    stopSyncLoop()
    if (forget) saveMembership(null)
    set({
      connectionStatus: 'idle',
      membership: forget ? null : readMembership(),
      participants: [],
      roomStatus: null,
      inspection: null,
      error: null,
    })
  },
}))
