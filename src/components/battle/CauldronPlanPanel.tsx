import { useEffect, useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import {
  canChangeOperationalPlan,
  evaluateOperationalPlan,
  getCurrentRivalPlayerId,
  getOperationalPlanState,
  getOperationalPlanTargetOptions,
  getOperationalPlanTurnTarget,
  OPERATIONAL_PLAN_DEFINITIONS,
  OPERATIONAL_PLAN_IDS,
  type OperationalPlanId,
} from '../../rulesets/cauldronFFA3'
import { cauldronEvent } from '../../rulesets/cauldronFFA3/events'
import { useBattleStore } from '../../stores/battleStore'

export function CauldronPlanPanel({
  session,
  onChangePlan,
}: {
  session: BattleSession
  onChangePlan: (playerId: string, planId: OperationalPlanId) => void
}) {
  const playerId = session.state.activePlayerId
  const state = getOperationalPlanState(session, playerId)
  const evaluation = evaluateOperationalPlan(session, playerId)
  const availability = canChangeOperationalPlan(session, playerId)
  const rivalId = getCurrentRivalPlayerId(session, playerId)
  const target = getOperationalPlanTurnTarget(session, playerId)
  const targetOptions = getOperationalPlanTargetOptions(session, playerId)
  const dispatch = useBattleStore((store) => store.dispatch)
  const [selectedPlan, setSelectedPlan] = useState<OperationalPlanId>(state.planId)
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('')
  useEffect(() => setSelectedPlan(state.planId), [playerId, state.planId])
  useEffect(() => setSelectedObjectiveId(targetOptions[0]?.objectiveId ?? ''), [playerId, state.planId, session.state.round, targetOptions.length])
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
  const needsMarkedObjective = state.planId === 'DECYDUJACE_NATARCIE' || state.planId === 'TWIERDZA'
  const fallbackChoice = targetOptions.some((option) => option.fallbackClosestNeutral)

  function markObjective() {
    if (!selectedObjectiveId || target || session.state.phase !== 'COMMAND') return
    dispatch(cauldronEvent('PLAN_TURN_TARGET_MARKED', {
      playerId,
      planId: state.planId,
      round: session.state.round,
      objectiveId: selectedObjectiveId,
    }))
  }

  return (
    <section className="panel plan-panel">
      <div className="section-heading">
        <div><span className="eyebrow">Operational Plan · Rival {session.state.players[rivalId].name}</span><h2>{evaluation.name}</h2></div>
        <span className={`plan-status plan-status--${evaluation.status.toLowerCase()}`}>{evaluation.status.replace('_', ' ')}</span>
      </div>
      <p>{evaluation.description}</p>
      {evaluation.progress && <div className="plan-progress">
        <div><strong>{number.format(evaluation.progress.current)}</strong><span>/ {number.format(evaluation.progress.target)} {evaluation.progress.unit}</span></div>
        <progress max={evaluation.progress.target} value={Math.min(evaluation.progress.current, evaluation.progress.target)} />
        <small>{evaluation.status === 'COMPLETED'
          ? 'Target reached'
          : `${number.format(Math.max(0, evaluation.progress.target - evaluation.progress.current))} ${evaluation.progress.unit} needed`}</small>
      </div>}
      <p className="plan-reason">{evaluation.reason}</p>

      {needsMarkedObjective && session.state.phase === 'COMMAND' && !target && <div className="plan-change">
        <strong>Mark this turn&apos;s objective</strong>
        {targetOptions.length > 0 ? <div className="plan-change__controls">
          <select aria-label="Operational Plan objective" value={selectedObjectiveId} onChange={(event) => setSelectedObjectiveId(event.target.value)}>
            {targetOptions.map((option) => <option key={option.objectiveId} value={option.objectiveId}>{option.name}</option>)}
          </select>
          <button className="button--gold" disabled={!selectedObjectiveId} onClick={markObjective}>Mark objective</button>
        </div> : <p className="plan-change-unavailable">No valid objective can be marked from the Turn Start state.</p>}
        {fallbackChoice && <small>The Rival controlled no objective at Turn Start. Select the neutral objective physically closest to their deployment zone.</small>}
      </div>}
      {target && <p className="spent-note">Marked this turn: {session.state.objectives[target.objectiveId]?.name ?? target.objectiveId}.</p>}

      {!state.changed && session.state.phase === 'COMMAND' && (availability.available
        ? <details className="plan-change">
          <summary>Change plan <span>1 CP · once per battle</span></summary>
          <div className="plan-change__controls">
            <select aria-label="New Operational Plan" value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value as OperationalPlanId)}>
              {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
            </select>
            <button
              disabled={selectedPlan === state.planId}
              onClick={() => onChangePlan(playerId, selectedPlan)}
            >Confirm change · 1 CP</button>
          </div>
          <small>{availability.reason}</small>
        </details>
        : <p className="plan-change-unavailable">Plan change unavailable · {availability.reason}</p>)}
      {state.changed && <p className="spent-note">Plan change used in Round {state.changedRound}.</p>}
    </section>
  )
}
