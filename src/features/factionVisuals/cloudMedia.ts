import { accountClient } from '../account/client'
import { useRosterScope } from '../armyLibrary/scope'
import { database } from '../../persistence/storage'

// Private bucket: the authenticated owner may write, and accepted friends may
// read only when the corresponding roster is explicitly shared.
const BUCKET = 'army-media'

function parseKey(key: string): { owner: string; armyId: string; slot: string } | null {
  let parts: unknown
  try { parts = JSON.parse(key) } catch { return null }
  if (!Array.isArray(parts) || parts.length !== 3) return null
  const [namespace, kind, unitId] = parts
  if (typeof namespace !== 'string' || typeof kind !== 'string' || typeof unitId !== 'string') return null
  const match = /^account:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(namespace)
  if (!match || !['unit', 'banner'].includes(kind)) return null
  return { owner: match[1], armyId: match[2], slot: kind === 'banner' ? 'banner' : `unit:${unitId}` }
}

async function storagePath(key: string) {
  const parts = parseKey(key)
  if (!parts || !globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.slot))
  const hash = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('')
  return { owner: parts.owner, path: `${parts.owner}/${parts.armyId}/${hash}.webp` }
}

export async function cloudPhoto(key: string): Promise<Blob | null> {
  if (!accountClient) return null
  const target = await storagePath(key)
  if (!target) return null
  const { data, error } = await accountClient.storage.from(BUCKET).download(target.path)
  if (error || !data) return null
  return data
}

export async function uploadCloudPhoto(key: string, blob: Blob, upsert = true): Promise<void> {
  if (!accountClient) return
  const target = await storagePath(key)
  if (!target || target.owner !== useRosterScope.getState().userId) return
  const { error } = await accountClient.storage.from(BUCKET).upload(target.path, blob, {
    contentType: 'image/webp', upsert,
  })
  // Backfilling a second device should never overwrite the current cloud file.
  if (error && !(error.message.includes('already exists') && !upsert)) throw error
}

export async function deleteCloudPhoto(key: string): Promise<void> {
  if (!accountClient) return
  const target = await storagePath(key)
  if (!target || target.owner !== useRosterScope.getState().userId) return
  const { error } = await accountClient.storage.from(BUCKET).remove([target.path])
  if (error) throw error
}

export async function syncLocalCloudMedia(): Promise<{ uploaded: number; failed: number }> {
  const owner = useRosterScope.getState().userId
  if (!accountClient || !owner) return { uploaded: 0, failed: 0 }
  const rows = await database.visualMedia.toArray()
  let uploaded = 0, failed = 0
  for (const row of rows) {
    if (parseKey(row.key)?.owner !== owner) continue
    try { await uploadCloudPhoto(row.key, row.blob, false); uploaded++ }
    catch { failed++ }
  }
  return { uploaded, failed }
}
