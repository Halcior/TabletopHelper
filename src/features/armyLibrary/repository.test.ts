import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import fixture from '../../../test-data/1700.json'
import { NewRecruitImporter } from '../../importers/newRecruit'
import {
  copyRoster,
  copyUnit,
  exportRosters,
  importRosters,
  normalizeRoster,
  validateArmy,
} from '../../domain/army/roster'
import { createBattleSession } from '../../domain/battle/engine'
import { getBattle, saveBattle } from '../../persistence/database'
import { database } from '../../persistence/storage'
import { mediaKey } from '../factionVisuals/media'
import { useRosterScope } from './scope'
import { cloudRosterId } from './identity'
import {
  deleteRoster,
  duplicateRoster,
  getRoster,
  importArmy,
  listArmies,
  migrateLocalArmies,
  migrationCandidates,
  saveRoster,
} from './repository'

const imported = () => NewRecruitImporter.import(fixture).army
beforeEach(async () => {
  useRosterScope.setState({ userId: null })
  await Promise.all([
    database.armies.clear(),
    database.accountArmies.clear(),
    database.visualMedia.clear(),
    database.battles.clear(),
    database.libraryPreferences.clear(),
  ])
})
describe('local-first roster repository', () => {
  it('keeps stable guest imports, restores exports and refuses malformed references', async () => {
    const army = imported()
    await importArmy(army)
    await importArmy(imported())
    expect(await listArmies()).toHaveLength(1)
    const restored = importRosters(JSON.parse(exportRosters([army])))!
    expect(restored[0]).toEqual(army)
    expect(() =>
      validateArmy({ ...army, units: [army.units[0], army.units[0]] }),
    ).toThrow('Duplicate unit IDs')
    expect(importRosters({ roster: {} })).toBeNull()
    expect(() =>
      importRosters({
        format: 'tabletophelper-armies',
        version: 99,
        armies: [],
      }),
    ).toThrow()
  })
  it('recalculates points, creates independent variants and cleans leader references', async () => {
    const army = await importArmy(imported())
    const duplicate = await duplicateRoster(army)
    expect(duplicate.id).not.toBe(army.id)
    expect(
      new Set([...army.units, ...duplicate.units].map((u) => u.id)).size,
    ).toBe(army.units.length * 2)
    duplicate.units[0].points += 25
    duplicate.units[0].isWarlord = false
    const edited = await saveRoster(duplicate)
    expect(edited.totalPoints).toBe(army.totalPoints + 25)
    expect((await getRoster(army.id))?.army).toEqual(army)
    const target = edited.units[1]
    edited.units[0].leaderOfUnitId = target.id
    const attached = normalizeRoster(edited)
    expect(attached.units[1].ledByUnitIds).toContain(edited.units[0].id)
    attached.units = attached.units.filter((u) => u.id !== target.id)
    expect(normalizeRoster(attached).units[0].leaderOfUnitId).toBeNull()
    const unitCopy = copyUnit(army.units[0])
    expect(unitCopy.id).not.toBe(army.units[0].id)
    expect(unitCopy.isWarlord).toBe(false)
  })
  it('rejects cyclic leaders and invalid Warlords', () => {
    const army = imported()
    army.units[0].leaderOfUnitId = army.units[1].id
    army.units[1].leaderOfUnitId = army.units[0].id
    expect(() => normalizeRoster(army)).toThrow('cycle')
    army.units[0].leaderOfUnitId = null
    army.units[1].leaderOfUnitId = null
    army.units[0].isWarlord = army.units[1].isWarlord = true
    expect(() => normalizeRoster(army)).toThrow('only one Warlord')
  })
  it('preserves historical and in-memory battle snapshots after edits and deletion', async () => {
    const army = await importArmy(imported())
    const session = createBattleSession({
      gameId: 'snapshot-check',
      rulesetId: 'generic',
      armies: [army],
      players: [{ id: 'p1', name: 'A', armyId: army.id }],
    })
    const snapshot = structuredClone(session.setup.armies[army.id])
    army.units[0].name = 'Changed after start'
    expect(session.setup.armies[army.id]).toEqual(snapshot)
    await saveBattle(session)
    await saveRoster(army)
    await deleteRoster(army.id)
    expect(
      (await getBattle('snapshot-check'))?.setup.armies[snapshot.id],
    ).toEqual(snapshot)
  })
  it('copies blobs into independent roster and duplicated unit namespaces', async () => {
    const army = await importArmy(imported())
    const key = mediaKey(army, army.units[0])
    await database.visualMedia.put({
      key,
      armyId: army.id,
      blob: new Blob(['photo']),
      updatedAt: 'now',
    })
    const copy = await duplicateRoster(army)
    expect(
      (await database.visualMedia.get(mediaKey(copy, copy.units[0])))?.blob
        .size,
    ).toBe(5)
    const unit = copyUnit(army.units[0])
    army.units.push(unit)
    await saveRoster(army, { unitPhotos: [[army.units[0], unit]] })
    expect(
      (await database.visualMedia.get(mediaKey(army, unit)))?.blob.size,
    ).toBe(5)
    await deleteRoster(army.id)
    expect(await database.visualMedia.get(key)).toBeDefined()
  })
  it('detects concurrent local saves and never turns another account roster into guest data', async () => {
    const army = await importArmy(imported())
    const first = (await getRoster(army.id))!
    await saveRoster(
      { ...army, name: 'Other tab' },
      { expectExisting: true, expectedChangeId: first.changeId },
    )
    await expect(
      saveRoster(army, {
        expectExisting: true,
        expectedChangeId: first.changeId,
      }),
    ).rejects.toThrow('another tab')
    useRosterScope.setState({ userId: 'account-a' })
    const captured = useRosterScope.getState().userId
    useRosterScope.setState({ userId: 'account-b' })
    await expect(saveRoster(army, { owner: captured })).rejects.toThrow(
      'account changed',
    )
  })
  it('migrates guest armies idempotently, keeps originals and isolates account caches', async () => {
    const army = await importArmy(imported())
    useRosterScope.setState({ userId: 'account-a' })
    await migrateLocalArmies([army.id], 'account-a')
    await migrateLocalArmies([army.id], 'account-a')
    const a = await listArmies()
    expect(a).toHaveLength(1)
    expect(a[0].ownerId).toBe('account-a')
    expect(a[0].id).toBe(cloudRosterId('account-a', army.id))
    expect(a[0].army.units).toEqual(army.units)
    expect(await migrationCandidates('account-a')).toHaveLength(0)
    expect(await database.armies.get(army.id)).toBeDefined()
    useRosterScope.setState({ userId: 'account-b' })
    expect((await listArmies()).map((r) => r.id)).toEqual([army.id])
    await migrateLocalArmies([army.id], 'account-b')
    const b = await listArmies()
    expect(b[0].id).not.toBe(a[0].id)
    useRosterScope.setState({ userId: null })
    expect((await listArmies()).map((r) => r.id)).toEqual([army.id])
  })
  it('preserves old guests with no metadata and deleted cloud imports do not expose original copies', async () => {
    const army = imported()
    await database.armies.put({ id: army.id, army, savedAt: '2020-01-01' })
    expect((await listArmies())[0].army).toEqual(army)
    useRosterScope.setState({ userId: 'account-a' })
    await migrateLocalArmies([army.id], 'account-a')
    await deleteRoster(cloudRosterId('account-a', army.id))
    expect(await listArmies()).toHaveLength(0)
    expect(await migrationCandidates('account-a')).toHaveLength(0)
  })
  it('maps source IDs deterministically and independently per owner', () => {
    expect(cloudRosterId('a', 'old-id')).toBe(cloudRosterId('a', 'old-id'))
    expect(cloudRosterId('a', 'old-id')).not.toBe(cloudRosterId('b', 'old-id'))
    expect(cloudRosterId('a', 'old-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    const army = imported()
    const copy = copyRoster(army)
    expect(copy.library?.variantOf).toBe(army.id)
  })
})

it('isolates photos for identical roster IDs belonging to different accounts', async () => {
  const sharedIdentity = imported()
  useRosterScope.setState({ userId: 'A' })
  const a = await saveRoster(sharedIdentity)
  await database.visualMedia.put({
    key: mediaKey(a, a.units[0]),
    armyId: a.id,
    blob: new Blob(['private A']),
    updatedAt: 'now',
  })
  useRosterScope.setState({ userId: 'B' })
  const b = await saveRoster(sharedIdentity)
  expect(b.id).toBe(a.id)
  expect(mediaKey(b, b.units[0])).not.toBe(mediaKey(a, a.units[0]))
  expect(
    await database.visualMedia.get(mediaKey(b, b.units[0])),
  ).toBeUndefined()
  expect(JSON.parse(exportRosters([a])).armies[0].localMediaId).toBeUndefined()
})
