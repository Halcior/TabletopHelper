import type { UnitDefinition } from '../army/types'
import { dispatchBattleEvent, dispatchBattleEvents } from './engine'
import type {
  BattleEventInput,
  BattleSession,
  MissionActionLocationType,
  MissionActionState,
  MissionActionType,
} from './types'

export type MissionActionKnownCheck = {
  key: 'OC' | 'NOT_AIRCRAFT' | 'NOT_FORTIFICATION' | 'NOT_BATTLESHOCKED' | 'ON_BATTLEFIELD'
  label: string
  passed: boolean
}

export type MissionActionEligibility = {
  unitId: string
  unitName: string
  eligible: boolean
  knownChecks: MissionActionKnownCheck[]
  requiresPhysicalConfirmation: boolean
  blockingReason?: string
}

export type StartMissionActionInput = {
  playerId: string
  unitId: string
  type: MissionActionType
  name: string
  targetObjectiveId?: string
  locationType?: MissionActionLocationType
  linkedSecondaryCardId?: string
  unknownConditionsConfirmed: boolean
  id?: string
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getPlayerTurnNumber(session: BattleSession, playerId: string): number {
  return session.state.events.filter((event) => (
    event.type === 'TURN_STARTED' && event.payload.playerId === playerId
  )).length
}

export function getUnitDefinition(
  session: BattleSession,
  playerId: string,
  unitId: string,
): UnitDefinition | undefined {
  const armyId = session.setup.players.find((player) => player.id === playerId)?.armyId
  return armyId ? session.setup.armies[armyId]?.units.find((unit) => unit.id === unitId) : undefined
}

function hasKeyword(unit: UnitDefinition, keyword: string): boolean {
  const normalized = keyword.toLocaleUpperCase()
  return [...unit.categories, ...unit.keywords].some((value) => value.toLocaleUpperCase() === normalized)
}

export function getMissionActionEligibility(
  session: BattleSession,
  playerId: string,
  unitId: string,
): MissionActionEligibility {
  const unit = getUnitDefinition(session, playerId, unitId)
  const state = session.state.players[playerId]?.units[unitId]
  if (!unit || !state) {
    return {
      unitId,
      unitName: 'Unknown unit',
      eligible: false,
      knownChecks: [],
      requiresPhysicalConfirmation: true,
      blockingReason: 'The unit is not part of this player’s army.',
    }
  }

  const checks: MissionActionKnownCheck[] = [
    { key: 'OC', label: 'OC greater than 0', passed: (unit.stats?.objectiveControl ?? 0) > 0 },
    { key: 'NOT_AIRCRAFT', label: 'Not AIRCRAFT', passed: !hasKeyword(unit, 'AIRCRAFT') },
    { key: 'NOT_FORTIFICATION', label: 'Not FORTIFICATION', passed: !hasKeyword(unit, 'FORTIFICATION') },
    { key: 'NOT_BATTLESHOCKED', label: 'Not Battle-shocked', passed: !state.battleShocked },
    { key: 'ON_BATTLEFIELD', label: 'On the battlefield', passed: !state.destroyed && !state.inReserve },
  ]
  const activeAction = Object.values(session.state.missionActions).find((action) => (
    action.playerId === playerId && action.unitId === unitId && action.status === 'ACTIVE'
  ))
  const knownEligible = checks.every((check) => check.passed)
  return {
    unitId,
    unitName: unit.name,
    eligible: knownEligible && !activeAction,
    knownChecks: checks,
    requiresPhysicalConfirmation: true,
    blockingReason: activeAction
      ? `${unit.name} is already performing ${activeAction.name}.`
      : checks.find((check) => !check.passed)?.label,
  }
}

export function getEligibleMissionActionUnits(
  session: BattleSession,
  playerId: string,
): MissionActionEligibility[] {
  return Object.keys(session.state.players[playerId]?.units ?? {})
    .map((unitId) => getMissionActionEligibility(session, playerId, unitId))
    .filter((result) => result.eligible)
}

export function getEligibleSabotageObjectives(session: BattleSession, playerId: string) {
  const turnStart = [...session.state.snapshots.turnStart].reverse().find((snapshot) => (
    snapshot.round === session.state.round && snapshot.playerId === playerId
  ))
  if (!turnStart) return []
  return Object.values(session.state.objectives).filter((objective) => (
    objective.type === 'neutral'
    && turnStart?.objectiveStates[objective.id]?.controllerPlayerId !== playerId
  ))
}

export function getActiveMissionActionForUnit(
  session: BattleSession,
  playerId: string,
  unitId: string,
): MissionActionState | undefined {
  return Object.values(session.state.missionActions).find((action) => (
    action.playerId === playerId && action.unitId === unitId && action.status === 'ACTIVE'
  ))
}

export function getMissionActionRestrictionsForUnit(
  session: BattleSession,
  playerId: string,
  unitId: string,
): { actionName: string; cannotShoot: true; cannotCharge: true; reminder: string } | undefined {
  const action = getActiveMissionActionForUnit(session, playerId, unitId)
  return action ? {
    actionName: action.name,
    cannotShoot: true,
    cannotCharge: true,
    reminder: `${getUnitDefinition(session, playerId, unitId)?.name ?? 'This unit'} is performing ${action.name} and cannot Shoot or declare a Charge this turn.`,
  } : undefined
}

export function startMissionAction(session: BattleSession, input: StartMissionActionInput): BattleSession {
  if (session.state.activePlayerId !== input.playerId || session.state.phase !== 'MOVEMENT') {
    throw new Error('Mission Actions start at the end of the active player’s Movement phase.')
  }
  const eligibility = getMissionActionEligibility(session, input.playerId, input.unitId)
  if (!eligibility.eligible) throw new Error(eligibility.blockingReason ?? 'This unit cannot start a Mission Action.')
  if (!input.unknownConditionsConfirmed) {
    throw new Error('Confirm shooting eligibility, movement, engagement range, and required position.')
  }
  if (input.targetObjectiveId && !session.state.objectives[input.targetObjectiveId]) {
    throw new Error(`Unknown objective: ${input.targetObjectiveId}`)
  }
  if (
    input.type === 'SECURE_DATA'
    && (!input.targetObjectiveId || session.state.objectives[input.targetObjectiveId]?.type !== 'neutral')
  ) throw new Error('Secure Data requires a neutral objective target.')
  if (input.type === 'SECURE_DATA' && input.locationType !== 'NEUTRAL_OBJECTIVE') {
    throw new Error('Secure Data must be performed at its neutral objective.')
  }
  if (input.type === 'SCAN_SIGNAL' && input.locationType !== 'BATTLEFIELD_CENTRE') {
    throw new Error('Scanning Signal requires confirmation that the unit is near the battlefield centre.')
  }
  if (
    input.type === 'SABOTAGE'
    && (!input.targetObjectiveId || input.locationType !== 'NEUTRAL_OBJECTIVE')
  ) throw new Error('Sabotage requires a neutral objective target.')
  if (
    input.type === 'SABOTAGE'
    && !getEligibleSabotageObjectives(session, input.playerId).some((objective) => objective.id === input.targetObjectiveId)
  ) throw new Error('Sabotage requires an objective you did not control at the start of this turn.')
  const action: MissionActionState = {
    id: input.id ?? `mission-action-${createId()}`,
    playerId: input.playerId,
    unitId: input.unitId,
    type: input.type,
    name: input.name,
    targetObjectiveId: input.targetObjectiveId,
    locationType: input.locationType,
    startedRound: session.state.round,
    startedTurn: getPlayerTurnNumber(session, input.playerId),
    status: 'ACTIVE',
    linkedSecondaryCardId: input.linkedSecondaryCardId,
  }
  return dispatchBattleEvent(session, { type: 'MISSION_ACTION_STARTED', payload: { action } }, {
    actorPlayerId: input.playerId,
  })
}

function resolutionEvent(
  session: BattleSession,
  action: MissionActionState,
  positionConfirmed: boolean,
): BattleEventInput {
  const unit = session.state.players[action.playerId]?.units[action.unitId]
  const common = {
    actionId: action.id,
    endedRound: session.state.round,
    endedTurn: getPlayerTurnNumber(session, action.playerId),
  }
  if (!unit || unit.destroyed) {
    return { type: 'MISSION_ACTION_FAILED', payload: { ...common, reason: 'The acting unit was destroyed.' } }
  }
  if (unit.battleShocked) {
    return { type: 'MISSION_ACTION_FAILED', payload: { ...common, reason: 'The acting unit is Battle-shocked.' } }
  }
  if (!positionConfirmed) {
    return { type: 'MISSION_ACTION_FAILED', payload: { ...common, reason: 'The required position was not maintained.' } }
  }
  return { type: 'MISSION_ACTION_COMPLETED', payload: common }
}

export function completeMissionAction(
  session: BattleSession,
  actionId: string,
  positionConfirmed: boolean,
): BattleSession {
  const action = session.state.missionActions[actionId]
  if (!action || action.status !== 'ACTIVE') throw new Error('The Mission Action is not active.')
  if (session.state.phase !== 'END_TURN' || session.state.activePlayerId !== action.playerId) {
    throw new Error('Mission Actions resolve at the end of their player’s turn.')
  }
  return dispatchBattleEvent(session, resolutionEvent(session, action, positionConfirmed), {
    actorPlayerId: action.playerId,
  })
}

export function resolveMissionActionsAtEndTurn(
  session: BattleSession,
  playerId: string,
  positionConfirmations: Record<string, boolean>,
): BattleSession {
  if (session.state.phase !== 'END_TURN' || session.state.activePlayerId !== playerId) {
    throw new Error('Mission Actions resolve at the end of the active player’s turn.')
  }
  const active = Object.values(session.state.missionActions).filter((action) => (
    action.playerId === playerId && action.status === 'ACTIVE'
  ))
  if (active.length === 0) return session
  const inputs = active.map((action) => resolutionEvent(session, action, positionConfirmations[action.id] === true))
  return dispatchBattleEvents(session, inputs, { actorPlayerId: playerId })
}

export function cancelMissionAction(session: BattleSession, actionId: string, reason?: string): BattleSession {
  const action = session.state.missionActions[actionId]
  if (!action || action.status !== 'ACTIVE') throw new Error('The Mission Action is not active.')
  return dispatchBattleEvent(session, {
    type: 'MISSION_ACTION_CANCELLED',
    payload: {
      actionId,
      endedRound: session.state.round,
      endedTurn: getPlayerTurnNumber(session, action.playerId),
      reason,
    },
  }, { actorPlayerId: action.playerId })
}
