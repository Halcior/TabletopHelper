import type { BattleEvent, BattleSession } from '../domain/battle/types'
import { doublesScorekeeperId, onSameDoublesForce } from '../domain/battle/doubles'
import { combatAttributionError } from '../domain/battle/combatAttribution'
import { validateBattlefieldGeometry } from '../domain/battlefield/layouts'
import { dispatchBattleEvents } from '../domain/battle/engine'
import type { BattleEventInput } from '../domain/battle/types'
import { calculateFfaRoundCpAward, FFA_ROUND_CP_ACTION, usesBalancedFfaCp } from '../rulesets/cauldronFFA3/ffaCp'
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
])

const AUTOMATIC_ELIMINATION_ACTIONS = new Set([
  'SECONDARY_COMPLETED',
  'SECONDARY_ELIMINATION_CHOICE_REQUIRED',
])

/**
 * A new FFA round can allocate CP to opponents, but only as part of the
 * single authoritative end-of-round action. Compare to the exact projected
 * post-scoring VP totals; never authorize arbitrary opponent CP edits.
 */
function isValidFfaRoundGrant(session: BattleSession, events: BattleEvent[]): boolean {
  if (!usesBalancedFfaCp(session)) return false
  const markerIndex = events.findIndex((event) => event.type === 'RULESET_EVENT'
    && event.payload.action === FFA_ROUND_CP_ACTION)
  if (markerIndex < 0 || !events.some((event) => event.type === 'ROUND_STARTED'
    && event.payload.round === session.state.round + 1)) return false
  if (session.state.activePlayerId !== session.state.turnOrder.at(-1)) return false
  if (events.filter((event) => event.type === 'RULESET_EVENT'
    && event.payload.action === FFA_ROUND_CP_ACTION).length !== 1) return false
  const awards = events.slice(markerIndex + 1)
  if (awards.length !== session.state.turnOrder.length
    || awards.some((event) => event.type !== 'CP_GAINED')) return false
  try {
    const projected = dispatchBattleEvents(session, events.slice(0, markerIndex)
      .map((event) => ({ type: event.type, payload: event.payload }) as BattleEventInput), { undoable: false })
    const expected = calculateFfaRoundCpAward(projected)
    const marker = events[markerIndex]
    if (marker.type !== 'RULESET_EVENT'
      || JSON.stringify(marker.payload.data) !== JSON.stringify(expected)) return false
    return session.state.turnOrder.every((id) => awards.some((event) => event.type === 'CP_GAINED'
      && event.payload.playerId === id && event.payload.amount === expected.grants[id]))
  } catch {
    return false
  }
}

function deny(reason: string): SharedMutationDecision {
  return { allowed: false, reason }
}

function playerScopedTarget(event: BattleEvent, session: BattleSession): string | null | undefined {
  switch (event.type) {
    case 'CP_GAINED':
    case 'CP_SPENT':
    case 'SCORE_ADJUSTED':
    case 'UNIT_COMBAT_RESOLVED':
    case 'UNIT_MODEL_DESTROYED':
    case 'UNIT_MODEL_RESTORED':
    case 'UNIT_WOUNDS_CHANGED':
    case 'UNIT_DESTROYED':
    case 'UNIT_BATTLESHOCK_CHANGED':
    case 'BATTLESHOCK_TEST_RESOLVED':
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

/** Hotfix 2.1.1: the marked Rival, not the card owner, nominates Alpha targets. */
function isPriorityAlphaRivalChoice(event: BattleEvent): boolean {
  if (event.type !== 'RULESET_EVENT' || event.payload.action !== 'SECONDARY_CARD_STATE_UPDATED') return false
  const data = event.payload.data
  if (!data || typeof data !== 'object') return false
  const patch = (data as { patch?: unknown }).patch
  return Boolean(patch && typeof patch === 'object' && 'priorityCandidateUnitIds' in patch)
}

function hasPrimaryCommit(events: BattleEvent[]): boolean {
  return events.some((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'PRIMARY_COMMITTED')
}

function automaticCasualtyBeneficiary(events: BattleEvent[], viewerPlayerId: string): string | undefined {
  for (const event of events) {
    if (event.type !== 'UNIT_COMBAT_RESOLVED' && event.type !== 'UNIT_MODEL_DESTROYED' && event.type !== 'UNIT_WOUNDS_CHANGED' && event.type !== 'UNIT_DESTROYED') continue
    if (event.payload.playerId !== viewerPlayerId) continue
    const beneficiary = event.payload.destroyedByPlayerId
    if (beneficiary && beneficiary !== viewerPlayerId) return beneficiary
  }
  return undefined
}

function isAutomaticCasualtyConsequence(event: BattleEvent, beneficiaryPlayerId: string | undefined): boolean {
  if (!beneficiaryPlayerId) return false
  if (event.type === 'SCORE_ADJUSTED') {
    return event.payload.playerId === beneficiaryPlayerId && event.payload.category === 'secondary'
  }
  return event.type === 'RULESET_EVENT'
    && AUTOMATIC_ELIMINATION_ACTIONS.has(event.payload.action)
    && rulesetPlayerId(event) === beneficiaryPlayerId
}

function currentUnitWounds(session: BattleSession, playerId: string, unitId: string): number | undefined {
  const state = session.state.players[playerId]?.units[unitId]
  if (!state) return undefined
  if (typeof state.woundsRemaining === 'number') return state.woundsRemaining
  const setupPlayer = session.setup.players.find((player) => player.id === playerId)
  const army = setupPlayer?.armyId ? session.setup.armies[setupPlayer.armyId] : undefined
  return army?.units.find((unit) => unit.id === unitId)?.stats?.wounds
}

/**
 * During their own turn a commander may record losses they just inflicted on an
 * opponent. This is deliberately narrower than general opponent-army editing:
 * restoring models, healing wounds, Battle-shock, abilities and other state
 * remain owned by that army's commander.
 */
function isActiveAttackerCasualty(
  event: BattleEvent,
  session: BattleSession,
  viewerPlayerId: string,
): boolean {
  if (doublesScorekeeperId(session.setup, viewerPlayerId) !== session.state.activePlayerId) return false
  if (event.type !== 'UNIT_COMBAT_RESOLVED' && event.type !== 'UNIT_MODEL_DESTROYED' && event.type !== 'UNIT_WOUNDS_CHANGED' && event.type !== 'UNIT_DESTROYED') return false
  if (event.type === 'UNIT_COMBAT_RESOLVED' && event.payload.kind !== 'damage') return false
  if (event.payload.playerId === viewerPlayerId || onSameDoublesForce(session.setup, event.payload.playerId, viewerPlayerId)) return false
  if (event.payload.destroyedByPlayerId !== viewerPlayerId) return false

  if (event.type === 'UNIT_WOUNDS_CHANGED') {
    const current = currentUnitWounds(session, event.payload.playerId, event.payload.unitId)
    return current !== undefined && event.payload.woundsRemaining < current
  }
  return true
}

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

  const progression = events.some((event) => TURN_OWNER_EVENTS.has(event.type))
  if (progression && doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) !== sessionBefore.state.activePlayerId) {
    const activeName = sessionBefore.state.players[sessionBefore.state.activePlayerId]?.name ?? 'the active player'
    return deny(`Only ${activeName} can advance the current turn.`)
  }

  if (events.some((event) => event.type === 'GAME_ABANDONED') && !membership.isHost) {
    return deny('Only the room host can abandon a shared battle.')
  }

  const gameEnded = events.some((event) => event.type === 'GAME_ENDED')
  const automaticFinalTurnEnd = gameEnded && progression && doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) === sessionBefore.state.activePlayerId
  if (gameEnded && !automaticFinalTurnEnd && !membership.isHost) {
    return deny('Only the room host can end a shared battle manually.')
  }

  // Core 08.02 is a single *paired* action. At each official Duel/Doubles
  // Command step, both opposing scorekeepers gain one CP simultaneously.
  // A normal shared participant may never use this exception to edit an enemy
  // CP value outside that exact one-off group.
  const config = sessionBefore.setup.rulesetConfig
  const officialDuel = Boolean(config && typeof config === 'object' && 'primaryDeck' in config
    && config.primaryDeck === 'chapter-approved-duel')
  const currentTurnIndex = sessionBefore.state.events.map((event) => event.type).lastIndexOf('TURN_STARTED')
  const alreadyGranted = sessionBefore.state.events.slice(currentTurnIndex + 1)
    .some((event) => event.type === 'CP_GAINED'
      && sessionBefore.state.turnOrder.includes(event.payload.playerId))
  const pairedCoreCp = officialDuel
    && sessionBefore.state.phase === 'COMMAND' && !alreadyGranted
    && doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) === sessionBefore.state.activePlayerId
    && events.length === sessionBefore.state.turnOrder.length
    && events.every((event) => event.type === 'CP_GAINED' && event.payload.amount === 1)
    && new Set(events.map((event) => event.type === 'CP_GAINED' ? event.payload.playerId : '')).size === sessionBefore.state.turnOrder.length
    && events.every((event) => event.type === 'CP_GAINED' && sessionBefore.state.turnOrder.includes(event.payload.playerId))

  const ffaRoundGrantPresent = events.some((event) => event.type === 'RULESET_EVENT'
    && event.payload.action === FFA_ROUND_CP_ACTION)
  const validFfaRoundGrant = ffaRoundGrantPresent && isValidFfaRoundGrant(sessionBefore, events)
  if (ffaRoundGrantPresent && !validFfaRoundGrant) {
    return deny('FFA CP grants must match the one-time round allocation and the committed VP standings.')
  }

  const primaryCommit = hasPrimaryCommit(events)
  const duelBattleReady = events.some((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'DUEL_BATTLE_READY')
  if (primaryCommit && doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) !== sessionBefore.state.activePlayerId) {
    return deny('Only the active commander can confirm end-of-round scoring.')
  }

  const automaticBeneficiary = automaticCasualtyBeneficiary(events, viewerPlayerId)

  for (const event of events) {
    const attributionError = combatAttributionError(sessionBefore.setup, event)
    if (attributionError) return deny(attributionError)
    if (event.type === 'BATTLEFIELD_LAYOUT_CHANGED') {
      if (!membership.isHost) return deny('Only the room host can edit battlefield geometry.')
      try { validateBattlefieldGeometry(sessionBefore.setup, event.payload.geometry) }
      catch (error) { return deny(error instanceof Error ? error.message : 'Invalid battlefield geometry.') }
      continue
    }
    if (event.type === 'GAME_STARTED' || event.type === 'GAME_ENDED' || event.type === 'GAME_ABANDONED') continue
    if (TURN_OWNER_EVENTS.has(event.type)) continue
    if (event.type === 'REACTION_WINDOW_RESOLVED') continue

    if (event.type === 'OBJECTIVE_CONTROL_CHANGED') continue

    if (event.type === 'STATE_CORRECTED') {
      if (!membership.isHost) return deny('Only the room host can apply state corrections.')
      continue
    }

    if (event.type === 'REACTION_HOLD_REQUESTED' || event.type === 'REACTION_HOLD_REFINED') {
      return deny('Manual HOLD has been retired. Use a Stratagem directly when its timing is valid.')
    }

    if (event.type === 'REACTION_WINDOW_CANCELLED') {
      const window = sessionBefore.state.timing.reactionWindows[event.payload.reactionWindowId]
      const requester = window?.requestedByPlayerId
      if (requester) {
        if (requester !== viewerPlayerId && !membership.isHost) return deny('The requester or host can close a legacy pause.')
      } else if (doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) !== sessionBefore.state.activePlayerId) {
        return deny('Only the active commander can cancel this reaction window.')
      }
      continue
    }

    if (isAutomaticCasualtyConsequence(event, automaticBeneficiary)) continue
    if (isActiveAttackerCasualty(event, sessionBefore, viewerPlayerId)) continue

    const targetPlayerId = playerScopedTarget(event, sessionBefore)
    if (targetPlayerId && targetPlayerId !== viewerPlayerId) {
      if (validFfaRoundGrant && event.type === 'CP_GAINED') continue
      if (pairedCoreCp && event.type === 'CP_GAINED') continue
      if (event.type === 'SCORE_ADJUSTED' && (primaryCommit || duelBattleReady) && doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) === sessionBefore.state.activePlayerId) continue
      if (onSameDoublesForce(sessionBefore.setup, viewerPlayerId, targetPlayerId)
        && (event.type === 'CP_GAINED' || event.type === 'CP_SPENT' || event.type === 'SCORE_ADJUSTED')) continue
      return deny('A shared commander can only change their own player or army state, except casualties they inflict during their own turn.')
    }

    if (event.type === 'RULESET_EVENT') {
      if (event.payload.action === 'PRIMARY_COMMITTED') continue
      if (event.payload.action === 'DUEL_BATTLE_READY' && doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) === sessionBefore.state.activePlayerId) continue
      const target = rulesetPlayerId(event)
      if (target && target !== viewerPlayerId) {
        if (isPriorityAlphaRivalChoice(event)) continue
        if (progression && doublesScorekeeperId(sessionBefore.setup, viewerPlayerId) === sessionBefore.state.activePlayerId) continue
        if (onSameDoublesForce(sessionBefore.setup, viewerPlayerId, target) && sessionBefore.state.turnOrder.includes(target)) continue
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
