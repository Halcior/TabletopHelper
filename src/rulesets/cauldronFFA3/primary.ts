import type { BattleSession } from '../../domain/battle/types'
import { CAULDRON_PRIMARY_CAP } from './constants'
import { evaluateOperationalPlan } from './operationalPlans'
import type { PlanConfirmation, PrimaryRoundResult } from './types'

export function calculatePrimaryRound(
  session: BattleSession,
  playerId: string,
  battleRound = session.state.round,
  confirmation: PlanConfirmation = {},
): PrimaryRoundResult {
  const planEvaluation = evaluateOperationalPlan(session, playerId, battleRound, confirmation)
  const controlsNeutral = Object.values(session.state.objectives).some((objective) => (
    objective.type === 'neutral' && objective.controllerPlayerId === playerId
  ))
  const controlsTwo = Object.values(session.state.objectives)
    .filter((objective) => objective.controllerPlayerId === playerId).length >= 2
  const planCompleted = planEvaluation.status === 'COMPLETED'
  const eligible = battleRound >= 2
  const rawScore = eligible
    ? Number(controlsNeutral) * 5 + Number(controlsTwo) * 5 + Number(planCompleted) * 5
    : 0
  const currentPrimary = session.state.players[playerId]?.score.primary ?? 0
  const roundPrimary = Math.max(0, Math.min(rawScore, CAULDRON_PRIMARY_CAP - currentPrimary))

  return {
    playerId,
    round: battleRound,
    neutralObjective: { completed: eligible && controlsNeutral, vp: eligible && controlsNeutral ? 5 : 0, label: 'Neutral objective' },
    twoObjectives: { completed: eligible && controlsTwo, vp: eligible && controlsTwo ? 5 : 0, label: 'Two objectives total' },
    operationalPlan: { completed: eligible && planCompleted, vp: eligible && planCompleted ? 5 : 0, label: 'Operational Plan' },
    planEvaluation,
    roundPrimary,
    capped: roundPrimary < rawScore,
  }
}

export function buildPrimaryReview(
  session: BattleSession,
  confirmations: Record<string, PlanConfirmation> = {},
): PrimaryRoundResult[] {
  return session.state.turnOrder.map((playerId) => calculatePrimaryRound(
    session,
    playerId,
    session.state.round,
    confirmations[playerId],
  ))
}
