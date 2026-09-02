import type { BattlePhase } from '../battle/types'

export const TIMING_TRIGGERS = [
  'PHASE_START',
  'PHASE_END',
  'UNIT_SELECTED_TO_MOVE',
  'UNIT_FINISHED_MOVE',
  'UNIT_SELECTED_TO_SHOOT',
  'UNIT_SELECTED_AS_TARGET',
  'SHOOTING_ATTACK_DECLARED',
  'SHOOTING_ATTACK_RESOLVED',
  'CHARGE_DECLARED',
  'CHARGE_ROLL_MADE',
  'CHARGE_COMPLETED',
  'UNIT_SELECTED_TO_FIGHT',
  'MELEE_TARGET_SELECTED',
  'FIGHT_RESOLVED',
  'MODEL_DESTROYED',
  'UNIT_DESTROYED',
  'BATTLESHOCK_RESOLVED',
  'BATTLESHOCK_FAILED',
  'BATTLESHOCK_PASSED',
  'OBJECTIVE_CONTROL_CHANGED',
  'CUSTOM_CONFIRMATION',
] as const

export const STANDARD_USAGE_LIMITS = [
  'ONCE_PER_PHASE',
  'ONCE_PER_TURN',
  'ONCE_PER_BATTLE_ROUND',
  'ONCE_PER_BATTLE',
] as const

export type TimingTrigger = typeof TIMING_TRIGGERS[number]
export type TimingPhase = BattlePhase | 'ANY'
export type OwnerScope = 'ACTIVE_PLAYER' | 'OPPONENT' | 'ANY_PLAYER'
export type StandardUsageLimit = typeof STANDARD_USAGE_LIMITS[number]
export type TimedOptionKind = 'STRATAGEM' | 'ABILITY' | (string & {})
export type TimingConfidence = 'VERIFIED' | 'REQUIRES_CONFIRMATION'

export type ReactionContext = {
  actingPlayerId?: string
  sourceUnitId?: string
  targetUnitId?: string
  targetPlayerId?: string
  objectiveId?: string
  eventId?: string
  [key: string]: unknown
}

export type TimingStateView = {
  round: number
  activePlayerId: string
  phase: BattlePhase
  players: Record<string, { cp: number }>
  timing?: TimingState
  events?: readonly { type: string; payload: unknown }[]
}

export type TimingEvaluationContext = {
  playerId: string
  gameState: TimingStateView
  phase: BattlePhase
  trigger: TimingTrigger
  context: ReactionContext
}

export type RuleCheckResult = boolean | { allowed: boolean; reason?: string }

export type TimingRestriction = {
  id: string
  description: string
  evaluate: (input: TimingEvaluationContext) => RuleCheckResult
}

export type CustomUsageLimit = {
  kind: 'CUSTOM'
  id: string
  description: string
  evaluate: (input: TimingEvaluationContext & { usage: StratagemUsageState }) => RuleCheckResult
}

export type UsageLimit = StandardUsageLimit | CustomUsageLimit

export type TimedOptionDefinition = {
  id: string
  kind: TimedOptionKind
  name: string
  description: string
  ownerScope: OwnerScope
  timing?: string
  /**
   * Presentation metadata describing how much of the timing/guard logic the
   * structured source can prove. It never overrides Timing Engine legality.
   */
  timingConfidence?: TimingConfidence
  timingConfidenceReasons?: readonly string[]
  phases: readonly TimingPhase[]
  triggers: readonly TimingTrigger[]
  reaction: boolean
  restrictions?: readonly TimingRestriction[]
  usageLimits?: readonly UsageLimit[]
  source: string
}

export type StratagemDefinition = TimedOptionDefinition & {
  kind: 'STRATAGEM'
  cpCost: number
}

export type StratagemUsageState = {
  playerId: string
  stratagemId: string
  usedThisTurn: number
  usedThisBattleRound: number
  usedThisPhase: number
  timesUsedBattle: number
  lastUsedRound?: number
  lastUsedTurn?: string
  lastUsedPhase?: BattlePhase
}

export type ReactionWindowStatus = 'OPEN' | 'RESOLVED' | 'CANCELLED'
export type ReactionResponseStatus = 'PENDING' | 'PASS' | 'USED_REACTION'
export type ReactionWindowBehavior = 'HARD' | 'SOFT'

export type ReactionResponse = {
  playerId: string
  status: ReactionResponseStatus
  availableOptionIds: string[]
  automatic: boolean
  usedOptionId?: string
  respondedAt?: string
}

export type ReactionWindow = {
  id: string
  trigger: TimingTrigger
  phase: BattlePhase
  activePlayerId: string
  eligiblePlayerIds: string[]
  context: ReactionContext
  status: ReactionWindowStatus
  behavior: ReactionWindowBehavior
  responses: Record<string, ReactionResponse>
  openedAt: string
  requestedByPlayerId?: string
  resolvedAt?: string
}

export type TimingState = {
  stratagemUsage: Record<string, StratagemUsageState>
  reactionWindows: Record<string, ReactionWindow>
  activeReactionWindowId: string | null
}

export type StratagemAvailability = {
  definition: StratagemDefinition
  canUse: boolean
  reasons: string[]
}

export type ReactionPolicyInput = TimingEvaluationContext & {
  definition: StratagemDefinition
  usage: StratagemUsageState
}

export type ReactionPolicy = {
  /** Ruleset extension point (for example, aggregate per-turn reaction caps). */
  canUseReaction: (input: ReactionPolicyInput) => RuleCheckResult
}

export type StratagemDefinitionsByPlayer = Record<string, readonly StratagemDefinition[]>

export type ReactionOpportunity = {
  trigger: TimingTrigger
  phase: BattlePhase
  activePlayerId: string
  context: ReactionContext
  reactionsByPlayer: Record<string, StratagemAvailability[]>
  eligiblePlayerIds: string[]
  hasReactions: boolean
}
