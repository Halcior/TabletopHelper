import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../../../api/rules-export'
afterEach(() => { vi.unstubAllGlobals() })
describe('fixed Wahapedia export endpoint', () => {
  it('rejects arbitrary URLs/paths before fetching', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    expect((await GET(new Request('https://app.test/api/rules-export?file=https://private.test'))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('fetches only an allowlisted export and never caches a stale version', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('id|name|\nAC|Custodes|'))
    vi.stubGlobal('fetch', fetch)
    const response = await GET(new Request('https://app.test/api/rules-export?file=Factions.csv'))
    expect(response.status).toBe(200)
    expect(fetch.mock.calls[0][0]).toBe('https://wahapedia.ru/wh40k11ed/Factions.csv')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('does not pass an upstream HTML error page through as CSV', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Blocked</html>')))
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect((await GET(new Request('https://app.test/api/rules-export?file=Factions.csv'))).status).toBe(502)
    quiet.mockRestore()
  })
})
