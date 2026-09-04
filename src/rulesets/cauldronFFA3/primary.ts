import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import {
  CAULDRON_PRIMARY_CAP,
  CAULDRON_PRIMARY_ROUND_CAP,
} from './constants'
import { cauldronEvent, getCauldronEventData } from './events'
import { evaluateOperationalPlan, getOperationalPlanState } from './operationalPlans'
import type {
  DeferredWyniszczenieCommit,
  PlanConfirmation,
  PrimaryRoundResult,
  PrimaryTurnCommit,
} from './types'

export function getPrimaryTurnCommit(
  session: BattleSession,
  playerId: string,
  round = session.state.round,
): PrimaryTurnCommit | undefined {
  return getCauldronEventData<PrimaryTurnCommit>(session, 'PRIMARY_TURN_COMMITTED')
    .find((commit) => commit.playerId === playerId && commit.round === round)
}

export function getDeferredWyniszczenieCommit(
  session: BattleSession,
  playerId: string,
  round = session.state.round,
): DeferredWyniszczenieCommit | undefined {
  return getCauldronEventData<DeferredWyniszczenieCommit>(session, 'PRIMARY_WYNISZCZENIE_COMMITTED')
    .find((commit) => commit.playerId === playerId && commit.round === round)
}

export function getPrimaryAwardedInRound(
  session: BattleSession,
  playerId: string,
  round = session.state.round,
): number {
  const turn = getPrimaryTurnCommit(session, playerId, round)?.pointsAwarded ?? 0
  const deferred = getDeferredWyniszczenieCommit(session, playerId, round)?.pointsAwarded ?? 0
  return turn + deferred
}

export function calculatePrimaryRound(
  session: BattleSession,
  playerId: string,
  battleRound = session.state.round,
  confirmation: PlanConfirmation = {},
  includeDeferredWyniszczenie = true,
): PrimaryRoundResult {
  const planEvaluation = evaluateOperationalPlan(session, playerId, battleRound, confirmation)
  const controlsNeutral = Object.values(session.state.objectives).some((objective) => (
    objective.type === 'neutral' && objective.controllerPlayerId === playerId
  ))
  const controlsTwo = Object.values(session.state.objectives)
    .filter((objective) => objective.controllerPlayerId === playerId).length >= 2
  const isWyniszczenie = planEvaluation.planId === 'WYNISZCZENIE'
  const planCompleted = planEvaluation.status === 'COMPLETED'
    && (!isWyniszczenie || includeDeferredWyniszczenie)
  const eligible = battleRound >= 2
  const rawScore = eligible
    ? Number(controlsNeutral) * 5 + Number(controlsTwo) * 5 + Number(planCompleted) * 5
    : 0
  const currentPrimary = session.state.players[playerId]?.score.primary ?? 0
  const remainingGame = Math.max(0, CAULDRON_PRIMARY_CAP - currentPrimary)
  const remainingRound = Math.max(0, CAULDRON_PRIMARY_ROUND_CAP - getPrimaryAwardedInRound(session, playerId, battleRound))
  const roundPrimary = Math.max(0, Math.min(rawScore, remainingGame, remainingRound))

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

/** Hotfix 2.1.1 scoring window: objective Primary and non-Wyniszczenie Plans score at the end of this player's turn. */
export function buildPrimaryTurnReview(
  session: BattleSession,
  playerId: string,
  confirmation: PlanConfirmation = {},
): PrimaryRoundResult {
  return calculatePrimaryRound(session, playerId, session.state.round, confirmation, false)
}

/** Kept for diagnostics/history views; this no longer drives end-of-round objective scoring. */
export function buildPrimaryReview(
  session: BattleSession,
  confirmations: Record<string, PlanConfirmation> = {},
): PrimaryRoundResult[] {
  return session.state.turnOrder.map((playerId) => calculatePrimaryRound(
    session,
    playerId,
    session.state.round,
    confirmations[playerId],
    false,
  ))
}

export function createPrimaryTurnCommitEvents(
  session: BattleSession,
  playerId: string,
  confirmation: PlanConfirmation = {},
): BattleEventInput[] {
  if (session.state.activePlayerId !== playerId || session.state.phase !== 'END_TURN') {
    throw new Error('Primary is scored at the end of the active player’s turn.')
  }
  if (getPrimaryTurnCommit(session, playerId, session.state.round)) return []

  const review = buildPrimaryTurnReview(session, playerId, confirmation)
  const planId = getOperationalPlanState(session, playerId).planId
  if (
    session.state.round >= 2
    && planId !== 'WYNISZCZENIE'
    && review.planEvaluation.status === 'REQUIRES_CONFIRMATION'
  ) {
    throw new Error('Answer the required Operational Plan confirmation before ending the turn.')
  }

  const commit: PrimaryTurnCommit = {
    round: session.state.round,
    playerId,
    review,
    pointsAwarded: review.roundPrimary,
  }
  return [
    ...(review.roundPrimary > 0 ? [{
      type: 'SCORE_ADJUSTED' as const,
      payload: { playerId, category: 'primary' as const, delta: review.roundPrimary },
    }] : []),
    cauldronEvent('PRIMARY_TURN_COMMITTED', commit),
  ]
}

/** Wyniszczenie is the only Operational Plan intentionally deferred until all three turns in the round are finished. */
export function createDeferredWyniszczenieEvents(
  session: BattleSession,
): BattleEventInput[] {
  const events: BattleEventInput[] = []
  for (const playerId of session.state.turnOrder) {
    if (getOperationalPlanState(session, playerId).planId !== 'WYNISZCZENIE') continue
    if (getDeferredWyniszczenieCommit(session, playerId, session.state.round)) continue

    const evaluation = evaluateOperationalPlan(session, playerId, session.state.round)
    const completed = session.state.round >= 2 && evaluation.status === 'COMPLETED'
    const currentPrimary = session.state.players[playerId]?.score.primary ?? 0
    const remainingGame = Math.max(0, CAULDRON_PRIMARY_CAP - currentPrimary)
    const remainingRound = Math.max(0, CAULDRON_PRIMARY_ROUND_CAP - getPrimaryAwardedInRound(session, playerId, session.state.round))
    const pointsAwarded = completed ? Math.min(5, remainingGame, remainingRound) : 0

    if (pointsAwarded > 0) events.push({
      type: 'SCORE_ADJUSTED',
      payload: { playerId, category: 'primary', delta: pointsAwarded },
    })
    events.push(cauldronEvent('PRIMARY_WYNISZCZENIE_COMMITTED', {
      round: session.state.round,
      playerId,
      completed,
      pointsAwarded,
    } satisfies DeferredWyniszczenieCommit))
  }
  return events
}
