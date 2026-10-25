import type { BrowserContext, Route } from '@playwright/test'
// @ts-ignore JavaScript fixture shared with the SQL runner.
import { createTestDatabase } from '../scripts/testDatabase.mjs'
import { MockAccounts } from './mockAccounts'

/** Real PostgreSQL for REST/RPC tests. Only Auth delivery and HTTP routing are
 * simulated; SQL, grants, RLS, triggers and RPC bodies execute unchanged. */
export class PostgresBackend {
  private db: Awaited<ReturnType<typeof createTestDatabase>> | null = null
  private accounts = new MockAccounts()
  async init() {
    this.db = await createTestDatabase()
    await this.db.exec(
      `insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')`,
    )
  }
  async close() {
    await this.db?.close()
  }
  async attach(context: BrowserContext) {
    await this.accounts.attach(context)
    await context.route('https://mock.supabase.test/rest/v1/**', (route) =>
      this.handle(route),
    )
  }
  async expirePresence(roomId: string, playerId: string) {
    await this.db!.query(
      `update public.shared_participants set last_seen_at=now()-interval '1 minute' where room_id=$1 and player_id=$2`,
      [roomId, playerId],
    )
  }
  private async handle(route: Route) {
    const request = route.request(),
      url = new URL(request.url())
    const resource = url.pathname.replace('/rest/v1/', '')
    let owner = ''
    try {
      owner =
        JSON.parse(
          Buffer.from(
            request.headers().authorization.split('.')[1],
            'base64url',
          ).toString(),
        ).sub ?? ''
    } catch {
      /* guest */
    }
    if (process.env.DEBUG_SOCIAL) console.log(request.method(), resource)
    const role = owner ? 'authenticated' : 'anon'
    try {
      const result = await this.db!.transaction(async (tx: any) => {
        await tx.exec(`set local role ${role}`)
        await tx.query(
          `select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers',$3,true)`,
          [
            owner,
            JSON.stringify({ sub: owner }),
            JSON.stringify(request.headers()),
          ],
        )
        const body = request.postDataJSON()
        if (resource.startsWith('rpc/')) {
          const name = resource.slice(4)
          if (
            ![
              'battle_clock_action',
              'social_action',
              'stage_shared_roster',
              'set_shared_seat_settings',
              'set_host_lobby_settings',
              'get_host_lobby_settings',
              'save_user_army',
              'shared_schema_version',
              'start_shared_room',
            ].includes(name)
          )
            throw new Error('Unknown RPC')
          const entries = Object.entries(body ?? {})
          if (entries.some(([k]) => !/^p_[a-z_]+$/.test(k)))
            throw new Error('Invalid RPC argument')
          const { rows } = await tx.query(
            `select public.${name}(${entries.map(([k], i) => `${k} := $${i + 1}`).join(',')}) as result`,
            entries.map(([, v]) =>
              v && typeof v === 'object' ? JSON.stringify(v) : v,
            ),
          )
          return rows[0].result
        }
        if (
          ![
            'user_armies',
            'shared_rooms',
            'shared_participants',
            'shared_events',
            'shared_rosters',
          ].includes(resource)
        )
          throw new Error('Unknown table')
        const values: unknown[] = []
        const conditions: string[] = []
        for (const [key, val] of url.searchParams.entries()) {
          if (
            ['select', 'order', 'on_conflict', 'limit', 'offset'].includes(key)
          )
            continue
          if (!/^[a-z_]+$/.test(key)) throw new Error('Invalid filter')
          if (val === 'is.null') { conditions.push(`${key} is null`); continue }
          const match = /^(eq|gt)\.(.*)$/.exec(val)
          if (!match) throw new Error('Invalid comparison')
          values.push(match[2])
          conditions.push(
            `${key} ${match[1] === 'eq' ? '=' : '>'} $${values.length}`,
          )
        }
        const where = conditions.length
          ? `where ${conditions.join(' and ')}`
          : ''
        if (request.method() === 'GET') {
          const order = url.searchParams.get('order')
          if (
            order &&
            !/^[a-z_]+\.(asc|desc)(,[a-z_]+\.(asc|desc))*$/.test(order)
          )
            throw new Error('Invalid order')
          const limit = Math.min(
            10000,
            Number(url.searchParams.get('limit') ?? 10000),
          )
          const offset = Number(url.searchParams.get('offset') ?? 0)
          return (
            await tx.query(
              `select * from public.${resource} ${where} ${order ? `order by ${order.replaceAll('.', ' ')}` : ''} limit ${limit} offset ${offset}`,
              values,
            )
          ).rows
        }
        if (request.method() === 'PATCH') {
          const fields = Object.entries(body)
          if (fields.some(([k]) => !/^[a-z_]+$/.test(k)))
            throw new Error('Invalid column')
          const start = values.length
          const assignments = fields.map(([k], i) => `${k}=$${start + i + 1}`)
          return (
            await tx.query(
              `update public.${resource} set ${assignments.join(',')} ${where} returning *`,
              [
                ...values,
                ...fields.map(([, v]) =>
                  v && typeof v === 'object' ? JSON.stringify(v) : v,
                ),
              ],
            )
          ).rows
        }
        if (request.method() === 'POST') {
          const records = Array.isArray(body) ? body : [body]
          const rows = []
          for (const record of records) {
            const fields = Object.keys(record)
            if (fields.some((k) => !/^[a-z_]+$/.test(k)))
              throw new Error('Invalid column')
            const conflict = url.searchParams.get('on_conflict')
            if (conflict && !/^[a-z_,]+$/.test(conflict))
              throw new Error('Invalid conflict')
            const clause = !conflict
              ? ''
              : request.headers().prefer?.includes('ignore-duplicates')
                ? `on conflict(${conflict}) do nothing`
                : `on conflict(${conflict}) do update set ${fields.map((k) => `${k}=excluded.${k}`).join(',')}`
            rows.push(
              ...(
                await tx.query(
                  `insert into public.${resource}(${fields.join(',')}) values(${fields.map((_, i) => `$${i + 1}`).join(',')}) ${clause} returning *`,
                  fields.map((k) =>
                    record[k] && typeof record[k] === 'object'
                      ? JSON.stringify(record[k])
                      : record[k],
                  ),
                )
              ).rows,
            )
          }
          return rows
        }
        throw new Error('Unsupported method')
      })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result ?? null),
      })
    } catch (error) {
      if (process.env.DEBUG_SOCIAL) console.log('SQL ERROR', resource, error)
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
        }),
      })
    }
  }
}
