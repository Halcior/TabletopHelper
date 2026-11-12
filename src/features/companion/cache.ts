import Dexie, { type EntityTable } from 'dexie'
import { type RulesBundle, type ExportFile, FILES, importRules } from './data'

type Preference = { key: string; datasetId?: string; matches?: Record<string, string>; favorites?: string[]; unitId?: string }
class CompanionCache extends Dexie {
  bundles!: EntityTable<RulesBundle, 'id'>
  preferences!: EntityTable<Preference, 'key'>
  constructor() { super('tabletophelper-rules'); this.version(1).stores({ bundles: '&id, importedAt', preferences: '&key' }) }
}
export const rulesCache = new CompanionCache()
export async function saveBundle(bundle: RulesBundle) {
  // Keep first import time for an identical content-addressed snapshot.
  if (!await rulesCache.bundles.get(bundle.id)) await rulesCache.bundles.put(bundle)
}
export async function updatePreference(key: string, patch: Partial<Preference>) {
  await rulesCache.transaction('rw', rulesCache.preferences, async () => {
    await rulesCache.preferences.put({ ...await rulesCache.preferences.get(key), key, ...patch })
  })
}
export async function downloadRules(progress: (value: string) => void): Promise<RulesBundle> {
  const files: Partial<Record<ExportFile, string>> = {}
  const get = async (file: ExportFile) => {
    const response = await fetch(`/api/rules-export?file=${encodeURIComponent(file)}`, { cache: 'no-store', signal: AbortSignal.timeout(45000) })
    if (!response.ok || !response.headers.get('content-type')?.includes('text/csv')) throw new Error(`${file}: download unavailable. Import local CSV files instead.`)
    return response.text()
  }
  const before = await get('Last_update.csv')
  const names = Object.keys(FILES) as ExportFile[]
  // Bounded concurrency avoids a request burst against the source.
  for (let i = 0; i < names.length; i += 3) {
    await Promise.all(names.slice(i, i + 3).map(async file => { files[file] = await get(file) }))
    progress(`${Math.min(i + 3, names.length)} / ${names.length}`)
  }
  if (before !== await get('Last_update.csv')) throw new Error('Export changed during download. Try again; your current snapshot was preserved.')
  return importRules(files)
}
