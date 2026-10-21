import type { BrowserContext, Route } from '@playwright/test'

type Row = {
  id: string
  user_id: string
  army_data: Record<string, unknown>
  revision: number
  mutation_id: string
  deleted_at: string | null
  updated_at: string
  source_local_id: string | null
}
const USERS = {
  'a@example.test': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'b@example.test': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
}
export class MockAccounts {
  rows = new Map<string, Row>()
  refreshes = 0
  failNetwork = false
  private session(email: string) {
    const id = USERS[email as keyof typeof USERS]
    if (!id) return null
    const payload = Buffer.from(
      JSON.stringify({
        sub: id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
        aud: 'authenticated',
      }),
    ).toString('base64url')
    return {
      access_token: `eyJhbGciOiJub25lIn0.${payload}.test`,
      refresh_token: `refresh:${email}`,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    }
  }
  async attach(context: BrowserContext) {
    await context.route('https://mock.supabase.test/**', async (route) => {
      if (this.failNetwork) return route.abort('internetdisconnected')
      const req = route.request(),
        url = new URL(req.url()),
        body = req.postDataJSON() ?? {}
      const respond = (value: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(value),
        })
      if (url.pathname === '/auth/v1/otp') return respond({})
      if (url.pathname === '/auth/v1/verify') {
        if (body.token !== '123456')
          return respond({ message: 'Invalid or expired code' }, 403)
        const session = this.session(body.email)
        return session
          ? respond(session)
          : respond({ message: 'Unknown test account' }, 403)
      }
      if (url.pathname === '/auth/v1/token') {
        this.refreshes++
        return respond(
          this.session(String(body.refresh_token).replace('refresh:', '')),
        )
      }
      if (url.pathname === '/auth/v1/logout')
        return route.fulfill({ status: 204 })
      const auth = req.headers().authorization ?? ''
      let owner: string | undefined
      try {
        owner = JSON.parse(
          Buffer.from(auth.split('.')[1], 'base64url').toString(),
        ).sub
      } catch {
        /* guest */
      }
      if (url.pathname === '/rest/v1/user_armies') {
        if (!owner) return respond({ message: 'Authentication required' }, 401)
        const rows = [...this.rows.values()]
          .filter((row) => row.user_id === owner)
          .sort((a, b) => a.id.localeCompare(b.id))
        return respond(rows)
      }
      if (url.pathname === '/rest/v1/rpc/save_user_army') {
        if (!owner) return respond({ message: 'Authentication required' }, 401)
        const key = `${owner}:${body.p_id}`,
          old = this.rows.get(key)
        if (old?.mutation_id === body.p_mutation_id)
          return respond({ applied: true, row: old })
        if (
          old &&
          (old.revision !== body.p_expected_revision || old.deleted_at)
        )
          return respond({ applied: false, row: old })
        const row: Row = {
          id: body.p_id,
          user_id: owner,
          army_data: body.p_army_data,
          revision: (old?.revision ?? 0) + 1,
          mutation_id: body.p_mutation_id,
          deleted_at: body.p_deleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
          source_local_id: body.p_source_local_id ?? null,
        }
        this.rows.set(key, row)
        return respond({ applied: true, row })
      }
      return respond(
        { message: `Unexpected mock account route ${url.pathname}` },
        404,
      )
    })
  }
}
