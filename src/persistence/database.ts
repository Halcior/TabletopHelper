import { archiveCompleted, legacyOwner } from '../features/battleLegacy/repository'
import { normalizeLegacySession } from './legacyBattle'
import type { BattleSession } from '../domain/battle/types'
import { database, type StoredBattle } from './storage'
export { database } from './storage'
export type { StoredArmy, StoredBattle } from './storage'
export { saveArmy, getArmy, listArmies } from '../features/armyLibrary/repository'

export async function saveBattle(session: BattleSession): Promise<void> {
  const savingOwner = legacyOwner()
  await database.transaction('rw', database.battles, database.battleArchive, async () => {
  const previous = await database.battles.get(session.setup.gameId)
  const archiveOwner = previous ? previous.archiveOwner ?? 'guest' : savingOwner
  await database.battles.put({
    archiveOwner,
    id: session.setup.gameId,
    session,
    status: session.state.status,
    updatedAt: session.state.updatedAt,
  })
  await archiveCompleted(session, archiveOwner)
  })
}

export async function getBattle(id: string): Promise<BattleSession | undefined> {
  const session = (await database.battles.get(id))?.session
  return session ? normalizeLegacySession(session) : undefined
}

export async function getLatestActiveBattle(): Promise<BattleSession | undefined> {
  const active = await database.battles.where('status').equals('active').toArray()
  active.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return active[0]?.session ? normalizeLegacySession(active[0].session) : undefined
}

export async function listRecentBattles(limit = 6): Promise<StoredBattle[]> {
  const recent = await database.battles.orderBy('updatedAt').reverse().limit(limit).toArray()
  return recent.map((stored) => ({
    ...stored,
    session: normalizeLegacySession(stored.session),
  }))
}
