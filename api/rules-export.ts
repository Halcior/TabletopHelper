import { FILES, EXPORT_BASE } from '../src/features/companion/data'

/** Fixed allowlist: never accepts a user-supplied upstream URL or credentials. */
export async function GET(request: Request): Promise<Response> {
  const file = new URL(request.url).searchParams.get('file') ?? ''
  if (!Object.hasOwn(FILES, file)) return new Response('Unknown export file', { status: 400 })
  try {
    const upstream = await fetch(`${EXPORT_BASE}${file}`, { redirect: 'error', signal: AbortSignal.timeout(30000) })
    if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`)
    const text = await upstream.text()
    if (text.length > 3_000_000 || !text.replace(/^\uFEFF/, '').split(/\r?\n/)[0].includes('|'))
      throw new Error('Invalid export response')
    return new Response(text, { headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch (error) {
    console.error('Wahapedia export unavailable', file, error instanceof Error ? error.message : 'fetch failed')
    return new Response('Export unavailable. Import downloaded CSV files.', { status: 502 })
  }
}
