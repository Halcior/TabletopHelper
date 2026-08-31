export type Detachment = {
  id: string
  name: string
}

export type Army = {
  id: string
  name: string
  faction: string
  totalPoints: number
  pointsLimit?: number
  detachments: Detachment[]
  units: UnitDefinition[]
}

export type WeaponProfile = {
  name: string
  type: 'ranged' | 'melee'
  range?: string
  attacks?: string
  skill?: string
  strength?: string
  ap?: string
  damage?: string
  keywords: string[]
}

export type Ability = {
  name: string
  description?: string
}

export type Enhancement = {
  name: string
  points: number
  description?: string
}

export type WargearItem = {
  name: string
  points: number
}

export type ModelGroup = {
  name: string
  startingCount: number
  equipment: string[]
  stats?: UnitStats
}

export type SourceMetadata = {
  importer: string
  nrRosterId?: string
  nrSelectionId?: string
}

export type UnitDefinition = {
  id: string
  sourceId?: string
  name: string
  points: number
  startingModels: number
  modelGroups: ModelGroup[]
  stats?: UnitStats
  categories: string[]
  keywords: string[]
  rangedWeapons: WeaponProfile[]
  meleeWeapons: WeaponProfile[]
  abilities: Ability[]
  enhancements: Enhancement[]
  wargear: WargearItem[]
  isWarlord: boolean
  leaderOfUnitId: string | null
  ledByUnitIds: string[]
  sourceMetadata?: SourceMetadata
}

export type UnitStats = {
  movement?: string
  toughness?: number
  save?: string
  wounds?: number
  leadership?: string
  objectiveControl?: number
  invulnerableSave?: string | null
}

export type UnitState = {
  unitId: string
  modelsAlive: number
  woundsRemaining?: number
  currentModelWounds?: number
  destroyed: boolean
  battleShocked: boolean
  inReserve: boolean
  oncePerBattleAbilities: Record<string, boolean>
  notes?: string
}
