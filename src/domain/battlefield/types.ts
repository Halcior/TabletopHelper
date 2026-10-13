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
}

/** Reserved for future footprints; the MVP only edits objective markers. */
export type BattlefieldFootprint =
  | {
      kind: 'rectangle'
      centre: BoardPoint
      width: number
      height: number
      rotation: number
    }
  | { kind: 'polygon'; points: BoardPoint[]; rotation: number }

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
