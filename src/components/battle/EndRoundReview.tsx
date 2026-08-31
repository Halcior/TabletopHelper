import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { buildPrimaryReview, type PlanConfirmation } from '../../rulesets/cauldronFFA3'

export function EndRoundReview({
  session,
  onCancel,
  onConfirm,
}: {
  session: BattleSession
  onCancel: () => void
  onConfirm: (confirmations: Record<string, PlanConfirmation>) => void
}) {
  const [confirmations, setConfirmations] = useState<Record<string, PlanConfirmation>>({})
  const reviews = buildPrimaryReview(session, confirmations)
  const requiresAnswers = session.state.round >= 2
    && reviews.some((review) => review.planEvaluation.status === 'REQUIRES_CONFIRMATION')

  function answer(playerId: string, key: keyof PlanConfirmation, value: boolean) {
    setConfirmations((current) => ({
      ...current,
      [playerId]: { ...current[playerId], [key]: value },
    }))
  }

  return (
    <main className="battle-content round-review">
      <div className="round-review__intro">
        <span className="eyebrow">End Battle Round {session.state.round}</span>
        <h1>Primary review</h1>
        <p>Correct objective control or casualty attribution before committing. Primary scoring is automatic after confirmation.</p>
      </div>
      <div className="round-review-grid">{reviews.map((review) => {
        const player = session.state.players[review.playerId]
        const question = review.planEvaluation.confirmation
        const currentAnswer = question ? confirmations[review.playerId]?.[question.key] : undefined
        return <section className="panel primary-review-card" key={review.playerId}>
          <div className="primary-review-card__header"><div><span className="eyebrow">Zone {player.deploymentZone}</span><h2>{player.name}</h2></div><strong>{review.roundPrimary} VP</strong></div>
          {[review.neutralObjective, review.twoObjectives, review.operationalPlan].map((condition) => <div className="primary-condition" key={condition.label}>
            <span className={condition.completed ? 'condition-mark complete' : 'condition-mark'}>{condition.completed ? '✓' : '×'}</span>
            <span>{condition.label}</span><strong>+{condition.vp}</strong>
          </div>)}
          <div className="review-plan"><strong>{review.planEvaluation.name}</strong><span className={`plan-status plan-status--${review.planEvaluation.status.toLowerCase()}`}>{review.planEvaluation.status.replace('_', ' ')}</span><p>{review.planEvaluation.reason}</p></div>
          {review.planEvaluation.progress && <div className="review-plan-progress">
            <strong>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(review.planEvaluation.progress.current)}</strong>
            <span> / {new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(review.planEvaluation.progress.target)} {review.planEvaluation.progress.unit}</span>
          </div>}
          {session.state.round >= 2 && question && <div className="confirmation-question">
            <strong>{question.prompt}</strong>
            <div><button className={currentAnswer === true ? 'selected' : ''} onClick={() => answer(review.playerId, question.key, true)}>Yes</button>
              <button className={currentAnswer === false ? 'selected' : ''} onClick={() => answer(review.playerId, question.key, false)}>No</button></div>
            <small>Battle-shocked units and AIRCRAFT do not qualify where applicable.</small>
          </div>}
        </section>
      })}</div>
      <div className="review-actions">
        <button onClick={onCancel}>Back to battle</button>
        <button className="button--gold" disabled={requiresAnswers} onClick={() => onConfirm(confirmations)}>
          {session.state.round === session.state.maxRounds ? 'Confirm & end battle' : 'Confirm end round'}
        </button>
      </div>
    </main>
  )
}
