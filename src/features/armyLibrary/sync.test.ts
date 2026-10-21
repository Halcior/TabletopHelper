import 'fake-indexeddb/auto'
import { beforeEach, expect, it } from 'vitest'
import fixture from '../../../test-data/1700.json'
import { NewRecruitImporter } from '../../importers/newRecruit'
import { database, type AccountArmy } from '../../persistence/storage'
import { createPortableUuid } from '../../multiplayer/uuid'
import type { CloudArmy, CloudTransport } from './cloud'
import { useRosterScope } from './scope'
import { listArmies, saveRoster, deleteRoster } from './repository'
import { syncArmies, useSyncState } from './sync'

function backend() {
  const records = new Map<string, CloudArmy>()
  let offline = false
  const transport: CloudTransport = {
    async list(owner) {
      if (offline) throw new Error('offline')
      return [...records.values()]
        .filter((row) => row.user_id === owner)
        .map((row) => structuredClone(row))
    },
    async write(owner, row) {
      if (offline) throw new Error('offline')
      const key = `${owner}:${row.id}`,
        old = records.get(key)
      if (old && old.mutation_id === row.changeId)
        return { applied: true, row: structuredClone(old) }
      if (old && (old.revision !== row.revision || old.deleted_at))
        return { applied: false, row: structuredClone(old) }
      const saved: CloudArmy = {
        id: row.id,
        user_id: owner,
        army_data: structuredClone(row.army),
        revision: (old?.revision ?? 0) + 1,
        updated_at: new Date().toISOString(),
        mutation_id: row.changeId,
        deleted_at: row.deleted ? new Date().toISOString() : null,
        source_local_id: row.sourceLocalId,
      }
      records.set(key, saved)
      return { applied: true, row: structuredClone(saved) }
    },
  }
  return {
    records,
    transport,
    offline: (value: boolean) => {
      offline = value
    },
  }
}
function army() {
  return {
    ...NewRecruitImporter.import(fixture).army,
    id: createPortableUuid(),
  }
}
beforeEach(async () => {
  useRosterScope.setState({ userId: 'A' })
  await Promise.all([
    database.armies.clear(),
    database.accountArmies.clear(),
    database.visualMedia.clear(),
  ])
  useSyncState.setState({ owner: null, busy: false, error: undefined })
})
it('uploads queued edits and downloads a second device edit, without timestamp wins', async () => {
  const cloud = backend(),
    input = army()
  await saveRoster(input)
  await syncArmies('A', cloud.transport)
  expect((await listArmies())[0].status).toBe('synced')
  const remote = cloud.records.get(`A:${input.id}`)!
  cloud.records.set(`A:${input.id}`, {
    ...remote,
    revision: 2,
    mutation_id: 'second-device',
    army_data: { ...remote.army_data, name: 'Phone edit' },
  })
  await syncArmies('A', cloud.transport)
  expect((await listArmies())[0].army.name).toBe('Phone edit')
})
it('keeps offline changes through retries and marks sync errors without deleting its queue', async () => {
  const cloud = backend(),
    input = army()
  cloud.offline(true)
  await saveRoster(input)
  await syncArmies('A', cloud.transport)
  expect((await listArmies())[0].pending).toBe(true)
  expect(useSyncState.getState().error).toBe('offline')
  cloud.offline(false)
  await syncArmies('A', cloud.transport)
  expect((await listArmies())[0].status).toBe('synced')
})
it('preserves competing edits as an independent conflict copy with unique IDs', async () => {
  const cloud = backend(),
    input = army()
  await saveRoster(input)
  await syncArmies('A', cloud.transport)
  await saveRoster({ ...input, name: 'Offline PC edit' })
  const remote = cloud.records.get(`A:${input.id}`)!
  cloud.records.set(`A:${input.id}`, {
    ...remote,
    revision: 2,
    mutation_id: 'phone',
    army_data: { ...remote.army_data, name: 'Concurrent phone edit' },
  })
  await syncArmies('A', cloud.transport)
  const rows = await listArmies()
  expect(rows).toHaveLength(2)
  expect(rows.find((r) => r.id === input.id)?.army.name).toBe(
    'Concurrent phone edit',
  )
  const conflict = rows.find((r) => r.id !== input.id)!
  expect(conflict.army.name).toContain('Offline PC edit')
  expect(conflict.conflictNote).toContain('Another device')
  expect(conflict.army.units[0].id).not.toBe(input.units[0].id)
  await syncArmies('A', cloud.transport)
  expect((await listArmies()).every((r) => r.status === 'synced')).toBe(true)
})
it('does not resurrect deletions and preserves an offline edit of a deleted roster', async () => {
  const cloud = backend(),
    input = army()
  await saveRoster(input)
  await syncArmies('A', cloud.transport)
  await saveRoster({ ...input, name: 'Unsynced edit' })
  const remote = cloud.records.get(`A:${input.id}`)!
  cloud.records.set(`A:${input.id}`, {
    ...remote,
    revision: 2,
    deleted_at: new Date().toISOString(),
    mutation_id: 'delete',
  })
  await syncArmies('A', cloud.transport)
  const rows = await listArmies()
  expect(rows).toHaveLength(1)
  expect(rows[0].id).not.toBe(input.id)
  expect(rows[0].conflictNote).toContain('deleted')
  await syncArmies('A', cloud.transport)
  expect(cloud.records.get(`A:${input.id}`)?.deleted_at).toBeTruthy()
})
it('queues offline deletions; stale deletion of a newer roster asks for review', async () => {
  const cloud = backend(),
    input = army()
  await saveRoster(input)
  await syncArmies('A', cloud.transport)
  await deleteRoster(input.id)
  const remote = cloud.records.get(`A:${input.id}`)!
  cloud.records.set(`A:${input.id}`, {
    ...remote,
    revision: 2,
    mutation_id: 'phone',
    army_data: { ...remote.army_data, name: 'Newer edit' },
  })
  await syncArmies('A', cloud.transport)
  expect((await listArmies())[0].conflictNote).toContain(
    'Deletion was not applied',
  )
  await deleteRoster(input.id)
  await syncArmies('A', cloud.transport)
  expect(await listArmies()).toHaveLength(0)
  expect(cloud.records.get(`A:${input.id}`)?.deleted_at).toBeTruthy()
})
it('does not acknowledge a newer local edit made while upload was in flight', async () => {
  const cloud = backend(),
    input = army()
  await saveRoster(input)
  const transport: CloudTransport = {
    ...cloud.transport,
    async write(owner, row) {
      await saveRoster({ ...row.army, name: 'Edited during upload' })
      return cloud.transport.write(owner, row)
    },
  }
  await syncArmies('A', transport)
  const saved = (await listArmies())[0]
  expect(saved.army.name).toBe('Edited during upload')
  expect(saved.pending).toBe(true)
  expect(saved.revision).toBe(1)
  await syncArmies('A', cloud.transport)
  expect(cloud.records.get(`A:${input.id}`)?.army_data.name).toBe(
    'Edited during upload',
  )
})
it('isolates delayed responses across account switches and guest sign-out', async () => {
  const cloud = backend(),
    input = army()
  await saveRoster(input)
  const transport: CloudTransport = {
    ...cloud.transport,
    async write(owner, row) {
      const response = await cloud.transport.write(owner, row)
      useRosterScope.setState({ userId: 'B' })
      return response
    },
  }
  await syncArmies('A', transport)
  expect(await listArmies()).toHaveLength(0)
  useRosterScope.setState({ userId: null })
  expect(await listArmies()).toHaveLength(0)
  useRosterScope.setState({ userId: 'A' })
  expect((await listArmies())[0].army.id).toBe(input.id)
})
it('retries a lost acknowledgement idempotently without creating another revision', async () => {
  const cloud = backend(),
    input = army()
  await saveRoster(input)
  const transport: CloudTransport = {
    ...cloud.transport,
    async write(owner, row) {
      await cloud.transport.write(owner, row)
      throw new Error('response lost')
    },
  }
  await syncArmies('A', transport)
  expect((await listArmies())[0].pending).toBe(true)
  await syncArmies('A', cloud.transport)
  expect(cloud.records.get(`A:${input.id}`)?.revision).toBe(1)
  expect((await listArmies())[0].pending).toBe(false)
})
