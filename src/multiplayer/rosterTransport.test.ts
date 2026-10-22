import { afterEach, expect, it, vi } from 'vitest'
import { SupabaseRestSharedSessionTransport } from './supabaseRestTransport'
import { createBattleSession } from '../domain/battle/engine'
import { NewRecruitImporter } from '../importers/newRecruit'
import fixture from '../../test-data/1700.json'
function setup() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://rooms.test')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  const army = NewRecruitImporter.import(fixture).army
  const session = createBattleSession({
    rulesetId: 'test',
    armies: [army],
    players: [
      { id: 'a', name: 'A', armyId: army.id },
      { id: 'b', name: 'B', armyId: army.id },
    ],
  })
  return {
    session,
    army,
    transport: new SupabaseRestSharedSessionTransport({
      url: 'https://rooms.test',
      apiKey: 'sb_publishable_test',
    }),
  }
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
it('creates provisional BYA rooms without leaking the hosts private placeholder rosters', async () => {
  const { session, transport } = setup()
  const bodies: Record<string, any>[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      bodies.push(body)
      return new Response(
        JSON.stringify([{ ...body, created_at: 'now', updated_at: 'now' }]),
        { status: 200 },
      )
    }),
  )
  await transport.createRoom(session, 'a', 'host', true)
  const payload = bodies[0].session_snapshot
  expect(payload.setup.armies).toEqual({})
  expect(payload.setup.players.every((p: any) => p.armyId === undefined)).toBe(
    true,
  )
  expect(
    Object.values(payload.state.players).every(
      (p: any) => Object.keys(p.units).length === 0,
    ),
  ).toBe(true)
  expect(Object.keys(session.setup.armies)).not.toHaveLength(0)
  expect(bodies[0].bring_your_army).toBe(true)
})
it('rehydrates the final server roster snapshot rather than stale provisional units', async () => {
  const { session, army, transport } = setup()
  session.setup.players[0].armyId = 'seat:a'
  session.setup.armies = { 'seat:a': { ...army, id: 'seat:a' } }
  const room = {
    id: 'room',
    code: 'ABC234',
    battle_id: session.setup.gameId,
    status: 'active',
    bring_your_army: true,
    session_snapshot: session,
    started_at: '2026-10-22T08:00:00Z',
    created_at: 'now',
    updated_at: 'now',
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(url.includes('shared_rooms?') ? [room] : []),
          { status: 200 },
        ),
    ),
  )
  const result = await transport.inspectRoom('ABC234')
  expect(result!.room.sessionSnapshot.state.players.a.armyId).toBe('seat:a')
  expect(
    Object.keys(result!.room.sessionSnapshot.state.players.a.units),
  ).toHaveLength(army.units.length)
})

it('only closes rooms that are still waiting when the database handles Leave', async () => {
  const { session, transport } = setup()
  const room = { id:'room',code:'ABC234',battle_id:session.setup.gameId,status:'active',session_snapshot:session,started_at:null,created_at:'now',updated_at:'now' }
  const writes: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    if (init.method === 'PATCH') { writes.push(url); return new Response(null,{status:204}) }
    return new Response(JSON.stringify(url.includes('shared_rooms?') ? [room] : []),{status:200})
  }))
  await transport.inspectRoom('ABC234')
  await transport.closeWaitingRoom('room', 'host')
  expect(new URL(writes[0]).searchParams.get('started_at')).toBe('is.null')
})
