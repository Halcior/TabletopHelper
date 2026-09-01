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
import { getCauldronRoundStartSnapshot } from './snapshots'
import type { OperationalPlanId, PlanConfirmation, PlanEvaluation } from './types'

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
      progress.completed ? 'The current Rival casualty threshold was reached.' : 'The current Rival casualty threshold was not reached.',
      { progress: { current: progress.destroyedValue, target: progress.threshold, unit: 'pts' } },
    )
  }

  const snapshot = getCauldronRoundStartSnapshot(session, battleRound)
  if ((planId === 'DECYDUJACE_NATARCIE' || planId === 'TWIERDZA') && !snapshot) {
    return result(planId, 'INCOMPLETE', 'The automatic Round Start snapshot is unavailable.')
  }

  if (planId === 'DECYDUJACE_NATARCIE') {
    const rivalPlayerId = getCurrentRivalPlayerId(session, playerId, battleRound)
    const captured = Object.entries(snapshot?.objectiveStates ?? {}).some(([objectiveId, state]) => (
      state.controllerPlayerId === rivalPlayerId
      && session.state.objectives[objectiveId]?.controllerPlayerId === playerId
    ))
    return result(
      planId,
      captured ? 'COMPLETED' : 'INCOMPLETE',
      captured
        ? 'You now control an objective held by your Rival at the start of the round.'
        : 'No objective held by your Rival at Round Start is currently under your control.',
    )
  }

  if (planId === 'TWIERDZA') {
    const zone = getCauldronConfig(session).playerConfigs[playerId].deploymentZone
    const controlsHome = session.state.objectives[`${zone}-HOME`]?.controllerPlayerId === playerId
    const retainedNeutral = Object.entries(snapshot?.objectiveStates ?? {}).some(([objectiveId, state]) => (
      session.state.objectives[objectiveId]?.type === 'neutral'
      && state.controllerPlayerId === playerId
      && session.state.objectives[objectiveId]?.controllerPlayerId === playerId
    ))
    const completed = controlsHome && retainedNeutral
    return result(
      planId,
      completed ? 'COMPLETED' : 'INCOMPLETE',
      completed
        ? 'You control your HOME and a neutral objective retained from Round Start.'
        : 'You must control your HOME and a neutral objective you controlled at Round Start.',
    )
  }

  if (planId === 'ZWIAD_OPERACYJNY') {
    if (confirmation.zwiadHasThreeSectors === undefined) {
      return result(planId, 'REQUIRES_CONFIRMATION', 'Physical sector positions are not tracked.', {
        confirmation: {
          key: 'zwiadHasThreeSectors',
          prompt: 'Do you have qualifying OC>0 units in at least 3 battlefield sectors?',
        },
      })
    }
    if (!confirmation.zwiadHasThreeSectors) {
      return result(planId, 'INCOMPLETE', 'Fewer than three battlefield sectors contain qualifying units.')
    }
    if (confirmation.zwiadHasTwoOutsideDeployment === undefined) {
      return result(planId, 'REQUIRES_CONFIRMATION', 'The number outside your deployment zone is still required.', {
        confirmation: {
          key: 'zwiadHasTwoOutsideDeployment',
          prompt: 'Are at least 2 of those qualifying units outside your deployment zone?',
        },
      })
    }
    return result(
      planId,
      confirmation.zwiadHasTwoOutsideDeployment ? 'COMPLETED' : 'INCOMPLETE',
      confirmation.zwiadHasTwoOutsideDeployment
        ? 'Both guided physical-state confirmations were satisfied.'
        : 'Fewer than two qualifying units are outside your deployment zone.',
    )
  }

  if (confirmation.sabotageMissionActionCompleted === undefined) {
    return result(planId, 'REQUIRES_CONFIRMATION', 'Confirm the physical Mission Action during round review.', {
      confirmation: {
        key: 'sabotageMissionActionCompleted',
        prompt: 'Did you complete a Mission Action this Battle Round on a neutral objective that you did not control at the beginning of your turn?',
      },
    })
  }
  return result(
    planId,
    confirmation.sabotageMissionActionCompleted ? 'COMPLETED' : 'INCOMPLETE',
    confirmation.sabotageMissionActionCompleted
      ? 'The qualifying Mission Action was confirmed.'
      : 'The qualifying Mission Action was not completed.',
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
