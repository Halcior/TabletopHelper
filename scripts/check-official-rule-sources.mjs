import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../src/rulesets/officialRuleSources.json', import.meta.url), 'utf8'))
const assetOrigin = 'https://assets.warhammer-community.com/'
const indexUrl = new URL('/api/search/downloads/', config.downloads)
const timeout = () => AbortSignal.timeout(30_000)

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: timeout() })
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return response
}

try {
  const index = await request(indexUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index: 'downloads_v2', searchTerm: '', gameSystem: 'warhammer-40000', language: 'english' }),
  })
  const { hits } = await index.json()
  const listings = new Map(hits.map(({ id }) => [id.title, id]))
  const report = await Promise.all(Object.entries(config.sources).map(async ([key, pinned]) => {
    try {
      if (key === 'mfm') {
        const article = await (await request(config.downloads)).text()
        const label = article.match(/href="https?:\/\/mfm\.warhammer-community\.com\/?"><span>updated (\d{2}\/\d{2}\/\d{4})/i)?.[1]
        if (!label) throw new Error('MFM update label was unavailable')
        const publishedAt = label.split('/').reverse().join('-')
        return { source: pinned.title, pinnedDate: pinned.publishedAt, publishedAt, changed: pinned.publishedAt !== publishedAt, scope: 'download listing' }
      }
      const listed = listings.get(pinned.title)
      if (!listed) throw new Error('Download not found in the official index')
      const url = assetOrigin + listed.file
      const publishedAt = listed.last_updated.split('/').reverse().join('-')
      const sha256 = createHash('sha256').update(Buffer.from(await (await request(url)).arrayBuffer())).digest('hex')
      return { source: pinned.title, pinnedDate: pinned.publishedAt, publishedAt, pinnedUrl: pinned.url, url,
        pinnedHash: pinned.sha256, sha256, changed: publishedAt !== pinned.publishedAt || url !== pinned.url || sha256 !== pinned.sha256 }
    } catch (error) {
      return { source: pinned.title, unavailable: error.message }
    }
  }))
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.some(item => item.unavailable) ? 2 : Number(report.some(item => item.changed))
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
