import type { BrowserContext, Route } from '@playwright/test'

type JsonObject = Record<string, unknown>

type RoomRow = JsonObject & {
  id: string
  code: string
  battle_id: string
  status: string
  session_snapshot: JsonObject
  host_client_id: string
  started_at: string | null
  created_at: string
  updated_at: string
}

type ParticipantRow = JsonObject & {
  id: string
  room_id: string
  client_id: string
  player_id: string
  display_name: string
  is_host: boolean
  is_ready: boolean
  last_seen_at: string
}

type EventRow = JsonObject & {
  sequence: number
  room_id: string
  event_id: string
  event_payload: JsonObject
  created_at: string
}

function eq(value: string | null): string | undefined {
  return value?.startsWith('eq.') ? value.slice(3) : undefined
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

export class MockSupabase {
  private rooms: RoomRow[] = []
  private participants: ParticipantRow[] = []
  private events: EventRow[] = []
  private eventAttempts = new Map<string, number>()
  failNextEventInsertAfterCommit = false

  async attach(context: BrowserContext): Promise<void> {
    await context.route('https://mock.supabase.test/rest/v1/**', (route) => this.handle(route))
  }

  storedEvents(type: string, playerId: string): EventRow[] {
    return this.events.filter((event) => (
      event.event_payload.type === type
      && (event.event_payload.payload as JsonObject | undefined)?.playerId === playerId
    ))
  }

  attemptsFor(eventId: string): number {
    return this.eventAttempts.get(eventId) ?? 0
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request()
    const url = new URL(request.url())
    const resource = url.pathname.replace(/^\/rest\/v1\//, '')
    const method = request.method()

    if (resource === 'rpc/shared_schema_version') return void await json(route, 5)

    if (resource === 'rpc/start_shared_room') {
      const body = request.postDataJSON() as { p_room_id?: string }
      const room = this.rooms.find((candidate) => candidate.id === body.p_room_id)
      if (!room) return void await json(route, null)
      const playerCount = ((room.session_snapshot.setup as JsonObject).players as unknown[]).length
      const onlineReady = this.participants.filter((participant) => (
        participant.room_id === room.id
        && participant.is_ready
        && Date.now() - Date.parse(participant.last_seen_at) < 20_000
      ))
      if (onlineReady.length !== playerCount) {
        return void await json(route, { message: `All ${playerCount} player seats must be online and ready before starting.` }, 400)
      }
      room.started_at = new Date().toISOString()
      room.updated_at = room.started_at
      return void await json(route, room.started_at)
    }

    if (resource === 'shared_rooms') {
      if (method === 'GET') {
        const code = eq(url.searchParams.get('code'))
        const id = eq(url.searchParams.get('id'))
        const rows = this.rooms.filter((room) => (!code || room.code === code) && (!id || room.id === id))
        return void await json(route, rows)
      }
      if (method === 'POST') {
        const now = new Date().toISOString()
        const input = request.postDataJSON() as RoomRow
        const room: RoomRow = { ...input, started_at: input.started_at ?? null, created_at: now, updated_at: now }
        this.rooms.push(room)
        return void await json(route, [room], 201)
      }
      if (method === 'PATCH') {
        const id = eq(url.searchParams.get('id'))
        const patch = request.postDataJSON() as Partial<RoomRow>
        this.rooms.filter((room) => !id || room.id === id).forEach((room) => Object.assign(room, patch))
        return void await route.fulfill({ status: 204 })
      }
    }

    if (resource === 'shared_participants') {
      if (method === 'GET') {
        const roomId = eq(url.searchParams.get('room_id'))
        return void await json(route, this.participants.filter((participant) => !roomId || participant.room_id === roomId))
      }
      if (method === 'POST') {
        const input = request.postDataJSON() as ParticipantRow
        const existing = this.participants.find((participant) => (
          participant.room_id === input.room_id
          && (participant.player_id === input.player_id || participant.client_id === input.client_id)
        ))
        const participant = existing ?? input
        Object.assign(participant, input)
        if (!existing) this.participants.push(participant)
        return void await json(route, [participant], 201)
      }
      if (method === 'PATCH') {
        const roomId = eq(url.searchParams.get('room_id'))
        const clientId = eq(url.searchParams.get('client_id'))
        const patch = request.postDataJSON() as Partial<ParticipantRow>
        this.participants
          .filter((participant) => (!roomId || participant.room_id === roomId) && (!clientId || participant.client_id === clientId))
          .forEach((participant) => Object.assign(participant, patch))
        return void await route.fulfill({ status: 204 })
      }
    }

    if (resource === 'shared_events') {
      if (method === 'GET') {
        const roomId = eq(url.searchParams.get('room_id'))
        const after = Number(url.searchParams.get('sequence')?.replace(/^gt\./, '') ?? 0)
        return void await json(route, this.events.filter((event) => event.room_id === roomId && event.sequence > after))
      }
      if (method === 'POST') {
        const inputs = request.postDataJSON() as Array<JsonObject & { room_id: string; event_id: string; event_payload: JsonObject }>
        for (const input of inputs) {
          this.eventAttempts.set(input.event_id, (this.eventAttempts.get(input.event_id) ?? 0) + 1)
          if (this.events.some((event) => event.room_id === input.room_id && event.event_id === input.event_id)) continue
          this.events.push({
            ...input,
            sequence: this.events.length + 1,
            created_at: new Date().toISOString(),
          })
        }
        if (this.failNextEventInsertAfterCommit) {
          this.failNextEventInsertAfterCommit = false
          return void await json(route, { message: 'Simulated lost acknowledgement' }, 503)
        }
        return void await route.fulfill({ status: 204 })
      }
    }

    await json(route, { message: `Unhandled mock endpoint: ${method} ${resource}` }, 500)
  }
}
