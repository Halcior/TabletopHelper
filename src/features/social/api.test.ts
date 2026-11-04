import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import fixture from '../../../test-data/1700.json'
import { NewRecruitImporter } from '../../importers/newRecruit'
const state = vi.hoisted(() => ({
  headers: [] as string[],
  schema: 9,
  response: null as unknown,
}))
vi.mock('../account/client', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return {
    accountClient: createClient('https://social.test', 'sb_publishable_test', {
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
          return new Response(JSON.stringify(String(_input).includes('/rpc/shared_schema_version') ? state.schema : state.response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        },
      },
    }),
  }
})
import { accountClient } from '../account/client'
import { useRosterScope } from '../armyLibrary/scope'
import { accountRequest, sharedArmies, social } from './api'
const session = (owner: string) => ({
  data: {
    session: { user: { id: owner }, access_token: `token-${owner}` } as Session,
  },
  error: null,
})
beforeEach(async () => {
  vi.restoreAllMocks()
  await accountClient!.auth.getSession()
  useRosterScope.setState({ userId: 'a' })
  state.schema = 12
  state.headers = []
  state.response = {}
  vi.spyOn(accountClient!.auth, 'getSession').mockResolvedValue(session('a'))
})
it('binds the captured token even if the SDK later reads another session', async () => {
  let calls = 0
  vi.mocked(accountClient!.auth.getSession).mockImplementation(async () =>
    session(++calls === 1 ? 'a' : 'b'),
  )
  await social('a', 'request', { user_id: 'b' })
  expect(state.headers).toEqual(['Bearer token-a', 'Bearer token-a'])
})
it('rejects an account mismatch before sending a social request', async () => {
  await expect(social('b', 'profile')).rejects.toThrow('account changed')
  expect(state.headers).toHaveLength(0)
})
it('rejects a switch while the session lookup is pending', async () => {
  vi.mocked(accountClient!.auth.getSession).mockImplementation(async () => {
    useRosterScope.setState({ userId: 'b' })
    return session('a')
  })
  await expect(social('a', 'shared', { user_id: 'b' })).rejects.toThrow(
    'account changed',
  )
  expect(state.headers).toHaveLength(0)
})
it('discards data returned after sign-out', async () => {
  const result = accountRequest('a', async () => {
    useRosterScope.setState({ userId: null })
    return { data: 'private data', error: null }
  })
  await expect(result).rejects.toThrow('account changed')
})
it('rejects A → B → A late results despite matching current owner', async () => {
  const result = accountRequest('a', async () => {
    useRosterScope.setState({ userId: 'b' })
    useRosterScope.setState({ userId: 'a' })
    return { data: 'stale', error: null }
  })
  await expect(result).rejects.toThrow('account changed')
})
it('removes local photo namespaces from shared-army responses', async () => {
  const army = NewRecruitImporter.import(fixture).army
  army.localMediaId = 'private-device-photos'
  state.response = [{ id: army.id, army }]
  expect((await sharedArmies('a', 'b'))[0].localMediaId).toBeUndefined()
})
it('rejects invalid shared roster identity rather than caching it', async () => {
  state.response = [
    { id: 'wrong', army: NewRecruitImporter.import(fixture).army },
  ]
  await expect(sharedArmies('a', 'b')).rejects.toThrow('identity')
})
it('propagates backend permission errors without returning prior data', async () => {
  await expect(
    accountRequest('a', async () => ({
      data: null,
      error: new Error('Friend access required'),
    })),
  ).rejects.toThrow('Friend access required')
})

it('rejects a version-6 server before calling social endpoints', async () => {
  state.schema = 6
  await expect(social('a', 'profile')).rejects.toThrow('older than required')
  expect(state.headers).toHaveLength(1)
})
