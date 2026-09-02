import type { Army, UnitState } from '../army/types'
import type { ReactionWindow, TimingState } from '../stratagems/types'

export const BATTLE_PHASES = [
  'COMMAND',
  'MOVEMENT',
  'SHOOTING',
  'CHARGE',
  'FIGHT',
  'END_TURN',
] as const

export type BattlePhase = typeof BATTLE_PHASES[number]
export type GuidanceLevel = 'guided' | 'fast'
export type ScoreCategory = 'primary' | 'secondary' | 'plan' | 'adjustment'
export type BattleLifecycleStatus = 'active' | 'completed' | 'abandoned'

export type PlayerSetup = {
  id: string
  name: string
  faction?: string
  armyId?: string
  deploymentZone?: string
  turnPosition?: number
  startingCp?: number
}

export type ObjectiveDefinition = {
  id: string
  name: string
  type: 'home' | 'neutral' | 'other'
}

export type BattleSetup = {
  gameId: string
  rulesetId: string
  players: PlayerSetup[]
  armies: Record<string, Army>
  turnOrder: string[]
  objectives: ObjectiveDefinition[]
  maxRounds: number
  guidanceLevel: GuidanceLevel
  rulesetConfig?: unknown
  createdAt: string
}

export type ScoreBreakdown = Record<ScoreCategory, number>

export type PlayerState = {
  id: string
  name: string
  faction?: string
  armyId?: string
  deploymentZone?: string
  turnPosition?: number
  cp: number
  score: ScoreBreakdown
  units: Record<string, UnitState>
}

export type ObjectiveState = ObjectiveDefinition & {
  playerOC: Record<string, number>
  controllerPlayerId: string | null
}

export type ObjectiveControlSnapshot = {
  round: number
  playerId?: string
  objectiveControllers: Record<string, string | null>
  objectiveStates: Record<string, {
    controllerPlayerId: string | null
    playerOC: Record<string, number>
  }>
  capturedAt: string
}

export type MissionActionStatus = 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type MissionActionType = 'SECURE_DATA' | 'SCAN_SIGNAL' | 'SABOTAGE' | 'CUSTOM'
export type MissionActionLocationType = 'NEUTRAL_OBJECTIVE' | 'BATTLEFIELD_CENTRE' | 'CUSTOM'

export type MissionActionState = {
  id: string
  playerId: string
  unitId: string
  type: MissionActionType
  name: string
  targetObjectiveId?: string
  locationType?: MissionActionLocationType
  startedRound: number
  startedTurn: number
  status: MissionActionStatus
  linkedSecondaryCardId?: string
  endedRound?: number
  endedTurn?: number
  failureReason?: string
}

type BattleEventMetadata = {
  id: string
  actionId: string
  timestamp: string
  actorPlayerId?: string
  undoable: boolean
}

export type BattleEvent = BattleEventMetadata & (
  | { type: 'GAME_STARTED'; payload: Record<string, never> }
  | { type: 'GAME_ENDED'; payload: Record<string, never> }
  | { type: 'GAME_ABANDONED'; payload: Record<string, never> }
  | { type: 'ROUND_STARTED'; payload: { round: number } }
  | { type: 'ROUND_ENDED'; payload: { round: number } }
  | { type: 'TURN_STARTED'; payload: { playerId: string } }
  | { type: 'TURN_ENDED'; payload: { playerId: string } }
  | { type: 'PHASE_CHANGED'; payload: { phase: BattlePhase } }
  | { type: 'CP_GAINED'; payload: { playerId: string; amount: number } }
  | { type: 'CP_SPENT'; payload: { playerId: string; amount: number } }
  | { type: 'SCORE_ADJUSTED'; payload: { playerId: string; category: ScoreCategory; delta: number } }
  | {
    type: 'UNIT_MODEL_DESTROYED'
    payload: { playerId: string; unitId: string; amount: number; destroyedByPlayerId?: string | null }
  }
  | { type: 'UNIT_MODEL_RESTORED'; payload: { playerId: string; unitId: string; amount: number } }
  | {
    type: 'UNIT_WOUNDS_CHANGED'
    payload: { playerId: string; unitId: string; woundsRemaining: number; destroyedByPlayerId?: string | null }
  }
  | {
    type: 'UNIT_DESTROYED'
    payload: { playerId: string; unitId: string; destroyedByPlayerId?: string | null }
  }
  | { type: 'UNIT_BATTLESHOCK_CHANGED'; payload: { playerId: string; unitId: string; battleShocked: boolean } }
  | { type: 'BATTLESHOCK_TEST_RESOLVED'; payload: { playerId: string; unitId: string; passed: boolean } }
  | { type: 'ABILITY_USED'; payload: { playerId: string; unitId: string; abilityName: string; used: boolean } }
  | { type: 'OBJECTIVE_OC_CHANGED'; payload: { objectiveId: string; playerId: string; oc: number } }
  | { type: 'OBJECTIVE_CONTROL_CHANGED'; payload: { objectiveId: string; controllerPlayerId: string | null } }
  | { type: 'MISSION_ACTION_STARTED'; payload: { action: MissionActionState } }
  | {
    type: 'MISSION_ACTION_COMPLETED'
    payload: { actionId: string; endedRound: number; endedTurn: number }
  }
  | {
    type: 'MISSION_ACTION_FAILED'
    payload: { actionId: string; endedRound: number; endedTurn: number; reason: string }
  }
  | {
    type: 'MISSION_ACTION_CANCELLED'
    payload: { actionId: string; endedRound: number; endedTurn: number; reason?: string }
  }
  | { type: 'REACTION_WINDOW_OPENED'; payload: { window: ReactionWindow } }
  | { type: 'REACTION_HOLD_REQUESTED'; payload: { window: ReactionWindow } }
  | { type: 'REACTION_HOLD_REFINED'; payload: { window: ReactionWindow } }
  | { type: 'REACTION_PASSED'; payload: { reactionWindowId: string; playerId: string } }
  | {
    type: 'STRATAGEM_USED'
    payload: {
      playerId: string
      stratagemId: string
      stratagemName: string
      cpCost: number
      reactionWindowId?: string
    }
  }
  | { type: 'REACTION_WINDOW_RESOLVED'; payload: { reactionWindowId: string } }
  | { type: 'REACTION_WINDOW_CANCELLED'; payload: { reactionWindowId: string } }
  | { type: 'RULESET_EVENT'; payload: { rulesetId: string; action: string; data: unknown } }
)

type EventMetadataKeys = keyof BattleEventMetadata
export type BattleEventInput = BattleEvent extends infer Event
  ? Event extends BattleEvent
    ? Omit<Event, EventMetadataKeys>
    : never
  : never

export type GameState = {
  gameId: string
  rulesetId: string
  status: BattleLifecycleStatus
  round: number
  activePlayerId: string
  phase: BattlePhase
  turnOrder: string[]
  maxRounds: number
  players: Record<string, PlayerState>
  objectives: Record<string, ObjectiveState>
  snapshots: {
    roundStart: ObjectiveControlSnapshot[]
    turnStart: ObjectiveControlSnapshot[]
  }
  timing: TimingState
  missionActions: Record<string, MissionActionState>
  events: BattleEvent[]
  createdAt: string
  updatedAt: string
}

export type BattleSession = {
  setup: BattleSetup
  state: GameState
  redoActions: BattleEvent[][]
}
