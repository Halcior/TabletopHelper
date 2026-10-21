import Dexie, { type EntityTable } from 'dexie'
import type { Army } from '../domain/army/types'
import type { BattleSession } from '../domain/battle/types'
import type { LocalVisualMedia } from '../features/factionVisuals/media'

export type StoredArmy = {
  id: string
  army: Army
  savedAt: string
  changeId?: string
  ownerId?: string
  status?: 'local' | 'synced' | 'pending' | 'error'
  revision?: number
  deleted?: boolean
  pending?: boolean
  sourceLocalId?: string
  conflictNote?: string
  error?: string
}
export type AccountArmy = StoredArmy & {
  ownerId: string
  changeId: string
  revision: number
  pending: boolean
}
export type LibraryPreference = {
  ownerId: string
  localImportChoice?: 'local' | 'later'
}
export type StoredBattle = {
  id: string
  session: BattleSession
  status: BattleSession['state']['status']
  updatedAt: string
}

class TabletopDatabase extends Dexie {
  visualMedia!: EntityTable<LocalVisualMedia, 'key'>
  armies!: EntityTable<StoredArmy, 'id'>
  accountArmies!: EntityTable<AccountArmy, 'id'>
  libraryPreferences!: EntityTable<LibraryPreference, 'ownerId'>
  battles!: EntityTable<StoredBattle, 'id'>
  constructor() {
    super('tabletop-companion')
    this.version(1).stores({
      armies: '&id, savedAt, army.faction',
      battles: '&id, status, updatedAt',
    })
    this.version(2).stores({
      armies: '&id, savedAt, army.faction',
      battles: '&id, status, updatedAt',
      visualMedia: '&key, armyId, updatedAt',
    })
    this.version(3).stores({
      accountArmies: '[ownerId+id], ownerId, savedAt',
      libraryPreferences: '&ownerId',
    })
  }
}
export const database = new TabletopDatabase()
