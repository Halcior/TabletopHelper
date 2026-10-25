import type { ClockSnapshot, ClockCommand, ClockConfig } from '../features/battleClock/model'
import { rehydrateBattleSession } from '../domain/battle/engine'
import { officialObjectivesForPair } from '../domain/battlefield/layouts'
import { getCauldronConfig } from '../rulesets/cauldronFFA3'
import { validateArmy } from '../domain/army/roster'
import type { Army } from '../domain/army/types'
import { accountRequest } from '../features/social/api'
import type { BattleEvent, BattleLifecycleStatus, BattleSession } from '../domain/battle/types'
import { createRoomCode, normalizeRoomCode } from './roomCode'
import type {
  SharedEventEnvelope,
  SharedParticipant,
  HostLobbySettings,
  SharedRoom,
  SharedRoomInspection,
  SharedSessionTransport,
} from './types'
import { createPortableUuid } from './uuid'
import { seatCredential } from './seatCredential'
import { assertSharedSchemaVersion } from './sharedBackend'

type SupabaseRoomRow = {
  bring_your_army?: boolean
  id: string
  code: string
  battle_id: string
  status: BattleLifecycleStatus
  session_snapshot: BattleSession
  started_at: string | null
  created_at: string
  updated_at: string
}

type SupabaseParticipantRow = {
  id: string
  room_id: string
  client_id: string
  player_id: string
  display_name: string
  force_disposition?: string | null
  is_host: boolean
  is_ready: boolean
  last_seen_at: string
}

type SupabaseEventRow = {
  sequence: number
  room_id: string
  event_payload: BattleEvent
  created_at: string
}

function env(name: string): string | undefined {
  const values = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return values?.[name]?.trim() || undefined
}

function mapRoom(row: SupabaseRoomRow): SharedRoom {
  // Official objectives depend on the two player-selected dispositions. They
  // cannot be final when the empty waiting lobby is first created by the host.
  // Resolve the pinned official layout only after the server freezes choices.
  const snapshot = structuredClone(row.session_snapshot)
  if (row.bring_your_army && row.started_at) {
    const config = snapshot.setup.rulesetId === 'cauldron-ffa-3' ? getCauldronConfig(snapshot) : null
    if (config?.primaryDeck === 'chapter-approved-duel') {
      const pair = snapshot.setup.doubles
        ? snapshot.setup.doubles.forces.map((force) => force.forceDisposition)
        : snapshot.setup.turnOrder.map((id) => config.playerConfigs[id]?.forceDisposition)
      if (pair.length !== 2 || !pair[0] || !pair[1]) throw new Error('Both forces must select their Force Dispositions before battle start.')
      snapshot.setup.objectives = officialObjectivesForPair(pair[0], pair[1], config.officialLayout ?? 1)
    }
  }
  return {
    bringYourArmy: row.bring_your_army,
    id: row.id,
    code: row.code,
    battleId: row.battle_id,
    status: row.status,
    sessionSnapshot: row.bring_your_army && row.started_at ? rehydrateBattleSession(snapshot) : snapshot,
    startedAt: row.started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapParticipant(row: SupabaseParticipantRow): SharedParticipant {
  return {
    id: row.id,
    roomId: row.room_id,
    clientId: row.client_id,
    playerId: row.player_id,
    displayName: row.display_name,
    forceDisposition: row.force_disposition ?? null,
    isHost: row.is_host,
    isReady: row.is_ready,
    lastSeenAt: row.last_seen_at,
  }
}

export class SupabaseRestSharedSessionTransport implements SharedSessionTransport {
  private readonly url: string | undefined
  private readonly apiKey: string | undefined
  constructor(config?: { url: string; apiKey: string }) {
    this.url = (config?.url ?? env('VITE_SUPABASE_URL'))?.replace(/\/$/, '')
    this.apiKey = config?.apiKey ?? env('VITE_SUPABASE_PUBLISHABLE_KEY') ?? env('VITE_SUPABASE_ANON_KEY')
  }
  private readonly roomCodes = new Map<string, string>()

  get configured(): boolean {
    return Boolean(this.url && this.apiKey)
  }

  async preflight(): Promise<void> {
    const probeCode = 'AAAAAA'
    const schemaVersion = await this.request<number>('rpc/shared_schema_version', {
      method: 'POST',
      body: '{}',
    }, probeCode, 'preflight')
    assertSharedSchemaVersion(schemaVersion)
    await this.request<Pick<SupabaseRoomRow, 'id' | 'started_at'>[]>(
      'shared_rooms?select=id,started_at&limit=1',
      {},
      probeCode,
    )
    await this.request<Pick<SupabaseParticipantRow, 'id' | 'is_ready'>[]>(
      'shared_participants?select=id,is_ready&limit=1',
      {},
      probeCode,
    )
    await this.request<null>('rpc/start_shared_room', {
      method: 'POST',
      body: JSON.stringify({ p_room_id: '00000000-0000-0000-0000-000000000000' }),
    }, probeCode, 'preflight')
  }

  private rememberRoom(room: SharedRoom): void {
    this.roomCodes.set(room.id, room.code)
  }

  private roomCode(roomId: string): string {
    const code = this.roomCodes.get(roomId)
    if (!code) throw new Error('Shared room capability is unavailable. Re-open the room before retrying sync.')
    return code
  }

  private async request<T>(path: string, init: RequestInit = {}, roomCode?: string, clientId?: string): Promise<T> {
    if (!this.url || !this.apiKey) throw new Error('Shared sessions are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
    const legacyJwt = !this.apiKey.startsWith('sb_publishable_')
    const response = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.apiKey,
        ...(legacyJwt ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        'Content-Type': 'application/json',
        ...(roomCode ? { 'x-room-code': normalizeRoomCode(roomCode) } : {}),
        ...(clientId ? { 'x-client-id': clientId } : {}),
        ...init.headers,
      },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Shared session request failed (${response.status})${detail ? `: ${detail}` : ''}`)
    }
    if (response.status === 204) return undefined as T
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  async createRoom(session: BattleSession, hostPlayerId: string, clientId: string, bringYourArmy = false): Promise<SharedRoomInspection> {
    const host = session.state.players[hostPlayerId]
    if (!host) throw new Error('Choose a valid host player before sharing the battle.')

    // A BYA lobby must not expose private placeholder rosters selected by the
    // host's setup form. Actual rosters are only sent by their seated owners.
    const snapshot = structuredClone(session)
    if (bringYourArmy) {
      snapshot.setup.armies = {}
      snapshot.setup.players = snapshot.setup.players.map(({ armyId: _army, faction: _faction, ...player }) => player)
      snapshot.state.players = Object.fromEntries(Object.entries(snapshot.state.players).map(([id, player]) => [id, { ...player, armyId: undefined, faction: undefined, units: {} }]))
    }
    let room: SharedRoom | null = null
    let lastError: unknown
    for (let attempt = 0; attempt < 5 && !room; attempt += 1) {
      const code = createRoomCode()
      try {
        const rows = await this.request<SupabaseRoomRow[]>('shared_rooms', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            id: createPortableUuid(),
            code,
            battle_id: session.setup.gameId,
            status: session.state.status,
            session_snapshot: snapshot,
            host_client_id: clientId,
            started_at: null,
            ...(bringYourArmy ? { bring_your_army: true } : {}),
          }),
        }, code, clientId)
        room = rows[0] ? mapRoom(rows[0]) : null
      } catch (error) {
        lastError = error
      }
    }
    if (!room) throw lastError instanceof Error ? lastError : new Error('Could not create a unique shared room code.')

    this.rememberRoom(room)
    const participant = await this.upsertParticipant(room, hostPlayerId, clientId, true)
    return { room, participants: [participant] }
  }

  async inspectRoom(code: string): Promise<SharedRoomInspection | null> {
    const normalized = normalizeRoomCode(code)
    const rows = await this.request<SupabaseRoomRow[]>(`shared_rooms?code=eq.${encodeURIComponent(normalized)}&select=*&limit=1`, {}, normalized)
    const row = rows[0]
    if (!row) return null
    const room = mapRoom(row)
    this.rememberRoom(room)
    const rosters = room.bringYourArmy ? await this.request<{ player_id: string; client_id: string; army_data: Army; selection_id: string }[]>(`shared_rosters?room_id=eq.${encodeURIComponent(room.id)}&select=player_id,client_id,army_data,selection_id`, {}, room.code) : undefined
    const hostSettings = room.bringYourArmy && !room.startedAt
      ? await this.request<HostLobbySettings>('rpc/get_host_lobby_settings', {method:'POST',body:JSON.stringify({p_room_id:room.id})}, room.code)
      : undefined
    return { room, hostSettings, participants: await this.listParticipants(room.id), rosters: rosters?.map(r => ({ playerId: r.player_id, clientId: r.client_id, army: validateArmy(r.army_data), selectionId: r.selection_id })) }
  }

  async joinRoom(room: SharedRoom, playerId: string, clientId: string, preserveHost = false): Promise<SharedParticipant> {
    const player = room.sessionSnapshot.state.players[playerId]
    if (!player) throw new Error('That player seat does not exist in this battle.')
    this.rememberRoom(room)
    return this.upsertParticipant(room, playerId, clientId, preserveHost)
  }

  private async upsertParticipant(room: SharedRoom, playerId: string, clientId: string, isHost: boolean): Promise<SharedParticipant> {
    const player = room.sessionSnapshot.state.players[playerId]
    if (!player) throw new Error('Unknown player seat.')
    const rows = await this.request<SupabaseParticipantRow[]>('shared_participants?on_conflict=room_id,player_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation', 'x-seat-credential': seatCredential() },
      body: JSON.stringify({
        id: createPortableUuid(),
        room_id: room.id,
        client_id: clientId,
        player_id: playerId,
        display_name: player.name,
        is_host: isHost,
        is_ready: false,
        last_seen_at: new Date().toISOString(),
      }),
    }, room.code, clientId)
    const row = rows[0]
    if (!row) throw new Error('Could not claim the player seat.')
    return mapParticipant(row)
  }

  async publishEvents(roomId: string, events: BattleEvent[], submittedByPlayerId?: string, clientId?: string): Promise<void> {
    if (events.length === 0) return
    const normalizedEvents = events.map((event) => ({
      ...event,
      actorPlayerId: submittedByPlayerId ?? event.actorPlayerId,
    }))
    await this.request<unknown>('shared_events?on_conflict=room_id,event_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal', 'x-seat-credential': seatCredential() },
      body: JSON.stringify(normalizedEvents.map((event) => ({
        room_id: roomId,
        event_id: event.id,
        action_id: event.actionId,
        actor_player_id: event.actorPlayerId ?? null,
        event_payload: event,
      }))),
    }, this.roomCode(roomId), clientId)
  }

  async battleClock(roomId: string, clientId: string, command?: ClockCommand | { type: 'configure'; config: ClockConfig }, revision?: number): Promise<ClockSnapshot> {
    return this.request<ClockSnapshot>('rpc/battle_clock_action', {
      method: 'POST', headers: { 'x-seat-credential': seatCredential() },
      body: JSON.stringify({ p_room_id: roomId, p_command: command?.type ?? 'read', p_revision: revision ?? null,
        p_target: command?.type === 'pass' ? command.targetId : null,
        p_config: command?.type === 'configure' ? command.config : null }),
    }, this.roomCode(roomId), clientId)
  }

  async listEvents(roomId: string, afterSequence: number): Promise<SharedEventEnvelope[]> {
    const rows = await this.request<SupabaseEventRow[]>(`shared_events?room_id=eq.${encodeURIComponent(roomId)}&sequence=gt.${afterSequence}&select=sequence,room_id,event_payload,created_at&order=sequence.asc`, {}, this.roomCode(roomId))
    return rows.map((row) => ({
      sequence: Number(row.sequence),
      roomId: row.room_id,
      event: row.event_payload,
      receivedAt: row.created_at,
    }))
  }

  async listParticipants(roomId: string): Promise<SharedParticipant[]> {
    const rows = await this.request<SupabaseParticipantRow[]>(`shared_participants?room_id=eq.${encodeURIComponent(roomId)}&select=*&order=is_host.desc,display_name.asc`, {}, this.roomCode(roomId))
    return rows.map(mapParticipant)
  }

  async touchParticipant(roomId: string, clientId: string): Promise<void> {
    await this.request<void>(`shared_participants?room_id=eq.${encodeURIComponent(roomId)}&client_id=eq.${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
    }, this.roomCode(roomId), clientId)
  }

  async stageRoster(roomId: string, clientId: string, army: Army, owner: string | null): Promise<void> {
    const roster = validateArmy(army)
    delete roster.localMediaId
    const capability = this.roomCode(roomId)
    if (owner) {
      await accountRequest(owner, (client, token) => client.rpc('stage_shared_roster', { p_room_id: roomId, p_army: roster })
        .setHeader('Authorization', `Bearer ${token}`).setHeader('x-room-code', capability).setHeader('x-client-id', clientId))
    } else {
      await this.request('rpc/stage_shared_roster', { method: 'POST', body: JSON.stringify({ p_room_id: roomId, p_army: roster }) }, capability, clientId)
    }
  }

  async setHostLobbySettings(roomId: string, clientId: string, settings: HostLobbySettings): Promise<void> {
    await this.request('rpc/set_host_lobby_settings', { method: 'POST', headers: { 'x-seat-credential': seatCredential() }, body: JSON.stringify({ p_room_id: roomId, p_turn_order: settings.turnOrder, p_team_alpha: settings.teamAlpha }) }, this.roomCode(roomId), clientId)
  }

  async setSeatSettings(roomId: string, clientId: string, disposition: string | null, owner: string | null): Promise<void> {
    const roomCode = this.roomCode(roomId)
    const payload = { p_room_id: roomId, p_force_disposition: disposition }
    if (owner) {
      await accountRequest(owner, (client, token) => client.rpc('set_shared_seat_settings', payload)
        .setHeader('Authorization', `Bearer ${token}`).setHeader('x-room-code', roomCode).setHeader('x-client-id', clientId).setHeader('x-seat-credential', seatCredential()))
    } else {
      await this.request('rpc/set_shared_seat_settings', { method: 'POST', headers: { 'x-seat-credential': seatCredential() }, body: JSON.stringify(payload) }, roomCode, clientId)
    }
  }

  async setParticipantReady(roomId: string, clientId: string, ready: boolean): Promise<void> {
    await this.request<void>(`shared_participants?room_id=eq.${encodeURIComponent(roomId)}&client_id=eq.${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_ready: ready, last_seen_at: new Date().toISOString() }),
    }, this.roomCode(roomId), clientId)
  }

  async releaseParticipant(roomId: string, clientId: string): Promise<void> {
    await this.request<void>(`shared_participants?room_id=eq.${encodeURIComponent(roomId)}&client_id=eq.${encodeURIComponent(clientId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_ready: false, last_seen_at: '1970-01-01T00:00:00.000Z' }),
    }, this.roomCode(roomId), clientId)
  }

  async startRoom(roomId: string, clientId: string): Promise<string> {
    const startedAt = await this.request<string | null>('rpc/start_shared_room', {
      method: 'POST',
      body: JSON.stringify({ p_room_id: roomId }),
    }, this.roomCode(roomId), clientId)
    if (!startedAt) throw new Error('The room could not be started. Refresh the lobby and try again.')
    return startedAt
  }

  async closeWaitingRoom(roomId: string, clientId: string): Promise<void> {
    // A delayed Start acknowledgement must not let Leave abandon a live battle.
    await this.request<void>(`shared_rooms?id=eq.${encodeURIComponent(roomId)}&started_at=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'abandoned', updated_at: new Date().toISOString() }),
    }, this.roomCode(roomId), clientId)
  }

  async updateRoomStatus(roomId: string, status: BattleLifecycleStatus, clientId?: string): Promise<void> {
    await this.request<void>(`shared_rooms?id=eq.${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    }, this.roomCode(roomId), clientId)
  }
}

export const sharedSessionTransport = new SupabaseRestSharedSessionTransport()
