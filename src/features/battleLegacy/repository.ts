import { getSharedRuntimeMembership } from '../../multiplayer/sharedRuntime'
import { normalizeLegacySession } from '../../persistence/legacyBattle'
import { database } from '../../persistence/storage'
import { useRosterScope } from '../armyLibrary/scope'
import { accountRequest } from '../social/api'
import { createPortableUuid } from '../../multiplayer/uuid'
import { archiveFacts, type ArchiveRecord } from './archive'
import type { BattleSession } from '../../domain/battle/types'

export const legacyOwner = () => useRosterScope.getState().userId ?? 'guest'
const assertScope = (owner: string) => { if (legacyOwner() !== owner) throw new Error('The account changed. Open this page again.') }
export function newArchive(session: BattleSession, ownerId: string): ArchiveRecord {
  return { schemaVersion: 1, online: getSharedRuntimeMembership()?.battleId === session.setup.gameId, id: session.setup.gameId, ownerId, session: structuredClone(normalizeLegacySession(session)), identities: {}, revision: 0, mutationId: createPortableUuid() }
}
export async function archiveCompleted(input: BattleSession, ownerId: string) {
  const session = normalizeLegacySession(input)
  const existing = await database.battleArchive.get([ownerId, session.setup.gameId])
  if (session.state.status !== 'completed') {
    if (existing && !existing.withdrawn) await database.battleArchive.put({ ...existing, withdrawn: true, mutationId: createPortableUuid() })
    return
  }
  if (existing && JSON.stringify(existing.session) === JSON.stringify(session)) return
  await database.battleArchive.put({ ...(existing ?? newArchive(session, ownerId)), withdrawn: false, session: structuredClone(session), mutationId: createPortableUuid() })
}
export async function prepareArchive(owner = legacyOwner()): Promise<void> {
  // Legacy saves predate account scoping; they belong to the device guest archive.
  await database.transaction('rw', database.battles, database.battleArchive, async () => {
    const rows = await database.battles.where('status').equals('completed').toArray()
    for (const row of rows) if ((row.archiveOwner ?? 'guest') === owner && !await database.battleArchive.get([owner, row.id])) await archiveCompleted(row.session, owner)
  })
  assertScope(owner)
}
export async function listArchive(owner = legacyOwner()): Promise<ArchiveRecord[]> {
  assertScope(owner)
  return (await database.battleArchive.where('ownerId').equals(owner).toArray()).filter(row => row.schemaVersion === 1 && (!row.withdrawn || row.cloudConflict)).sort((a, b) => archiveFacts(b).endedAt.localeCompare(archiveFacts(a).endedAt))
}
export async function saveArchiveMetadata(record: ArchiveRecord) {
  assertScope(record.ownerId)
  return database.transaction('rw', database.battleArchive, async () => {
    const current = await database.battleArchive.get([record.ownerId, record.id])
    if (current && current.mutationId !== record.mutationId) throw new Error('Archive changed. Reload before editing.')
    const saved = { ...record, mutationId: createPortableUuid() }
    await database.battleArchive.put(saved)
    return saved
  })
}
export type ArchiveCloudRow = { record: ArchiveRecord; revision: number }
export type ArchiveTransport = {
  list(owner: string): Promise<ArchiveCloudRow[]>
  write(owner: string, record: ArchiveRecord): Promise<ArchiveRecord>
}
const archiveTransport: ArchiveTransport = {
  async list(owner) {
    const all: ArchiveCloudRow[] = []
    for (let offset = 0; ; offset += 500) {
      const page = await accountRequest<ArchiveCloudRow[]>(owner, (client, token) => client.from('battle_archive').select('record,revision').eq('user_id', owner).order('game_id').range(offset, offset + 499).setHeader('Authorization', `Bearer ${token}`))
      all.push(...page)
      if (page.length < 500) return all
    }
  },
  async write(owner, record) {
    const { syncedMutationId: _synced, cloudConflict: _conflict, ...payload } = record
    return accountRequest<ArchiveRecord>(owner, (client, token) => client.rpc('save_battle_archive', { p_game_id: record.id, p_expected_revision: record.revision, p_mutation_id: record.mutationId, p_record: payload }).setHeader('Authorization', `Bearer ${token}`))
  },
}
function validCloud(row: ArchiveCloudRow, owner: string) {
  if (row.record.schemaVersion !== 1 || row.record.ownerId !== owner || row.record.id !== row.record.session.setup.gameId || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Invalid archive response.')
  return { ...row.record, revision: row.revision, syncedMutationId: row.record.mutationId, cloudConflict: undefined }
}
/** Download first, upload only dirty records, and retain both sides of a conflict. */
export async function syncArchive(owner: string, transport: ArchiveTransport = archiveTransport) {
  assertScope(owner)
  if (owner === 'guest') throw new Error('Sign in to sync your private archive.')
  await prepareArchive(owner)
  const remote = await transport.list(owner)
  assertScope(owner)
  for (const row of remote) {
    const cloud = validCloud(row, owner)
    await database.transaction('rw', database.battleArchive, async () => {
      const current = await database.battleArchive.get([owner, cloud.id])
      if (current && current.revision > cloud.revision) return
      if (!current || current.syncedMutationId === current.mutationId) await database.battleArchive.put(cloud)
      else if (current.mutationId === cloud.mutationId) await database.battleArchive.put({ ...current, revision: cloud.revision, syncedMutationId: cloud.mutationId, cloudConflict: undefined })
      else if (current.revision !== cloud.revision) await database.battleArchive.put({ ...current, cloudConflict: { record: cloud, revision: cloud.revision } })
    })
  }
  const local = await database.battleArchive.where('ownerId').equals(owner).toArray()
  let failures = 0
  for (const record of local) {
    assertScope(owner)
    if (record.cloudConflict) { failures++; continue }
    if (record.syncedMutationId === record.mutationId) continue
    try {
      const saved = await transport.write(owner, record)
      assertScope(owner)
      const cloud = validCloud({ record: saved, revision: saved.revision }, owner)
      await database.transaction('rw', database.battleArchive, async () => {
        const current = await database.battleArchive.get([owner, record.id])
        if (current) await database.battleArchive.put({ ...current, revision: cloud.revision, syncedMutationId: record.mutationId })
      })
    } catch { failures++ }
  }
  if (failures) throw new Error('Some archive records need attention. Sync again or resolve the saved cloud conflict; other battles were synchronized.')
}
export async function resolveArchiveConflict(owner: string, id: string, choice: 'cloud' | 'local') {
  assertScope(owner)
  await database.transaction('rw', database.battleArchive, async () => {
    const current = await database.battleArchive.get([owner, id])
    if (!current?.cloudConflict) return
    const cloud = validCloud(current.cloudConflict, owner)
    await database.battleArchive.put(choice === 'cloud' ? cloud : { ...current, revision: cloud.revision, syncedMutationId: cloud.mutationId, mutationId: createPortableUuid(), cloudConflict: undefined })
  })
}

export async function importDeviceArchive(owner: string) {
  assertScope(owner)
  if (owner === 'guest') return
  const rows = await database.battles.where('status').equals('completed').toArray()
  for (const row of rows.filter(row => (row.archiveOwner ?? 'guest') === 'guest')) {
    assertScope(owner)
    if (!await database.battleArchive.get([owner, row.id])) {
      const guest = await database.battleArchive.get(['guest', row.id])
      await database.battleArchive.put({ ...(guest ?? newArchive(row.session, owner)), ownerId: owner, revision: 0, mutationId: createPortableUuid() })
    }
  }
}
