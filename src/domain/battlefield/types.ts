export type BoardPoint = { x: number; y: number }

/** Positions are normalized; ownership is exclusively in GameState.objectives. */
export type BattlefieldGeometry = {
  version: 1
  widthCm: number
  heightCm: number
  positions: Record<string, BoardPoint | null>
  locked: boolean
  /** Role mapping is separate from display rotation and turn order. */
  attackerHomeZone: 'A' | 'B'
  /** Optional measured/scaled visual footprints for custom battlefields only.
   * Absent in older saves; not used by scoring or model placement rules.
   */
  footprints?: Record<string, ObjectiveFootprint>
}

/** Original tabletop footprint approximations, not official GW terrain templates. */
export type ObjectiveFootprint = {
  kind: 'rectangle' | 'chamfered'
  widthCm: number
  heightCm: number
  rotation: number
}

/** An unsaved default visualization, independently selectable for each objective. */
export const DEFAULT_OBJECTIVE_FOOTPRINT: ObjectiveFootprint = {
  kind: 'chamfered', widthCm: 30, heightCm: 20, rotation: 0,
}

export type BoardPresentation = {
  title: string
  official: boolean
  sourcePage?: number
  sourceUrl?: string
  sourceVersion?: string
  deploymentAreas: Array<{ zone: string; path: string }>
  territoryPaths: string[]
  unplacedIds: string[]
}

export type OfficialBoardDefinition = {
  page: number
  dispositions: string[]
  variant: string
  widthCm: number
  heightCm: number
  deploymentPaths: { attacker: string; defender: string }
  territoryPaths: string[]
  objectives: {
    homeAttacker: BoardPoint[]
    homeDefender: BoardPoint[]
    central: BoardPoint[]
    expansion: BoardPoint[]
  }
}
