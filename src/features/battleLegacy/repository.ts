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
  return { schemaVersion: 1, id: session.setup.gameId, ownerId, session: structuredClone(normalizeLegacySession(session)), identities: {}, revision: 0, mutationId: createPortableUuid() }
}
export async function archiveCompleted(input: BattleSession, ownerId: string) {
  const session = normalizeLegacySession(input)
  const existing = await database.battleArchive.get([ownerId, session.setup.gameId])
  if (session.state.status !== 'completed') {
    if (existing && !existing.withdrawn) await database.battleArchive.put({ ...existing, withdrawn: true, mutationId: createPortableUuid() })
    return
  }
  if (existing && !existing.withdrawn && JSON.stringify(existing.session) === JSON.stringify(session)) return
  await database.battleArchive.put({ ...(existing ?? newArchive(session, ownerId)), withdrawn: false, session: structuredClone(session), mutationId: createPortableUuid() })
}
export async function listArchive(owner = legacyOwner()): Promise<ArchiveRecord[]> {
  // Legacy saves predate account scoping; they belong to the device guest archive.
  const rows = await database.battles.where('status').equals('completed').toArray()
  for (const row of rows) if ((row.archiveOwner ?? 'guest') === owner) await archiveCompleted(row.session, owner)
  assertScope(owner)
  return (await database.battleArchive.where('ownerId').equals(owner).toArray()).filter(row => row.schemaVersion === 1 && !row.withdrawn).sort((a, b) => archiveFacts(b).endedAt.localeCompare(archiveFacts(a).endedAt))
}
export async function saveArchiveMetadata(record: ArchiveRecord) {
  assertScope(record.ownerId)
  await database.transaction('rw', database.battleArchive, async () => {
    const current = await database.battleArchive.get([record.ownerId, record.id])
    if (current && current.mutationId !== record.mutationId) throw new Error('Archive changed. Reload before editing.')
    await database.battleArchive.put({ ...record, mutationId: createPortableUuid() })
  })
}
/** Explicit private backup; no sharing, no silent ownership inference. */
export async function syncArchive(owner: string) {
  assertScope(owner)
  if (owner === 'guest') throw new Error('Sign in to sync your private archive.')
  await listArchive(owner)
  const local = await database.battleArchive.where('ownerId').equals(owner).toArray()
  for (const record of local) {
    const remote = await accountRequest<ArchiveRecord>(owner, (client, token) => client.rpc('save_battle_archive', { p_game_id: record.id, p_expected_revision: record.revision, p_mutation_id: record.mutationId, p_record: record }).setHeader('Authorization', `Bearer ${token}`))
    assertScope(owner)
    await database.transaction('rw', database.battleArchive, async () => {
      const current = await database.battleArchive.get([owner, record.id])
      if (current) await database.battleArchive.put({ ...current, revision: remote.revision })
    })
  }
  const rows = await accountRequest<Array<{ record: ArchiveRecord; revision: number }>>(owner, (client, token) => client.from('battle_archive').select('record,revision').eq('user_id', owner).setHeader('Authorization', `Bearer ${token}`))
  assertScope(owner)
  for (const row of rows) {
    if (row.record.schemaVersion !== 1 || row.record.ownerId !== owner || row.record.id !== row.record.session.setup.gameId) throw new Error('Invalid archive response.')
    const current = await database.battleArchive.get([owner, row.record.id])
    if (!current) await database.battleArchive.put({ ...row.record, revision: row.revision })
  }
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
