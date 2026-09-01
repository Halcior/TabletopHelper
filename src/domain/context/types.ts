import type { UnitDefinition, UnitState } from '../army/types'
import type { BattlePhase, BattleSession, GuidanceLevel, MissionActionState, ObjectiveState, PlayerState } from '../battle/types'
import type { StratagemAvailability, StratagemDefinition } from '../stratagems/types'

export type ContextStatus = 'DONE' | 'AVAILABLE' | 'REQUIRED' | 'WARNING' | 'INFO' | 'BLOCKING'
export type ContextSeverity = 'QUIET' | 'INFO' | 'ATTENTION' | 'CRITICAL'
export type ContextSource =
  | 'SYSTEM'
  | 'PRIMARY'
  | 'SECONDARY'
  | 'OPERATIONAL_PLAN'
  | 'MISSION_ACTION'
  | 'ARMY'
  | 'OBJECTIVE'
  | 'STRATAGEM'
  | 'REACTION'
  | 'ABILITY'

export type ContextActionType =
  | 'GAIN_COMMAND_POINT'
  | 'OPEN_RIVAL_ARMY'
  | 'OPEN_UNIT'
  | 'CHANGE_OBJECTIVE_CONTROL'
  | 'START_MISSION_ACTION'
  | 'CHECK_SECONDARY_CONDITION'
  | 'SELECT_PRIORITY_TARGET'
  | 'RESOLVE_ELIMINATION_CHOICE'
  | 'MULLIGAN_SECONDARY'
  | 'CHANGE_OPERATIONAL_PLAN'
  | 'OPEN_STRATAGEMS'
  | 'USE_STRATAGEM'
  | 'HOLD_REACTION'
  | 'PASS_REACTION'
  | 'ADVANCE_PHASE'
  | 'END_TURN'
  | 'END_ROUND'
  | 'DISMISS'

export type ContextAction = {
  id: string
  type: ContextActionType
  label: string
  playerId?: string
  unitId?: string
  objectiveId?: string
  secondaryId?: string
  stratagemId?: string
  reactionWindowId?: string
}

export type ContextItem = {
  id: string
  type: string
  title: string
  shortDescription: string
  status: ContextStatus
  severity: ContextSeverity
  source: ContextSource
  phase: BattlePhase
  relatedPlayerId?: string
  relatedUnitId?: string
  relatedObjectiveId?: string
  relatedSecondaryId?: string
  actions: ContextAction[]
  details?: string[]
  dismissible?: boolean
}

export type ContextSection = {
  id: string
  title: string
  items: ContextItem[]
}

export type ContextRulesRecord = {
  definition: StratagemDefinition
  classification: 'ACTIVE' | 'REACTION' | 'BOTH'
  manualConfirmationRequired: boolean
  fullyAutomatedTiming: boolean
}

export type ContextRulesResolution = {
  stratagems: readonly ContextRulesRecord[]
}

export type ContextRulesByPlayer = Record<string, ContextRulesResolution | null | undefined>

export type RelevantStratagem = {
  definition: StratagemDefinition
  classification: ContextRulesRecord['classification']
  manualConfirmationRequired: boolean
  availability: StratagemAvailability
}

export type ReactionPlayerContext = {
  playerId: string
  playerName: string
  exactCount: number
  potentialCount: number
  pending: boolean
}

export type QuickObjectiveState = Pick<ObjectiveState, 'id' | 'name' | 'type' | 'controllerPlayerId'> & {
  controllerName: string
}

export type RelevantEnemyUnit = {
  playerId: string
  playerName: string
  unit: UnitDefinition
  state: UnitState
}

export type BattleContext = {
  activePlayer: PlayerState
  rival: PlayerState | null
  round: number
  phase: BattlePhase
  guidanceLevel: GuidanceLevel
  priorities: ContextItem[]
  availableActions: ContextAction[]
  warnings: ContextItem[]
  automaticEvents: ContextItem[]
  reactions: ContextItem[]
  blockingItems: ContextItem[]
  sections: ContextSection[]
  relevantStratagems: RelevantStratagem[]
  reactionPlayers: ReactionPlayerContext[]
}

export type BuildBattleContextInput = {
  session: BattleSession
  rulesDataByPlayer?: ContextRulesByPlayer
}

export type ActiveMissionActionContext = MissionActionState & {
  unitName: string
}
