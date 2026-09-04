import type { BattleSession } from '../../domain/battle/types'
import {
  evaluateOperationalPlan,
  getOperationalPlanState,
  getPrimaryAwardedInRound,
  getPrimaryTurnCommit,
  type PlanConfirmation,
} from '../../rulesets/cauldronFFA3'

export function EndRoundReview({
  session,
  onCancel,
  onConfirm,
}: {
  session: BattleSession
  onCancel: () => void
  onConfirm: (confirmations: Record<string, PlanConfirmation>) => void
}) {
  return (
    <main className="battle-content round-review">
      <div className="round-review__intro">
        <span className="eyebrow">End Battle Round {session.state.round}</span>
        <h1>Wyniszczenie review</h1>
        <p>Hotfix 2.1.1 already locked each player&apos;s objective Primary at the end of their own turn. Only Wyniszczenie is resolved here.</p>
      </div>
      <div className="round-review-grid">{session.state.turnOrder.map((playerId) => {
        const player = session.state.players[playerId]
        const turnCommit = getPrimaryTurnCommit(session, playerId, session.state.round)
        const planId = getOperationalPlanState(session, playerId).planId
        const evaluation = planId === 'WYNISZCZENIE'
          ? evaluateOperationalPlan(session, playerId, session.state.round)
          : null
        const pending = session.state.round >= 2 && evaluation?.status === 'COMPLETED'
        const currentRoundVp = getPrimaryAwardedInRound(session, playerId, session.state.round)
        const potentialTotal = Math.min(15, currentRoundVp + (pending ? 5 : 0))
        return <section className="panel primary-review-card" key={playerId}>
          <div className="primary-review-card__header"><div><span className="eyebrow">Zone {player.deploymentZone}</span><h2>{player.name}</h2></div><strong>{potentialTotal} VP</strong></div>
          <div className="primary-condition">
            <span className="condition-mark complete">✓</span>
            <span>Primary locked after own turn</span><strong>+{turnCommit?.pointsAwarded ?? 0}</strong>
          </div>
          {planId === 'WYNISZCZENIE' ? <div className="review-plan">
            <strong>Wyniszczenie</strong>
            <span className={`plan-status plan-status--${evaluation?.status.toLowerCase()}`}>{evaluation?.status.replace('_', ' ')}</span>
            <p>{evaluation?.reason}</p>
            {evaluation?.progress && <div className="review-plan-progress"><strong>{evaluation.progress.current}</strong><span> / {evaluation.progress.target} {evaluation.progress.unit}</span></div>}
            <div className="primary-condition"><span className={pending ? 'condition-mark complete' : 'condition-mark'}>{pending ? '✓' : '×'}</span><span>Deferred Plan VP</span><strong>+{pending ? 5 : 0}</strong></div>
          </div> : <p className="context-note">{getOperationalPlanState(session, playerId).planId.replaceAll('_', ' ')} was already resolved in this player&apos;s own end-turn review.</p>}
        </section>
      })}</div>
      <div className="review-actions">
        <button onClick={onCancel}>Back to battle</button>
        <button className="button--gold" onClick={() => onConfirm({})}>
          {session.state.round === session.state.maxRounds ? 'Confirm & end battle' : 'Confirm end round'}
        </button>
      </div>
    </main>
  )
}
