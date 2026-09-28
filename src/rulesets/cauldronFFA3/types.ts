import type { Army } from '../../domain/army/types'
import type { ObjectiveState } from '../../domain/battle/types'
import type { OfficialSecondaryId, SecondaryId } from './secondaryTypes'

export type DeploymentZone = 'A' | 'B' | 'C'
export type TurnPosition = 1 | 2 | 3
export type CauldronMode = 'duel' | 'ffa3'
export type CauldronObjectiveLayout = 'classic-6' | 'expanded-7'
export type SecondaryDeck = 'cauldron' | 'chapter-approved'
export type PrimaryDeck = 'cauldron' | 'chapter-approved-ffa' | 'chapter-approved-duel'
import type { ForceDisposition } from './duelPrimary'
export type OfficialPrimaryId = 'battlefield-dominance' | 'meatgrinder' | 'gather-intel' | 'sabotage' | 'outmanoeuvre'
export type OfficialSecondaryStrategy = 'tactical' | 'fixed'
export type OperationalPlanId =
  | 'WYNISZCZENIE'
  | 'DECYDUJACE_NATARCIE'
  | 'TWIERDZA'
  | 'ZWIAD_OPERACYJNY'
  | 'SABOTAZ'

export type PlanEvaluationStatus = 'COMPLETED' | 'INCOMPLETE' | 'REQUIRES_CONFIRMATION'

export type CauldronPlayerInput = {
  id: string
  name: string
  armyId: string
  deploymentZone: DeploymentZone
  turnPosition: TurnPosition
  operationalPlanId: OperationalPlanId
  officialPrimaryId?: OfficialPrimaryId
  forceDisposition?: ForceDisposition
}

export type CauldronGameInput = {
  players: CauldronPlayerInput[]
  armies: Army[]
  guidanceLevel: 'guided' | 'fast'
  mode?: CauldronMode
  objectiveLayout?: CauldronObjectiveLayout
  primaryDeck?: PrimaryDeck
  secondaryDeck?: SecondaryDeck
  officialSecondaryStrategy?: OfficialSecondaryStrategy
  officialSecondaryStrategies?: Record<string, OfficialSecondaryStrategy>
  officialLayout?: 1 | 2 | 3
  fixedSecondarySelections?: Record<string, [OfficialSecondaryId, OfficialSecondaryId]>
  gameId?: string
  createdAt?: string
  /** Optional deterministic order for tests/dev tools. Normal games shuffle every player's complete deck. */
  secondaryDeckOrders?: Partial<Record<string, readonly SecondaryId[]>>
}

export type CauldronPlayerConfig = {
  deploymentZone: DeploymentZone
  turnPosition: TurnPosition
  initialOperationalPlanId: OperationalPlanId
  officialPrimaryId?: OfficialPrimaryId
  forceDisposition?: ForceDisposition
}

export type CauldronConfig = {
  version: 1
  mode?: CauldronMode
  playerCount?: 2 | 3
  objectiveLayout?: CauldronObjectiveLayout
  primaryDeck?: PrimaryDeck
  secondaryDeck?: SecondaryDeck
  officialSecondaryStrategy?: OfficialSecondaryStrategy
  officialSecondaryStrategies?: Record<string, OfficialSecondaryStrategy>
  officialLayout?: 1 | 2 | 3
  fixedSecondarySelections?: Record<string, [OfficialSecondaryId, OfficialSecondaryId]>
  battleRounds: number
  primaryCap: number
  secondaryCap: number
  totalCap: number
  playerConfigs: Record<string, CauldronPlayerConfig>
}

export type CauldronRoundSnapshot = {
  round: number
  objectiveStates: Record<string, Pick<ObjectiveState, 'controllerPlayerId' | 'playerOC'>>
  rivalPlayerIds: Record<string, string>
}

export type CauldronTurnSnapshot = {
  round: number
  playerId: string
  objectiveStates: Record<string, Pick<ObjectiveState, 'controllerPlayerId' | 'playerOC'>>
}

export type PlanConfirmation = {
  zwiadHasFourSectors?: boolean
  zwiadHasTwoOutsideDeployment?: boolean
  twierdzaNoEnemyAtObjectives?: boolean
  sabotageMissionActionCompleted?: boolean
  /** Legacy aliases kept so persisted review state and older tests can still rehydrate. */
  zwiadHasThreeSectors?: boolean
  zwiadHasThreeOutsideDeployment?: boolean
  officialPrimary?: OfficialPrimaryConfirmation
}

export type OfficialPrimaryAction = { objectiveId: string; unitName: string; enemyTerritory?: boolean }
export type OfficialPrimaryConfirmation = {
  actions?: OfficialPrimaryAction[]
  enemyUnitsDestroyedThisTurn?: number
  friendlyUnitsDestroyedSinceLastTurn?: number
}

export type OfficialPrimaryReview = {
  missionId: OfficialPrimaryId
  missionName: string
  conditions: PrimaryCondition[]
  operationMarkerObjectiveIds: string[]
}

export type OperationalPlanTurnTarget = {
  playerId: string
  planId: 'DECYDUJACE_NATARCIE' | 'TWIERDZA'
  round: number
  objectiveId: string
}

export type PlanEvaluation = {
  planId: OperationalPlanId
  name: string
  description: string
  vp: 5
  status: PlanEvaluationStatus
  reason: string
  progress?: {
    current: number
    target: number
    unit: string
  }
  confirmation?: {
    key: keyof PlanConfirmation
    prompt: string
  }
}

export type PrimaryCondition = {
  completed: boolean
  vp: number
  label: string
}

export type PrimaryRoundResult = {
  playerId: string
  round: number
  neutralObjective: PrimaryCondition
  twoObjectives: PrimaryCondition
  operationalPlan: PrimaryCondition
  planEvaluation: PlanEvaluation
  official?: OfficialPrimaryReview
  roundPrimary: number
  capped: boolean
}

export type PrimaryTurnCommit = {
  round: number
  playerId: string
  review: PrimaryRoundResult
  pointsAwarded: number
}

export type DeferredWyniszczenieCommit = {
  round: number
  playerId: string
  completed: boolean
  pointsAwarded: number
}

export type CasualtyRecord = {
  attackerPlayerId: string
  targetPlayerId: string
  unitId: string
  modelsDestroyed: number
  battleRound: number
}

export type WyniszczenieProgress = {
  attackerPlayerId: string
  rivalPlayerId: string
  destroyedValue: number
  threshold: number
  completed: boolean
}
