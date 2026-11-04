import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import { database } from '../../persistence/storage'
import { useRosterScope } from '../armyLibrary/scope'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { completeBattle } from '../../domain/battle/engine'
import { newArchive, syncArchive, saveArchiveMetadata, resolveArchiveConflict, listArchive, type ArchiveTransport } from './repository'
import { setParticipant, type ArchiveRecord } from './archive'
beforeEach(async () => { useRosterScope.setState({ userId: 'owner' }); await database.battles.clear(); await database.battleArchive.clear() })
function server() {
 const rows = new Map<string, ArchiveRecord>(); let calls = 0
 const transport: ArchiveTransport = {
  async list() { return [...rows.values()].map(record => ({ record: structuredClone(record), revision: record.revision })) },
  async write(_, record) {
   calls++; const old = rows.get(record.id)
   if (old?.mutationId === record.mutationId) return structuredClone(old)
   if ((old?.revision ?? 0) !== record.revision) throw new Error('conflict')
   const saved = { ...structuredClone(record), revision: record.revision + 1 }; delete saved.syncedMutationId; delete saved.cloudConflict; rows.set(record.id, saved); return saved
  },
 }
 return { rows, transport, calls: () => calls }
}
it('downloads clean remote edits before uploading and propagates withdrawals without resurrection', async () => {
 const r = newArchive(completeBattle(testCauldronGame()), 'owner'); await database.battleArchive.put(r)
 const cloud = server(); await syncArchive('owner', cloud.transport); expect(cloud.calls()).toBe(1)
 const remote = cloud.rows.get(r.id)!; remote.mutationId = 'remote-edit'; remote.revision++; remote.withdrawn = true
 cloud.rows.set(r.id, remote)
 await database.battles.put({ id: r.id, archiveOwner: 'owner', session: r.session, status: 'completed', updatedAt: r.session.state.updatedAt })
 await syncArchive('owner', cloud.transport); expect(cloud.calls()).toBe(1)
 expect(await listArchive('owner')).toHaveLength(0)
 expect((await database.battleArchive.get(['owner', r.id]))?.withdrawn).toBe(true)
})
it('retains conflicting local edits, syncs other battles and lets a user choose either version', async () => {
 const r = newArchive(completeBattle(testCauldronGame()), 'owner'); await database.battleArchive.put(r)
 const cloud = server(); await syncArchive('owner', cloud.transport)
 const synced = (await database.battleArchive.get(['owner', r.id]))!
 await saveArchiveMetadata(setParticipant(synced, 'p-a', 'local-person', 'Local'))
 const remote = cloud.rows.get(r.id)!; remote.mutationId = 'remote-edit'; remote.revision++; remote.identities = { 'p-a': { id:'cloud-person', label:'Cloud' } }
 const other = structuredClone(r); other.id = other.session.setup.gameId = other.session.state.gameId = 'other'; other.revision = 0; await database.battleArchive.put(other)
 await expect(syncArchive('owner', cloud.transport)).rejects.toThrow(/attention/)
 expect(cloud.rows.has('other')).toBe(true)
 expect((await database.battleArchive.get(['owner', r.id]))?.cloudConflict).toBeTruthy()
 await resolveArchiveConflict('owner', r.id, 'local'); await syncArchive('owner', cloud.transport)
 expect(cloud.rows.get(r.id)?.identities['p-a'].label).toBe('Local')
 const final = (await database.battleArchive.get(['owner', r.id]))!; await saveArchiveMetadata({ ...final, identities: {} })
 const newer = cloud.rows.get(r.id)!; newer.revision++; newer.mutationId='newer'
 await expect(syncArchive('owner', cloud.transport)).rejects.toThrow(/attention/)
 await resolveArchiveConflict('owner', r.id, 'cloud'); await syncArchive('owner', cloud.transport)
 expect((await database.battleArchive.get(['owner', r.id]))?.identities['p-a'].label).toBe('Local')
})
