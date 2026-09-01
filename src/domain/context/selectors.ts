import type { UnitDefinition } from '../army/types'
import { getActiveMissionActionForUnit, getPlayerTurnNumber, getUnitDefinition } from '../battle/missionActions'
import type { BattleSession, PlayerState } from '../battle/types'
import { getCurrentReactionWindow } from '../stratagems/battleIntegration'
import { getAvailableStratagems } from '../stratagems/timingEngine'
import type { StratagemAvailability, TimingTrigger } from '../stratagems/types'
import { CAULDRON_RULESET_ID, getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3'
import {
  getActiveSecondaryViews,
  getPendingEliminationChoice,
  getPriorityTargetCandidates,
  getSecondaryState,
} from '../../rulesets/cauldronFFA3/secondary'
import type { ActiveSecondaryView, SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import type {
  ActiveMissionActionContext,
  BattleContext,
  ContextRulesByPlayer,
  QuickObjectiveState,
  ReactionPlayerContext,
  RelevantEnemyUnit,
  RelevantStratagem,
} from './types'

export function selectActivePlayer(session: BattleSession): PlayerState {
  return session.state.players[session.state.activePlayerId]
}

export function selectCurrentRival(session: BattleSession, playerId = session.state.activePlayerId): PlayerState | null {
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return null
  const rivalId = getCurrentRivalPlayerId(session, playerId)
  return session.state.players[rivalId] ?? null
}

export function selectActiveSecondaries(session: BattleSession, playerId = session.state.activePlayerId): ActiveSecondaryView[] {
  return session.setup.rulesetId === CAULDRON_RULESET_ID
    ? getActiveSecondaryViews(session, playerId)
    : []
}

export function selectCurrentSecondaryProgress(
  session: BattleSession,
  secondaryId: SecondaryId,
  playerId = session.state.activePlayerId,
): ActiveSecondaryView | undefined {
  return selectActiveSecondaries(session, playerId).find((card) => card.cardId === secondaryId)
}

export function selectActiveMissionActions(
  session: BattleSession,
  playerId = session.state.activePlayerId,
): ActiveMissionActionContext[] {
  return Object.values(session.state.missionActions)
    .filter((action) => action.playerId === playerId && action.status === 'ACTIVE')
    .map((action) => ({
      ...action,
      unitName: getUnitDefinition(session, playerId, action.unitId)?.name ?? 'Unknown unit',
    }))
}

export function selectPendingReactionWindow(session: BattleSession) {
  return getCurrentReactionWindow(session)
}

export function selectQuickObjectiveState(session: BattleSession): QuickObjectiveState[] {
  return Object.values(session.state.objectives)
    .sort((left, right) => Number(left.type === 'home') - Number(right.type === 'home'))
    .map((objective) => ({
      id: objective.id,
      name: objective.name,
      type: objective.type,
      controllerPlayerId: objective.controllerPlayerId,
      controllerName: objective.controllerPlayerId
        ? session.state.players[objective.controllerPlayerId]?.name ?? 'Unknown player'
        : 'None',
    }))
}

function normalizedTraits(unit: UnitDefinition): string[] {
  return [...unit.categories, ...unit.keywords].map((value) => value.toLocaleUpperCase())
}

function matchesSecondary(unit: UnitDefinition, secondaryId?: SecondaryId): boolean {
  const traits = normalizedTraits(unit)
  if (secondaryId === 'ZNISZCZ_KOLOSA') return traits.includes('VEHICLE') || traits.includes('MONSTER')
  if (secondaryId === 'ELIMINACJA_DOWODCY') return traits.includes('CHARACTER')
  return true
}

export function selectRelevantEnemyUnits(
  session: BattleSession,
  secondaryId?: SecondaryId,
  playerId = session.state.activePlayerId,
): RelevantEnemyUnit[] {
  const rival = selectCurrentRival(session, playerId)
  if (!rival?.armyId) return []
  const army = session.setup.armies[rival.armyId]
  if (!army) return []
  const eligiblePriorityIds = secondaryId === 'CEL_PRIORYTETOWY'
    ? new Set(getPriorityTargetCandidates(session, playerId).filter((candidate) => candidate.eligible).map((candidate) => candidate.unitId))
    : null
  return army.units.flatMap((unit) => {
    const state = rival.units[unit.id]
    const relevant = state
      && !state.destroyed
      && matchesSecondary(unit, secondaryId)
      && (!eligiblePriorityIds || eligiblePriorityIds.has(unit.id))
    return relevant ? [{ playerId: rival.id, playerName: rival.name, unit, state }] : []
  })
}

function definitionMatchesPhase(definition: { phases: readonly string[] }, phase: string): boolean {
  return definition.phases.includes('ANY') || definition.phases.includes(phase)
}

function evaluateAcrossTriggers(input: {
  session: BattleSession
  playerId: string
  definition: RelevantStratagem['definition']
}): StratagemAvailability {
  const triggers = input.definition.triggers.length > 0
    ? input.definition.triggers
    : ['CUSTOM_CONFIRMATION' as TimingTrigger]
  const evaluations = triggers.flatMap((trigger) => getAvailableStratagems({
    playerId: input.playerId,
    gameState: input.session.state,
    trigger,
    definitions: [input.definition],
  }))
  const usable = evaluations.find((evaluation) => evaluation.canUse)
  if (usable) return usable
  return evaluations[0] ?? {
    definition: input.definition,
    canUse: false,
    reasons: ['Timing requires player confirmation.'],
  }
}

export function selectRelevantStratagems(
  session: BattleSession,
  rulesDataByPlayer: ContextRulesByPlayer = {},
  playerId = session.state.activePlayerId,
): RelevantStratagem[] {
  return (rulesDataByPlayer[playerId]?.stratagems ?? []).flatMap((record) => {
    if (record.classification === 'REACTION' || !definitionMatchesPhase(record.definition, session.state.phase)) return []
    return [{
      definition: record.definition,
      classification: record.classification,
      manualConfirmationRequired: record.manualConfirmationRequired,
      availability: evaluateAcrossTriggers({ session, playerId, definition: record.definition }),
    }]
  })
}

export function selectReactionPlayers(
  session: BattleSession,
  rulesDataByPlayer: ContextRulesByPlayer = {},
): ReactionPlayerContext[] {
  const activePlayerId = session.state.activePlayerId
  const window = selectPendingReactionWindow(session)
  return session.state.turnOrder.filter((playerId) => playerId !== activePlayerId).map((playerId) => {
    const records = (rulesDataByPlayer[playerId]?.stratagems ?? []).filter((record) => (
      record.classification !== 'ACTIVE'
      && definitionMatchesPhase(record.definition, session.state.phase)
      && session.state.players[playerId].cp >= record.definition.cpCost
    ))
    return {
      playerId,
      playerName: session.state.players[playerId].name,
      exactCount: records.filter((record) => !record.manualConfirmationRequired).length,
      potentialCount: records.filter((record) => record.manualConfirmationRequired).length,
      pending: window?.responses[playerId]?.status === 'PENDING',
    }
  })
}

export function selectCommandPointRecordedThisTurn(session: BattleSession): boolean {
  let turnStartIndex = -1
  for (let index = session.state.events.length - 1; index >= 0; index -= 1) {
    if (session.state.events[index].type === 'TURN_STARTED') {
      turnStartIndex = index
      break
    }
  }
  return session.state.events.slice(turnStartIndex + 1).some((event) => (
    event.type === 'CP_GAINED' && event.payload.playerId === session.state.activePlayerId
  ))
}

export function selectSecondaryBlockers(session: BattleSession, playerId = session.state.activePlayerId) {
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return []
  const blockers: Array<{ id: string; secondaryId?: SecondaryId; title: string; description: string }> = []
  const choice = getPendingEliminationChoice(session, playerId)
  if (choice) blockers.push({
    id: `elimination-choice-${choice.killEventId}`,
    title: 'Choose one elimination Secondary',
    description: `${choice.destroyedUnitName} can complete multiple cards.`,
  })
  const priority = getSecondaryState(session)[playerId]?.active.find((card) => (
    card.cardId === 'CEL_PRIORYTETOWY'
    && !card.cardSpecificState?.priorityTargetUnitId
    && !card.cardSpecificState?.deadlineFailed
  ))
  if (priority) blockers.push({
    id: 'priority-target-selection',
    secondaryId: 'CEL_PRIORYTETOWY',
    title: 'Priority Target selection required',
    description: priority.cardSpecificState?.priorityCandidateUnitIds?.length === 2
      ? 'The current Rival must choose one of the two candidates.'
      : 'Choose two eligible current Rival units.',
  })
  return blockers
}

export function selectBlockingDecisions(context: Pick<BattleContext, 'blockingItems'>) {
  return context.blockingItems
}

export function selectCompletedSecondariesThisTurn(session: BattleSession, playerId = session.state.activePlayerId) {
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return []
  const turn = getPlayerTurnNumber(session, playerId)
  return getSecondaryState(session)[playerId]?.completed.filter((card) => (
    card.completedRound === session.state.round && card.completedTurn === turn
  )) ?? []
}

export function selectMissionActionForUnit(session: BattleSession, playerId: string, unitId: string) {
  return getActiveMissionActionForUnit(session, playerId, unitId)
}
