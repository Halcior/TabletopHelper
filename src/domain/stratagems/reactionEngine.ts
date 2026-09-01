import { getAvailableStratagems } from './timingEngine'
import type {
  ReactionContext,
  ReactionOpportunity,
  ReactionPolicy,
  ReactionResponse,
  ReactionWindow,
  StratagemDefinitionsByPlayer,
  TimingStateView,
  TimingTrigger,
} from './types'

function createId(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `reaction-${suffix}`
}

export type EvaluateReactionInput = {
  gameState: TimingStateView
  trigger: TimingTrigger
  context?: ReactionContext
  definitionsByPlayer: StratagemDefinitionsByPlayer
  reactionPolicy?: ReactionPolicy
}

export function getReactionOpportunity(input: EvaluateReactionInput): ReactionOpportunity {
  const context = { actingPlayerId: input.gameState.activePlayerId, ...input.context }
  const reactionsByPlayer = Object.fromEntries(
    Object.keys(input.gameState.players)
      .filter((playerId) => playerId !== input.gameState.activePlayerId)
      .map((playerId) => [playerId, getAvailableStratagems({
        playerId,
        gameState: input.gameState,
        trigger: input.trigger,
        context,
        definitions: input.definitionsByPlayer[playerId] ?? [],
        reactionOnly: true,
        reactionPolicy: input.reactionPolicy,
      }).filter((availability) => availability.canUse)]),
  )
  const eligiblePlayerIds = Object.entries(reactionsByPlayer)
    .filter(([, reactions]) => reactions.length > 0)
    .map(([playerId]) => playerId)
  return {
    trigger: input.trigger,
    phase: input.gameState.phase,
    activePlayerId: input.gameState.activePlayerId,
    context,
    reactionsByPlayer,
    eligiblePlayerIds,
    hasReactions: eligiblePlayerIds.length > 0,
  }
}

export type OpenReactionWindowInput = {
  opportunity: ReactionOpportunity
  mode: 'guided' | 'fast'
  requestedByPlayerId?: string
  id?: string
  openedAt?: string
}

/** Creates no interruption unless a legal reaction exists or HOLD was explicit. */
export function createReactionWindow(input: OpenReactionWindowInput): ReactionWindow | null {
  const { opportunity, requestedByPlayerId } = input
  if (!opportunity.hasReactions && !requestedByPlayerId) return null
  if (requestedByPlayerId && requestedByPlayerId === opportunity.activePlayerId) {
    throw new Error('Only a non-active player can request a reaction hold.')
  }
  if (requestedByPlayerId && !(requestedByPlayerId in opportunity.reactionsByPlayer)) {
    throw new Error(`Unknown reaction player: ${requestedByPlayerId}`)
  }

  const responses = Object.fromEntries(Object.entries(opportunity.reactionsByPlayer).map(([playerId, reactions]) => {
    const hasReaction = reactions.length > 0
    const response: ReactionResponse = {
      playerId,
      status: hasReaction || playerId === requestedByPlayerId ? 'PENDING' : 'PASS',
      availableOptionIds: reactions.map(({ definition }) => definition.id),
      automatic: !hasReaction && playerId !== requestedByPlayerId,
    }
    return [playerId, response]
  }))

  return {
    id: input.id ?? createId(),
    trigger: opportunity.trigger,
    phase: opportunity.phase,
    activePlayerId: opportunity.activePlayerId,
    eligiblePlayerIds: opportunity.eligiblePlayerIds,
    context: opportunity.context,
    status: 'OPEN',
    behavior: input.mode === 'guided' || requestedByPlayerId ? 'HARD' : 'SOFT',
    responses,
    openedAt: input.openedAt ?? new Date().toISOString(),
    requestedByPlayerId,
  }
}

export function evaluateReactionTrigger(
  input: EvaluateReactionInput & { mode: 'guided' | 'fast'; id?: string; openedAt?: string },
): { opportunity: ReactionOpportunity; window: ReactionWindow | null } {
  const opportunity = getReactionOpportunity(input)
  return {
    opportunity,
    window: input.mode === 'guided'
      ? createReactionWindow({ opportunity, mode: input.mode, id: input.id, openedAt: input.openedAt })
      : null,
  }
}

export function allResponsesResolved(window: ReactionWindow): boolean {
  return Object.values(window.responses).every((response) => response.status !== 'PENDING')
}

export function getReactionPriorityPlayerId(window: ReactionWindow): string | undefined {
  return Object.values(window.responses).find((response) => response.status === 'PENDING')?.playerId
}

export function withReactionResponse(
  window: ReactionWindow,
  playerId: string,
  status: 'PASS' | 'USED_REACTION',
  respondedAt: string,
  usedOptionId?: string,
): ReactionWindow {
  const response = window.responses[playerId]
  if (!response) throw new Error(`Player ${playerId} is not part of reaction window ${window.id}.`)
  if (response.status !== 'PENDING') throw new Error(`Player ${playerId} already responded.`)
  return {
    ...window,
    responses: {
      ...window.responses,
      [playerId]: {
        ...response,
        status,
        automatic: false,
        usedOptionId,
        respondedAt,
      },
    },
  }
}

export function isReactionWindowBlocking(window: ReactionWindow | undefined): boolean {
  return window?.status === 'OPEN' && window.behavior === 'HARD'
}
