import type { BattleEvent, BattleSession } from '../domain/battle/types'
import type { SharedMembership } from './types'

export type SharedMutationDecision = {
  allowed: boolean
  reason?: string
}

const TURN_OWNER_EVENTS = new Set<BattleEvent['type']>([
  'ROUND_STARTED',
  'ROUND_ENDED',
  'TURN_STARTED',
  'TURN_ENDED',
  'PHASE_CHANGED',
  'REACTION_WINDOW_OPENED',
  'REACTION_WINDOW_CANCELLED',
])

function deny(reason: string): SharedMutationDecision {
  return { allowed: false, reason }
}

function playerScopedTarget(event: BattleEvent, session: BattleSession): string | null | undefined {
  switch (event.type) {
    case 'CP_GAINED':
    case 'CP_SPENT':
    case 'SCORE_ADJUSTED':
    case 'UNIT_MODEL_DESTROYED':
    case 'UNIT_MODEL_RESTORED':
    case 'UNIT_WOUNDS_CHANGED':
    case 'UNIT_DESTROYED':
    case 'UNIT_BATTLESHOCK_CHANGED':
    case 'ABILITY_USED':
    case 'OBJECTIVE_OC_CHANGED':
    case 'REACTION_PASSED':
    case 'STRATAGEM_USED':
      return event.payload.playerId
    case 'MISSION_ACTION_STARTED':
      return event.payload.action.playerId
    case 'MISSION_ACTION_COMPLETED':
    case 'MISSION_ACTION_FAILED':
    case 'MISSION_ACTION_CANCELLED':
      return session.state.missionActions[event.payload.actionId]?.playerId
    default:
      return undefined
  }
}

function rulesetPlayerId(event: BattleEvent): string | undefined {
  if (event.type !== 'RULESET_EVENT') return undefined
  const data = event.payload.data
  if (!data || typeof data !== 'object' || !('playerId' in data)) return undefined
  const playerId = (data as { playerId?: unknown }).playerId
  return typeof playerId === 'string' ? playerId : undefined
}

function isPriorityTargetRivalChoice(event: BattleEvent): boolean {
  if (event.type !== 'RULESET_EVENT' || event.payload.action !== 'SECONDARY_CARD_STATE_UPDATED') return false
  const data = event.payload.data
  if (!data || typeof data !== 'object') return false
  const patch = (data as { patch?: unknown }).patch
  return Boolean(patch && typeof patch === 'object' && 'priorityTargetUnitId' in patch)
}

function hasPrimaryCommit(events: BattleEvent[]): boolean {
  return events.some((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'PRIMARY_COMMITTED')
}

/**
 * Authorizes one local user action before it is committed to a shared battle.
 * UI permissions remain useful guidance, but this is the store-level backstop:
 * a shared client can mutate its own army/CP/reactions, shared board control,
 * and only the active commander can advance the battle flow.
 */
export function authorizeSharedAction(
  sessionBefore: BattleSession,
  events: BattleEvent[],
  membership: SharedMembership | null | undefined,
): SharedMutationDecision {
  if (!membership || membership.battleId !== sessionBefore.setup.gameId || events.length === 0) {
    return { allowed: true }
  }

  const viewerPlayerId = membership.playerId
  if (!sessionBefore.state.players[viewerPlayerId]) return deny('Your shared player seat is not part of this battle.')

  const lifecycle = events.some((event) => event.type === 'GAME_ENDED' || event.type === 'GAME_ABANDONED')
  if (lifecycle) {
    return membership.isHost
      ? { allowed: true }
      : deny('Only the room host can end or abandon a shared battle.')
  }

  const progression = events.some((event) => TURN_OWNER_EVENTS.has(event.type))
  if (progression && viewerPlayerId !== sessionBefore.state.activePlayerId) {
    const activeName = sessionBefore.state.players[sessionBefore.state.activePlayerId]?.name ?? 'the active player'
    return deny(`Only ${activeName} can advance the current turn.`)
  }

  const primaryCommit = hasPrimaryCommit(events)
  if (primaryCommit && viewerPlayerId !== sessionBefore.state.activePlayerId) {
    return deny('Only the active commander can confirm end-of-round scoring.')
  }

  for (const event of events) {
    if (event.type === 'GAME_STARTED') continue
    if (TURN_OWNER_EVENTS.has(event.type)) continue
    if (event.type === 'REACTION_WINDOW_RESOLVED') continue

    if (event.type === 'OBJECTIVE_CONTROL_CHANGED') {
      // Board control is shared physical state and may be recorded by any seated commander.
      continue
    }

    if (event.type === 'REACTION_HOLD_REQUESTED') {
      const requester = event.payload.window.requestedByPlayerId
      if (requester && requester !== viewerPlayerId) return deny('You can only request your own reaction hold.')
      continue
    }

    const targetPlayerId = playerScopedTarget(event, sessionBefore)
    if (targetPlayerId && targetPlayerId !== viewerPlayerId) {
      if (event.type === 'SCORE_ADJUSTED' && primaryCommit && viewerPlayerId === sessionBefore.state.activePlayerId) continue
      return deny('A shared commander can only change their own player or army state.')
    }

    if (event.type === 'RULESET_EVENT') {
      if (event.payload.action === 'PRIMARY_COMMITTED') continue
      const target = rulesetPlayerId(event)
      if (target && target !== viewerPlayerId) {
        // Priority Target is intentionally chosen by the card owner's current Rival.
        if (isPriorityTargetRivalChoice(event)) continue
        if (progression && viewerPlayerId === sessionBefore.state.activePlayerId) continue
        return deny('This ruleset action belongs to another commander.')
      }
    }
  }

  return { allowed: true }
}

export function authorizeSharedMutation(
  sessionBefore: BattleSession,
  sessionAfter: BattleSession,
  membership: SharedMembership | null | undefined,
): SharedMutationDecision {
  const previousIds = new Set(sessionBefore.state.events.map((event) => event.id))
  const newEvents = sessionAfter.state.events.filter((event) => !previousIds.has(event.id))
  const groups = new Map<string, BattleEvent[]>()
  for (const event of newEvents) groups.set(event.actionId, [...(groups.get(event.actionId) ?? []), event])
  for (const events of groups.values()) {
    const decision = authorizeSharedAction(sessionBefore, events, membership)
    if (!decision.allowed) return decision
  }
  return { allowed: true }
}
