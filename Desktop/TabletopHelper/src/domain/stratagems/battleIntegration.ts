import { dispatchBattleEvents } from '../battle/engine'
import type { BattleEventInput, BattleSession } from '../battle/types'
import {
  allResponsesResolved,
  createReactionWindow,
  getReactionOpportunity,
  isReactionWindowBlocking,
  withReactionResponse,
} from './reactionEngine'
import { getAvailableStratagems } from './timingEngine'
import type {
  ReactionContext,
  ReactionOpportunity,
  ReactionPolicy,
  ReactionWindow,
  StratagemDefinition,
  StratagemDefinitionsByPlayer,
  TimingTrigger,
} from './types'

function activeWindow(session: BattleSession): ReactionWindow | undefined {
  const id = session.state.timing.activeReactionWindowId
  return id ? session.state.timing.reactionWindows[id] : undefined
}

function ensureNoOpenWindow(session: BattleSession): void {
  if (activeWindow(session)?.status === 'OPEN') throw new Error('A reaction window is already open.')
}

export function getCurrentReactionWindow(session: BattleSession): ReactionWindow | undefined {
  return activeWindow(session)
}

export function isBattleFlowPaused(session: BattleSession): boolean {
  return isReactionWindowBlocking(activeWindow(session))
}

export type ReactionTriggerInput = {
  trigger: TimingTrigger
  context?: ReactionContext
  definitionsByPlayer: StratagemDefinitionsByPlayer
  reactionPolicy?: ReactionPolicy
  timestamp?: string
}

/**
 * Guided mode persists a hard window. Fast mode returns the same opportunity for
 * a soft UI alert without adding an interruption to battle history.
 */
export function processReactionTrigger(
  session: BattleSession,
  input: ReactionTriggerInput,
): { session: BattleSession; opportunity: ReactionOpportunity } {
  const opportunity = getReactionOpportunity({
    gameState: session.state,
    trigger: input.trigger,
    context: input.context,
    definitionsByPlayer: input.definitionsByPlayer,
    reactionPolicy: input.reactionPolicy,
  })
  if (session.setup.guidanceLevel === 'fast' || !opportunity.hasReactions) {
    return { session, opportunity }
  }
  ensureNoOpenWindow(session)
  const window = createReactionWindow({
    opportunity,
    mode: 'guided',
    openedAt: input.timestamp,
  })
  if (!window) return { session, opportunity }
  return {
    opportunity,
    session: dispatchBattleEvents(session, [
      { type: 'REACTION_WINDOW_OPENED', payload: { window } },
    ], { timestamp: input.timestamp, actorPlayerId: session.state.activePlayerId }),
  }
}

export function requestReactionHold(
  session: BattleSession,
  playerId: string,
  input: ReactionTriggerInput,
): BattleSession {
  ensureNoOpenWindow(session)
  const opportunity = getReactionOpportunity({
    gameState: session.state,
    trigger: input.trigger,
    context: input.context,
    definitionsByPlayer: input.definitionsByPlayer,
    reactionPolicy: input.reactionPolicy,
  })
  const window = createReactionWindow({
    opportunity,
    mode: session.setup.guidanceLevel,
    requestedByPlayerId: playerId,
    openedAt: input.timestamp,
  })
  if (!window) throw new Error('Could not open a reaction hold.')
  return dispatchBattleEvents(session, [
    { type: 'REACTION_HOLD_REQUESTED', payload: { window } },
  ], { timestamp: input.timestamp, actorPlayerId: playerId })
}

export function passReaction(
  session: BattleSession,
  reactionWindowId: string,
  playerId: string,
  timestamp?: string,
): BattleSession {
  const window = session.state.timing.reactionWindows[reactionWindowId]
  if (!window || window.status !== 'OPEN') throw new Error('The reaction window is not open.')
  const respondedAt = timestamp ?? new Date().toISOString()
  const preview = withReactionResponse(window, playerId, 'PASS', respondedAt)
  const inputs: BattleEventInput[] = [
    { type: 'REACTION_PASSED', payload: { reactionWindowId, playerId } },
  ]
  if (allResponsesResolved(preview)) {
    inputs.push({ type: 'REACTION_WINDOW_RESOLVED', payload: { reactionWindowId } })
  }
  return dispatchBattleEvents(session, inputs, { timestamp: respondedAt, actorPlayerId: playerId })
}

export type UseStratagemInput = {
  playerId: string
  definition: StratagemDefinition
  trigger: TimingTrigger
  context?: ReactionContext
  reactionWindowId?: string
  reactionPolicy?: ReactionPolicy
  timestamp?: string
}

export function useStratagem(session: BattleSession, input: UseStratagemInput): BattleSession {
  const player = session.state.players[input.playerId]
  if (!player) throw new Error(`Unknown player: ${input.playerId}`)
  if (!Number.isInteger(input.definition.cpCost) || input.definition.cpCost < 0) {
    throw new Error('Stratagem CP cost must be a non-negative integer.')
  }

  const window = input.reactionWindowId
    ? session.state.timing.reactionWindows[input.reactionWindowId]
    : undefined
  if (input.reactionWindowId) {
    if (!window || window.status !== 'OPEN') throw new Error('The reaction window is not open.')
    const response = window.responses[input.playerId]
    if (!response || response.status !== 'PENDING') throw new Error('This player cannot respond to the window.')
    if (!response.availableOptionIds.includes(input.definition.id)) {
      throw new Error('This Stratagem is not available in the reaction window.')
    }
  }

  const trigger = window?.trigger ?? input.trigger
  const context = window?.context ?? input.context
  const availability = getAvailableStratagems({
    playerId: input.playerId,
    gameState: session.state,
    phase: window?.phase,
    trigger,
    context,
    definitions: [input.definition],
    reactionOnly: Boolean(window),
    reactionPolicy: input.reactionPolicy,
  })[0]
  if (!availability?.canUse) {
    throw new Error(availability?.reasons.join(' ') || 'This Stratagem is not available now.')
  }

  const inputs: BattleEventInput[] = []
  if (input.definition.cpCost > 0) {
    inputs.push({
      type: 'CP_SPENT',
      payload: { playerId: input.playerId, amount: input.definition.cpCost },
    })
  }
  inputs.push({
    type: 'STRATAGEM_USED',
    payload: {
      playerId: input.playerId,
      stratagemId: input.definition.id,
      stratagemName: input.definition.name,
      cpCost: input.definition.cpCost,
      reactionWindowId: input.reactionWindowId,
    },
  })
  if (window) {
    const preview = withReactionResponse(
      window,
      input.playerId,
      'USED_REACTION',
      input.timestamp ?? new Date().toISOString(),
      input.definition.id,
    )
    if (allResponsesResolved(preview)) {
      inputs.push({ type: 'REACTION_WINDOW_RESOLVED', payload: { reactionWindowId: window.id } })
    }
  }
  return dispatchBattleEvents(session, inputs, {
    timestamp: input.timestamp,
    actorPlayerId: input.playerId,
  })
}

export function cancelReactionWindow(
  session: BattleSession,
  reactionWindowId: string,
  timestamp?: string,
): BattleSession {
  const window = session.state.timing.reactionWindows[reactionWindowId]
  if (!window || window.status !== 'OPEN') throw new Error('The reaction window is not open.')
  return dispatchBattleEvents(session, [
    { type: 'REACTION_WINDOW_CANCELLED', payload: { reactionWindowId } },
  ], { timestamp, actorPlayerId: session.state.activePlayerId })
}
