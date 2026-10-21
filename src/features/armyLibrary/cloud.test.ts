import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import fixture from '../../../test-data/1700.json'
import { NewRecruitImporter } from '../../importers/newRecruit'
import type { AccountArmy } from '../../persistence/storage'

const state = vi.hoisted(() => ({
  headers: [] as string[],
  bodies: [] as Record<string, unknown>[],
  response: null as unknown,
}))
vi.mock('../account/client', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(
    'https://private-rosters.test',
    'sb_publishable_test',
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: async (_input, init) => {
          state.headers.push(
            new Headers(init?.headers).get('Authorization') ?? '',
          )
          if (init?.body) state.bodies.push(JSON.parse(String(init.body)))
          return new Response(JSON.stringify(state.response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      },
    },
  )
  return { accountClient: client }
})
import { accountClient } from '../account/client'
import { cloudTransport } from './cloud'

beforeEach(async () => {
  vi.restoreAllMocks()
  await accountClient!.auth.getSession()
  state.headers = []
  state.bodies = []
  let calls = 0
  // The first ownership check sees A. The SDK's later token lookup sees B.
  // This exercises the real SDK fetch wrapper rather than a mock transport.
  vi.spyOn(accountClient!.auth, 'getSession').mockImplementation(async () => {
    calls++
    const owner = calls === 1 ? 'a' : 'b'
    return {
      data: {
        session: {
          access_token: `token-${owner}`,
          user: { id: owner },
        } as Session,
      },
      error: null,
    }
  })
})
function row(): AccountArmy {
  const army = NewRecruitImporter.import(fixture).army
  army.id = 'a4c378e1-d07b-4e2b-8c8c-53abf9433ff0'
  army.localMediaId = 'account:a:private-photo-namespace'
  return {
    id: army.id,
    army,
    ownerId: 'a',
    savedAt: 'now',
    changeId: 'mutation',
    revision: 0,
    pending: true,
  }
}
function remote(r: AccountArmy) {
  return {
    id: r.id,
    user_id: 'a',
    army_data: r.army,
    mutation_id: r.changeId,
    revision: 1,
    updated_at: 'now',
    deleted_at: null,
  }
}
it('binds an upload to A even when the SDK session switches to B before fetch', async () => {
  const pending = row()
  state.response = { applied: true, row: remote(pending) }
  await cloudTransport.write('a', pending)
  expect(accountClient!.auth.getSession).toHaveBeenCalledTimes(2)
  expect(state.headers).toEqual(['Bearer token-a'])
  expect(
    (state.bodies[0].p_army_data as Record<string, unknown>).localMediaId,
  ).toBeUndefined()
})
it('binds downloads to their captured account token too', async () => {
  const pending = row()
  state.response = [remote(pending)]
  expect(await cloudTransport.list('a')).toHaveLength(1)
  expect(accountClient!.auth.getSession).toHaveBeenCalledTimes(2)
  expect(state.headers).toEqual(['Bearer token-a'])
})
it('rejects a pending mutation that belongs to a different account before any request', async () => {
  await expect(cloudTransport.write('b', row())).rejects.toThrow(
    'does not match',
  )
  expect(state.headers).toHaveLength(0)
})
