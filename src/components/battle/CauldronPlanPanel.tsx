import { useEffect, useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import {
  canChangeOperationalPlan,
  evaluateOperationalPlan,
  getCurrentRivalPlayerId,
  getOperationalPlanState,
  OPERATIONAL_PLAN_DEFINITIONS,
  OPERATIONAL_PLAN_IDS,
  type OperationalPlanId,
} from '../../rulesets/cauldronFFA3'

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
  const [selectedPlan, setSelectedPlan] = useState<OperationalPlanId>(state.planId)
  useEffect(() => setSelectedPlan(state.planId), [playerId, state.planId])
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

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
      </div>}
      <p className="plan-reason">{evaluation.reason}</p>
      {!state.changed && session.state.phase === 'COMMAND' && <div className="plan-change">
        <div><strong>Once-per-battle plan change</strong><small>{availability.reason}</small></div>
        <select value={selectedPlan} onChange={(event) => setSelectedPlan(event.target.value as OperationalPlanId)}>
          {OPERATIONAL_PLAN_IDS.map((planId) => <option key={planId} value={planId}>{OPERATIONAL_PLAN_DEFINITIONS[planId].name}</option>)}
        </select>
        <button
          disabled={!availability.available || selectedPlan === state.planId}
          onClick={() => onChangePlan(playerId, selectedPlan)}
        >Change · 1 CP</button>
      </div>}
      {state.changed && <p className="spent-note">Plan change used in Round {state.changedRound}.</p>}
    </section>
  )
}
