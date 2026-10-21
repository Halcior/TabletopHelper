import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import type { Army, UnitDefinition } from '../../domain/army/types'
import {
  copyRoster,
  normalizeRoster,
  validateArmy,
} from '../../domain/army/roster'
import {
  database,
  type StoredArmy,
  type AccountArmy,
} from '../../persistence/storage'
import { mediaKey } from '../factionVisuals/media'
import { createPortableUuid } from '../../multiplayer/uuid'
import { assertOwner, rosterOwner, useRosterScope } from './scope'
import { cloudRosterId, cloudMediaId } from './identity'

export async function listArmies(owner = rosterOwner()): Promise<StoredArmy[]> {
  const local = await database.armies.toArray()
  const account = owner
    ? await database.accountArmies.where('ownerId').equals(owner).toArray()
    : []
  const migrated = new Set(account.map((r) => r.sourceLocalId).filter(Boolean))
  return [
    ...local
      .filter((r) => !migrated.has(r.id))
      .map((r) => ({ ...r, status: 'local' as const })),
    ...account.filter((r) => !r.deleted),
  ].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}
export async function getArmy(id: string): Promise<Army | undefined> {
  return (await listArmies()).find((r) => r.id === id)?.army
}
export async function getRoster(
  id: string,
  owner = rosterOwner(),
): Promise<StoredArmy | undefined> {
  return (await listArmies(owner)).find((r) => r.id === id)
}

export async function copyPhotos(
  from: Army,
  to: Army,
  unitPairs?: [UnitDefinition, UnitDefinition][],
): Promise<void> {
  const pairs: [string, string][] = unitPairs
    ? []
    : [[mediaKey(from), mediaKey(to)]]
  for (const [source, target] of unitPairs ??
    from.units.map(
      (u, i) => [u, to.units[i]] as [UnitDefinition, UnitDefinition],
    )) {
    if (target) pairs.push([mediaKey(from, source), mediaKey(to, target)])
  }
  for (const [key, nextKey] of pairs) {
    if (key === nextKey) continue
    const row = await database.visualMedia.get(key)
    if (row)
      await database.visualMedia.put({ ...row, key: nextKey, armyId: to.id })
  }
}

/** A save and its outbox entry are the same IndexedDB row and transaction. */
export async function saveRoster(
  input: Army,
  options: {
    owner?: string | null
    expectedChangeId?: string
    expectExisting?: boolean
    localOnly?: boolean
    sourceLocalId?: string
    photoSource?: Army
    unitPhotoSource?: Army
    unitPhotos?: [UnitDefinition, UnitDefinition][]
  } = {},
): Promise<Army> {
  const owner = options.owner === undefined ? rosterOwner() : options.owner
  assertOwner(owner)
  const army = normalizeRoster(input)
  await database.transaction(
    'rw',
    database.armies,
    database.accountArmies,
    database.visualMedia,
    async () => {
      assertOwner(owner)
      const account = owner
        ? await database.accountArmies.get([owner, army.id])
        : undefined
      const local = await database.armies.get(army.id)
      const current = account ?? local
      if (current?.deleted)
        throw new Error(
          'This roster was deleted. Save your edits as a new copy.',
        )
      if (options.expectExisting && !current)
        throw new Error(
          'This roster was deleted. Save your edits as a new copy.',
        )
      if (
        options.expectExisting &&
        current?.changeId !== options.expectedChangeId
      )
        throw new Error(
          'This roster changed in another tab or device. Save as a copy to preserve your edits.',
        )
      const savedAt = new Date().toISOString(),
        changeId = createPortableUuid()
      if (account || (owner && !local && !options.localOnly)) {
        army.localMediaId = cloudMediaId(owner!, army.id)
        await database.accountArmies.put({
          ...account,
          id: army.id,
          army,
          ownerId: owner!,
          savedAt,
          changeId,
          revision: account?.revision ?? 0,
          pending: true,
          status: 'pending',
          sourceLocalId: account?.sourceLocalId ?? options.sourceLocalId,
          error: undefined,
        })
      } else {
        delete army.localMediaId
        await database.armies.put({ id: army.id, army, savedAt, changeId })
      }
      if (options.photoSource) await copyPhotos(options.photoSource, army)
      if (options.unitPhotos)
        await copyPhotos(
          options.unitPhotoSource ?? army,
          army,
          options.unitPhotos,
        )
      assertOwner(owner)
    },
  )
  return army
}

/** Existing importer entry point, including stable New Recruit identities. */
export async function saveArmy(input: Army): Promise<void> {
  await importArmy(input)
}
export async function importArmy(input: Army): Promise<Army> {
  const owner = rosterOwner()
  validateArmy(input)
  const existing = (await listArmies(owner)).find(
    (r) => r.id === input.id || (owner && r.sourceLocalId === input.id),
  )
  assertOwner(owner)
  if (existing) {
    // Repeat imports are idempotent; changed exports become a separate variant.
    const plain = (a: Army) =>
      JSON.stringify({
        ...a,
        id: undefined,
        library: undefined,
        localMediaId: undefined,
      })
    if (plain(existing.army) === plain(input)) return existing.army
    return saveRoster(copyRoster(input, `${input.name} — imported variant`), {
      owner,
      photoSource: existing.army,
    })
  }
  // Account records use UUIDs. The imported guest identity is retained separately
  // during migration; guests keep their existing string IDs without rewriting.
  if (owner) {
    const army = structuredClone(input)
    army.id = cloudRosterId(owner, input.id)
    return saveRoster(army, { owner, sourceLocalId: input.id })
  }
  return saveRoster(input, { owner, localOnly: true })
}
export async function duplicateRoster(
  input: Army,
  name?: string,
  owner = rosterOwner(),
): Promise<Army> {
  return saveRoster(copyRoster(input, name), { owner, photoSource: input })
}
export async function deleteRoster(
  id: string,
  owner = rosterOwner(),
): Promise<void> {
  assertOwner(owner)
  await database.transaction(
    'rw',
    database.armies,
    database.accountArmies,
    async () => {
      assertOwner(owner)
      const row = owner
        ? await database.accountArmies.get([owner, id])
        : undefined
      if (row)
        await database.accountArmies.put({
          ...row,
          deleted: true,
          savedAt: new Date().toISOString(),
          changeId: createPortableUuid(),
          pending: true,
          status: 'pending',
          error: undefined,
        })
      else await database.armies.delete(id)
      // Photos remain available to battle snapshots and independent copies.
    },
  )
}
export async function migrationCandidates(
  owner: string,
): Promise<StoredArmy[]> {
  const mapped = new Set(
    (await database.accountArmies.where('ownerId').equals(owner).toArray()).map(
      (r) => r.sourceLocalId,
    ),
  )
  return (await database.armies.toArray()).filter((r) => !mapped.has(r.id))
}
export async function migrateLocalArmies(
  ids: string[],
  owner: string,
): Promise<void> {
  assertOwner(owner)
  await database.transaction(
    'rw',
    database.armies,
    database.accountArmies,
    database.visualMedia,
    async () => {
      const mapped = new Set(
        (
          await database.accountArmies.where('ownerId').equals(owner).toArray()
        ).map((r) => r.sourceLocalId),
      )
      for (const id of new Set(ids)) {
        assertOwner(owner)
        if (mapped.has(id)) continue
        const local = await database.armies.get(id)
        if (!local) continue
        const army = structuredClone(local.army)
        army.id = cloudRosterId(owner, id)
        army.localMediaId = cloudMediaId(owner, army.id)
        // Migration preserves unit identities and imported data exactly.
        const row: AccountArmy = {
          id: army.id,
          army,
          ownerId: owner,
          sourceLocalId: id,
          savedAt: local.savedAt,
          changeId: createPortableUuid(),
          revision: 0,
          pending: true,
          status: 'pending',
        }
        await database.accountArmies.put(row)
        await copyPhotos(local.army, army)
        mapped.add(id)
      }
      assertOwner(owner)
    },
  )
}

export function useRosterLibrary() {
  const owner = useRosterScope((s) => s.userId)
  const [result, setResult] = useState<{
    owner: string | null
    rows: StoredArmy[]
    error?: string
  }>({ owner, rows: [] })
  const [loadedOwner, setLoadedOwner] = useState<string | null | undefined>(
    undefined,
  )
  useEffect(() => {
    const sub = liveQuery(() => listArmies(owner)).subscribe({
      next: (rows) => {
        setResult({ owner, rows })
        setLoadedOwner(owner)
      },
      error: (e) => {
        setResult({ owner, rows: [], error: String(e) })
        setLoadedOwner(owner)
      },
    })
    return () => sub.unsubscribe()
  }, [owner])
  return {
    rows: result.owner === owner ? result.rows : [],
    loading: loadedOwner !== owner,
    error: result.owner === owner ? result.error : undefined,
  }
}
