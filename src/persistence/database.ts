import Dexie, { type EntityTable } from 'dexie'
import type { Army } from '../domain/army/types'
import type { BattleSession } from '../domain/battle/types'

export type StoredArmy = {
  id: string
  army: Army
  savedAt: string
}

export type StoredBattle = {
  id: string
  session: BattleSession
  status: BattleSession['state']['status']
  updatedAt: string
}

class TabletopDatabase extends Dexie {
  armies!: EntityTable<StoredArmy, 'id'>
  battles!: EntityTable<StoredBattle, 'id'>

  constructor() {
    super('tabletop-companion')
    this.version(1).stores({
      armies: '&id, savedAt, army.faction',
      battles: '&id, status, updatedAt',
    })
  }
}

export const database = new TabletopDatabase()

export async function saveArmy(army: Army): Promise<void> {
  await database.armies.put({ id: army.id, army, savedAt: new Date().toISOString() })
}

export async function getArmy(id: string): Promise<Army | undefined> {
  return (await database.armies.get(id))?.army
}

export async function listArmies(): Promise<StoredArmy[]> {
  return database.armies.orderBy('savedAt').reverse().toArray()
}

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
