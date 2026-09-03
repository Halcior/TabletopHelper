import type { BattleEvent, BattleLifecycleStatus, BattleSession } from '../domain/battle/types'
import { createRoomCode, normalizeRoomCode } from './roomCode'
import type {
  SharedEventEnvelope,
  SharedParticipant,
  SharedRoom,
  SharedRoomInspection,
  SharedSessionTransport,
} from './types'
import { createPortableUuid } from './uuid'

type SupabaseRoomRow = {
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
  return {
    id: row.id,
    code: row.code,
    battleId: row.battle_id,
    status: row.status,
    sessionSnapshot: row.session_snapshot,
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
    isHost: row.is_host,
    isReady: row.is_ready,
    lastSeenAt: row.last_seen_at,
  }
}

export class SupabaseRestSharedSessionTransport implements SharedSessionTransport {
  private readonly url = env('VITE_SUPABASE_URL')?.replace(/\/$/, '')
  private readonly apiKey = env('VITE_SUPABASE_PUBLISHABLE_KEY') ?? env('VITE_SUPABASE_ANON_KEY')
  private readonly roomCodes = new Map<string, string>()

  get configured(): boolean {
    return Boolean(this.url && this.apiKey)
  }

  async preflight(): Promise<void> {
    const probeCode = 'AAAAAA'
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

  async createRoom(session: BattleSession, hostPlayerId: string, clientId: string): Promise<SharedRoomInspection> {
    const host = session.state.players[hostPlayerId]
    if (!host) throw new Error('Choose a valid host player before sharing the battle.')

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
            session_snapshot: session,
            host_client_id: clientId,
            started_at: null,
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
    return { room, participants: await this.listParticipants(room.id) }
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
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
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
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(normalizedEvents.map((event) => ({
        room_id: roomId,
        event_id: event.id,
        action_id: event.actionId,
        actor_player_id: event.actorPlayerId ?? null,
        event_payload: event,
      }))),
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

  async updateRoomStatus(roomId: string, status: BattleLifecycleStatus, clientId?: string): Promise<void> {
    await this.request<void>(`shared_rooms?id=eq.${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
    }, this.roomCode(roomId), clientId)
  }
}

export const sharedSessionTransport = new SupabaseRestSharedSessionTransport()
