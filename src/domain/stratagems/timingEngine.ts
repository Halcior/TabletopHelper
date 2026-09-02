import { getUsage, isStandardUsageLimit, standardUsageLimitReason } from './usage'
import type {
  ReactionContext,
  ReactionPolicy,
  RuleCheckResult,
  StratagemAvailability,
  StratagemDefinition,
  TimedOptionDefinition,
  TimingEvaluationContext,
  TimingStateView,
  TimingTrigger,
} from './types'

function denialReason(result: RuleCheckResult, fallback: string): string | undefined {
  if (typeof result === 'boolean') return result ? undefined : fallback
  return result.allowed ? undefined : (result.reason ?? fallback)
}

function matchesOwnerScope(
  definition: TimedOptionDefinition,
  playerId: string,
  activePlayerId: string,
): boolean {
  switch (definition.ownerScope) {
    case 'ACTIVE_PLAYER': return playerId === activePlayerId
    case 'OPPONENT': return playerId !== activePlayerId
    case 'ANY_PLAYER': return true
  }
}

export type TimingMatchInput<TDefinition extends TimedOptionDefinition> = {
  definition: TDefinition
  playerId: string
  gameState: TimingStateView
  phase: TimingStateView['phase']
  trigger: TimingTrigger
  context?: ReactionContext
}

/** Shared timing/restriction evaluation for Stratagems and future timed abilities. */
export function evaluateTimedOption<TDefinition extends TimedOptionDefinition>(
  input: TimingMatchInput<TDefinition>,
): { matches: boolean; reasons: string[] } {
  const { definition, playerId, gameState, phase, trigger } = input
  if (!definition.phases.includes('ANY') && !definition.phases.includes(phase)) {
    return { matches: false, reasons: [] }
  }
  if (!definition.triggers.includes(trigger)) return { matches: false, reasons: [] }
  if (!matchesOwnerScope(definition, playerId, gameState.activePlayerId)) {
    return { matches: false, reasons: [] }
  }

  const evaluation: TimingEvaluationContext = {
    playerId,
    gameState,
    phase,
    trigger,
    context: input.context ?? {},
  }
  const reasons = (definition.restrictions ?? []).flatMap((restriction) => {
    const reason = denialReason(restriction.evaluate(evaluation), restriction.description)
    return reason ? [reason] : []
  })
  return { matches: true, reasons }
}

export type GetAvailableStratagemsInput = {
  playerId: string
  gameState: TimingStateView
  phase?: TimingStateView['phase']
  trigger: TimingTrigger
  context?: ReactionContext
  definitions: readonly StratagemDefinition[]
  reactionOnly?: boolean
  reactionPolicy?: ReactionPolicy
}

/**
 * Returns definitions whose timing currently matches. A matching definition can
 * still be disabled; `reasons` explains CP, usage, restriction, or policy denial.
 */
export function getAvailableStratagems(
  input: GetAvailableStratagemsInput,
): StratagemAvailability[] {
  const phase = input.phase ?? input.gameState.phase
  const player = input.gameState.players[input.playerId]
  if (!player) return []

  return input.definitions.flatMap((definition) => {
    if (input.reactionOnly && !definition.reaction) return []
    const timing = evaluateTimedOption({
      definition,
      playerId: input.playerId,
      gameState: input.gameState,
      phase,
      trigger: input.trigger,
      context: input.context,
    })
    if (!timing.matches) return []

    const usage = getUsage(input.gameState.timing, input.playerId, definition.id)
    const evaluation: TimingEvaluationContext = {
      playerId: input.playerId,
      gameState: input.gameState,
      phase,
      trigger: input.trigger,
      context: input.context ?? {},
    }
    const usageReasons = (definition.usageLimits ?? []).flatMap((limit) => {
      if (isStandardUsageLimit(limit)) {
        const reason = standardUsageLimitReason(limit, usage)
        return reason ? [reason] : []
      }
      const reason = denialReason(limit.evaluate({ ...evaluation, usage }), limit.description)
      return reason ? [reason] : []
    })
    const policyReason = input.reactionOnly && definition.reaction && input.reactionPolicy
      ? denialReason(
        input.reactionPolicy.canUseReaction({ ...evaluation, definition, usage }),
        'The current ruleset does not allow this reaction.',
      )
      : undefined
    const reasons = [
      ...timing.reasons,
      ...usageReasons,
      ...(player.cp < definition.cpCost ? [`Requires ${definition.cpCost} CP; ${player.cp} available.`] : []),
      ...(policyReason ? [policyReason] : []),
    ]
    return [{ definition, canUse: reasons.length === 0, reasons }]
  })
}

export function getUsableStratagems(input: GetAvailableStratagemsInput): StratagemDefinition[] {
  return getAvailableStratagems(input)
    .filter((availability) => availability.canUse)
    .map((availability) => availability.definition)
}
