import type { Army } from '../domain/army/types'
import type { BattleSession } from '../domain/battle/types'
import { database, type StoredBattle } from './storage'
export { database } from './storage'
export type { StoredArmy, StoredBattle } from './storage'
export { saveArmy, getArmy, listArmies } from '../features/armyLibrary/repository'

export async function saveBattle(session: BattleSession): Promise<void> {
  await database.battles.put({
    id: session.setup.gameId,
    session,
    status: session.state.status,
    updatedAt: session.state.updatedAt,
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

type LegacyPlayerSetup = BattleSession['setup']['players'][number] & { army?: Army }

function normalizeLegacySession(session: BattleSession): BattleSession {
  const legacySetup = session.setup as Omit<BattleSession['setup'], 'armies' | 'players'> & {
    armies?: Record<string, Army>
    players: LegacyPlayerSetup[]
  }
  if (legacySetup.armies) return session
  const armies = Object.fromEntries(legacySetup.players.flatMap((player) => (
    player.army ? [[player.army.id, player.army] as const] : []
  )))
  const players = legacySetup.players.map((player) => {
    const { army, ...setupPlayer } = player
    return { ...setupPlayer, armyId: setupPlayer.armyId ?? army?.id }
  })
  return { ...session, setup: { ...session.setup, players, armies } }
}
