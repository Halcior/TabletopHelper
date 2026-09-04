import { dispatchBattleEvents } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import {
  CAULDRON_PLAN_VP,
  OPERATIONAL_PLAN_DEFINITIONS,
  OPERATIONAL_PLAN_IDS,
} from './constants'
import { getWyniszczenieProgress } from './casualties'
import { cauldronEvent, getCauldronEventData } from './events'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { getCauldronConfig } from './sessionConfig'
import { getCauldronTurnStartSnapshot } from './snapshots'
import type {
  OperationalPlanId,
  OperationalPlanTurnTarget,
  PlanConfirmation,
  PlanEvaluation,
} from './types'

type PlanChangeEvent = {
  playerId: string
  previousPlanId: OperationalPlanId
  newPlanId: OperationalPlanId
  round: number
}

export type OperationalPlanState = {
  planId: OperationalPlanId
  changed: boolean
  changedRound?: number
}

export type OperationalPlanTargetOption = {
  objectiveId: string
  name: string
  fallbackClosestNeutral: boolean
}

export function getOperationalPlanState(session: BattleSession, playerId: string): OperationalPlanState {
  const initial = getCauldronConfig(session).playerConfigs[playerId]?.initialOperationalPlanId
  if (!initial) throw new Error(`Player ${playerId} has no Operational Plan.`)
  const changes = getCauldronEventData<PlanChangeEvent>(session, 'PLAN_CHANGED')
    .filter((change) => change.playerId === playerId)
  const latest = changes.at(-1)
  return {
    planId: latest?.newPlanId ?? initial,
    changed: changes.length > 0,
    changedRound: latest?.round,
  }
}

export function getOperationalPlanTurnTarget(
  session: BattleSession,
  playerId: string,
  round = session.state.round,
): OperationalPlanTurnTarget | undefined {
  return getCauldronEventData<OperationalPlanTurnTarget>(session, 'PLAN_TURN_TARGET_MARKED')
    .filter((target) => target.playerId === playerId && target.round === round)
    .at(-1)
}

export function getOperationalPlanTargetOptions(
  session: BattleSession,
  playerId: string,
  round = session.state.round,
): OperationalPlanTargetOption[] {
  const planId = getOperationalPlanState(session, playerId).planId
  if (planId !== 'DECYDUJACE_NATARCIE' && planId !== 'TWIERDZA') return []
  const snapshot = getCauldronTurnStartSnapshot(session, playerId, round)
  if (!snapshot) return []

  if (planId === 'TWIERDZA') {
    return Object.values(session.state.objectives)
      .filter((objective) => (
        objective.type === 'neutral'
        && snapshot.objectiveStates[objective.id]?.controllerPlayerId === playerId
      ))
      .map((objective) => ({ objectiveId: objective.id, name: objective.name, fallbackClosestNeutral: false }))
  }

  const rivalPlayerId = getCurrentRivalPlayerId(session, playerId, round)
  const rivalControlled = Object.values(session.state.objectives)
    .filter((objective) => snapshot.objectiveStates[objective.id]?.controllerPlayerId === rivalPlayerId)
  if (rivalControlled.length > 0) {
    return rivalControlled.map((objective) => ({
      objectiveId: objective.id,
      name: objective.name,
      fallbackClosestNeutral: false,
    }))
  }

  return Object.values(session.state.objectives)
    .filter((objective) => objective.type === 'neutral')
    .map((objective) => ({
      objectiveId: objective.id,
      name: objective.name,
      fallbackClosestNeutral: true,
    }))
}

export function markOperationalPlanObjective(
  session: BattleSession,
  playerId: string,
  objectiveId: string,
): BattleSession {
  if (session.state.activePlayerId !== playerId || session.state.phase !== 'COMMAND') {
    throw new Error('Operational Plan objectives are marked at the start of your own turn, during Command.')
  }
  const planId = getOperationalPlanState(session, playerId).planId
  if (planId !== 'DECYDUJACE_NATARCIE' && planId !== 'TWIERDZA') {
    throw new Error('The current Operational Plan does not mark an objective.')
  }
  if (getOperationalPlanTurnTarget(session, playerId)) {
    throw new Error('This Operational Plan objective has already been marked for the current turn.')
  }
  const option = getOperationalPlanTargetOptions(session, playerId).find((candidate) => candidate.objectiveId === objectiveId)
  if (!option) throw new Error('Select an objective eligible at the start of this turn.')
  return dispatchBattleEvents(session, [cauldronEvent('PLAN_TURN_TARGET_MARKED', {
    playerId,
    planId,
    round: session.state.round,
    objectiveId,
  } satisfies OperationalPlanTurnTarget)], { actorPlayerId: playerId })
}

function result(
  planId: OperationalPlanId,
  status: PlanEvaluation['status'],
  reason: string,
  additions: Pick<PlanEvaluation, 'progress' | 'confirmation'> = {},
): PlanEvaluation {
  return {
    planId,
    ...OPERATIONAL_PLAN_DEFINITIONS[planId],
    vp: CAULDRON_PLAN_VP,
    status,
    reason,
    ...additions,
  }
}

export function evaluateOperationalPlan(
  session: BattleSession,
  playerId: string,
  battleRound = session.state.round,
  confirmation: PlanConfirmation = {},
): PlanEvaluation {
  const planState = getOperationalPlanState(session, playerId)
  const planId = planState.planId
  if (planState.changedRound === battleRound) {
    return result(planId, 'INCOMPLETE', 'A newly changed Operational Plan cannot score in the same Battle Round.')
  }

  if (planId === 'WYNISZCZENIE') {
    const progress = getWyniszczenieProgress(session, playerId, battleRound)
    return result(
      planId,
      progress.completed ? 'COMPLETED' : 'INCOMPLETE',
      progress.completed
        ? 'The current Rival casualty threshold was reached. Wyniszczenie scores at the end of the Battle Round.'
        : 'The current Rival casualty threshold has not been reached. Wyniszczenie is checked at the end of the Battle Round.',
      { progress: { current: progress.destroyedValue, target: progress.threshold, unit: 'pts' } },
    )
  }

  const turnSnapshot = getCauldronTurnStartSnapshot(session, playerId, battleRound)
  if (!turnSnapshot) return result(planId, 'INCOMPLETE', 'The automatic Turn Start snapshot is unavailable.')

  if (planId === 'DECYDUJACE_NATARCIE') {
    const target = getOperationalPlanTurnTarget(session, playerId, battleRound)
    if (!target || target.planId !== planId) {
      return result(planId, 'INCOMPLETE', 'Mark the required objective at the start of your turn before resolving this Plan.')
    }
    const controlled = session.state.objectives[target.objectiveId]?.controllerPlayerId === playerId
    return result(
      planId,
      controlled ? 'COMPLETED' : 'INCOMPLETE',
      controlled
        ? `You control the marked objective ${target.objectiveId}.`
        : `Control the marked objective ${target.objectiveId} at the end of your turn.`,
    )
  }

  if (planId === 'TWIERDZA') {
    const target = getOperationalPlanTurnTarget(session, playerId, battleRound)
    if (!target || target.planId !== planId) {
      return result(planId, 'INCOMPLETE', 'Mark a neutral objective you control at the start of your turn.')
    }
    const zone = getCauldronConfig(session).playerConfigs[playerId].deploymentZone
    const controlsHome = session.state.objectives[`${zone}-HOME`]?.controllerPlayerId === playerId
    const controlsMarked = session.state.objectives[target.objectiveId]?.controllerPlayerId === playerId
    if (!controlsHome || !controlsMarked) {
      return result(planId, 'INCOMPLETE', 'Control your HOME and the marked neutral objective at the end of your turn.')
    }
    if (confirmation.twierdzaNoEnemyAtObjectives === undefined) {
      return result(planId, 'REQUIRES_CONFIRMATION', 'Enemy model ranges are not tracked automatically.', {
        confirmation: {
          key: 'twierdzaNoEnemyAtObjectives',
          prompt: 'Are there no enemy units in range of either your HOME or the marked neutral objective?',
        },
      })
    }
    return result(
      planId,
      confirmation.twierdzaNoEnemyAtObjectives ? 'COMPLETED' : 'INCOMPLETE',
      confirmation.twierdzaNoEnemyAtObjectives
        ? 'Both objectives are controlled and clear of enemy units.'
        : 'An enemy unit is in range of at least one required objective.',
    )
  }

  if (planId === 'ZWIAD_OPERACYJNY') {
    if (confirmation.zwiadHasFourSectors === undefined) {
      return result(planId, 'REQUIRES_CONFIRMATION', 'Physical sector positions are not tracked.', {
        confirmation: {
          key: 'zwiadHasFourSectors',
          prompt: 'Do you have qualifying OC>0 units in at least 4 battlefield sectors?',
        },
      })
    }
    if (!confirmation.zwiadHasFourSectors) {
      return result(planId, 'INCOMPLETE', 'Fewer than four battlefield sectors contain qualifying units.')
    }
    if (confirmation.zwiadHasThreeOutsideDeployment === undefined) {
      return result(planId, 'REQUIRES_CONFIRMATION', 'The number outside your deployment zone is still required.', {
        confirmation: {
          key: 'zwiadHasThreeOutsideDeployment',
          prompt: 'Are at least 3 qualifying units outside your deployment zone?',
        },
      })
    }
    return result(
      planId,
      confirmation.zwiadHasThreeOutsideDeployment ? 'COMPLETED' : 'INCOMPLETE',
      confirmation.zwiadHasThreeOutsideDeployment
        ? 'Four sectors and three units outside deployment were confirmed.'
        : 'Fewer than three qualifying units are outside your deployment zone.',
    )
  }

  const sabotageCompleted = Object.values(session.state.missionActions).some((action) => {
    if (
      action.playerId !== playerId
      || action.type !== 'SABOTAGE'
      || action.status !== 'COMPLETED'
      || action.endedRound !== battleRound
      || !action.targetObjectiveId
    ) return false
    const objective = session.state.objectives[action.targetObjectiveId]
    return objective?.type === 'neutral'
      && turnSnapshot.objectiveStates[action.targetObjectiveId]?.controllerPlayerId !== playerId
  })
  return result(
    planId,
    sabotageCompleted ? 'COMPLETED' : 'INCOMPLETE',
    sabotageCompleted
      ? 'The qualifying Sabotage Mission Action was completed.'
      : 'Complete Sabotage on a neutral objective you did not control at the start of your turn.',
  )
}

export function canChangeOperationalPlan(session: BattleSession, playerId: string): { available: boolean; reason: string } {
  if (session.state.activePlayerId !== playerId || session.state.phase !== 'COMMAND') {
    return { available: false, reason: 'Plan changes are only available during your own Command phase.' }
  }
  if (getOperationalPlanState(session, playerId).changed) {
    return { available: false, reason: 'This player has already changed their Operational Plan.' }
  }
  if (session.state.players[playerId]?.cp < 1) {
    return { available: false, reason: 'Changing plan requires 1 CP.' }
  }
  return { available: true, reason: 'Spend 1 CP to change plan. The new plan cannot score this round.' }
}

export function changeOperationalPlan(
  session: BattleSession,
  playerId: string,
  newPlanId: OperationalPlanId,
): BattleSession {
  if (!OPERATIONAL_PLAN_IDS.includes(newPlanId)) throw new Error('Unknown Cauldron Operational Plan.')
  const availability = canChangeOperationalPlan(session, playerId)
  if (!availability.available) throw new Error(availability.reason)
  const previousPlanId = getOperationalPlanState(session, playerId).planId
  if (previousPlanId === newPlanId) throw new Error('Select a different Operational Plan.')
  return dispatchBattleEvents(session, [
    { type: 'CP_SPENT', payload: { playerId, amount: 1 } },
    cauldronEvent('PLAN_CHANGED', {
      playerId,
      previousPlanId,
      newPlanId,
      round: session.state.round,
    } satisfies PlanChangeEvent),
  ], { actorPlayerId: playerId })
}
