import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import type { BattleSession } from '../../domain/battle/types'
import {
  buildCauldronTurnSummary,
  buildPrimaryTurnReview,
  getOperationalPlanState,
  getPrimaryTurnCommit,
} from '../../rulesets/cauldronFFA3'
import { getEndTurnReview, getSecondaryState } from '../../rulesets/cauldronFFA3/secondary'
import type { EndTurnSecondaryConfirmations, SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'

type SecondaryEndTurnReviewProps = {
  session: BattleSession
  onCompleteMissionAction: (actionId: string, positionConfirmed: boolean) => void
  onEvaluate: (playerId: string, confirmations: EndTurnSecondaryConfirmations) => void
  onDiscard: (playerId: string, cardIds: SecondaryId[]) => void
  onFinish: () => void
  onCancel: () => void
}

export function SecondaryEndTurnReview({
  session,
  onCompleteMissionAction,
  onEvaluate,
  onDiscard,
  onFinish,
  onCancel,
}: SecondaryEndTurnReviewProps) {
  const playerId = session.state.activePlayerId
  const player = session.state.players[playerId]
  const activeCards = getSecondaryState(session)[playerId].active
  const activeIds = new Set(activeCards.map((card) => card.cardId))
  const planId = getOperationalPlanState(session, playerId).planId
  const [evaluated, setEvaluated] = useState(false)
  const [missionPositions, setMissionPositions] = useState<Record<string, boolean>>({})
  const [confirmations, setConfirmations] = useState<EndTurnSecondaryConfirmations>({
    centreOcByPlayer: Object.fromEntries(session.state.turnOrder.map((id) => [id, 0])),
    behindEnemyLinesUnitCount: 0,
    zwiadHasFourSectors: false,
    zwiadHasTwoOutsideDeployment: false,
    twierdzaNoEnemyAtObjectives: false,
  })
  const [discardIds, setDiscardIds] = useState<SecondaryId[]>([])
  const review = getEndTurnReview(session, playerId)
  const primaryCommit = getPrimaryTurnCommit(session, playerId, session.state.round)
  const primaryPreview = primaryCommit?.review ?? buildPrimaryTurnReview(session, playerId, confirmations)
  const turnSummary = buildCauldronTurnSummary(session, playerId)
  const activeActions = Object.values(session.state.missionActions).filter((action) => (
    action.playerId === playerId && action.status === 'ACTIVE'
  ))
  const activePlayerIndex = session.state.turnOrder.indexOf(playerId)
  const lastTurnOfRound = activePlayerIndex === session.state.turnOrder.length - 1
  const nextPlayerId = session.state.turnOrder[(activePlayerIndex + 1) % session.state.turnOrder.length]
  const nextPlayer = session.state.players[nextPlayerId]
  const nextPlayerIndex = session.state.turnOrder.indexOf(nextPlayerId)
  const finishLabel = lastTurnOfRound
    ? 'Continue to Battle Round review'
    : `End turn → ${nextPlayer?.name ?? 'next player'}`

  function setConfirmation<Key extends keyof EndTurnSecondaryConfirmations>(key: Key, value: EndTurnSecondaryConfirmations[Key]) {
    setConfirmations((current) => ({ ...current, [key]: value }))
  }

  function adjustCentreOc(targetPlayerId: string, delta: number) {
    setConfirmations((current) => ({
      ...current,
      centreOcByPlayer: {
        ...current.centreOcByPlayer,
        [targetPlayerId]: Math.max(0, (current.centreOcByPlayer?.[targetPlayerId] ?? 0) + delta),
      },
    }))
  }

  function adjustBehindEnemyLines(delta: number) {
    setConfirmations((current) => ({
      ...current,
      behindEnemyLinesUnitCount: Math.max(0, Math.min(2, (current.behindEnemyLinesUnitCount ?? 0) + delta)),
    }))
  }

  function evaluate() {
    for (const action of activeActions) onCompleteMissionAction(action.id, missionPositions[action.id] === true)
    onEvaluate(playerId, confirmations)
    setEvaluated(true)
  }

  function toggleDiscard(cardId: SecondaryId) {
    setDiscardIds((current) => current.includes(cardId)
      ? current.filter((id) => id !== cardId)
      : [...current, cardId])
  }

  function finish() {
    if (discardIds.length > 0) onDiscard(playerId, discardIds)
    onFinish()
  }

  return <main className="battle-content secondary-turn-review">
    <div className="round-review__intro"><span className="eyebrow">{player.name}</span><h1>End Turn Review</h1><p>Resolve Mission Actions, Secondary scoring and your own Primary before advancing to the next player.</p></div>

    {!evaluated && <>
      {activeActions.length > 0 && <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Mission Actions</span><h2>Confirm final position</h2></div></div>
        {activeActions.map((action) => <label className="review-check-row" key={action.id}>
          <input type="checkbox" checked={missionPositions[action.id] ?? false} onChange={(event) => setMissionPositions((current) => ({ ...current, [action.id]: event.target.checked }))} />
          <span><strong>{action.name}</strong><small>Unit remains eligible and in the required position.</small></span>
        </label>)}
      </section>}

      {activeIds.has('DOMINACJA_CENTRUM') && <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Dominacja Centrum</span><h2>Centre OC</h2></div></div>
        {session.state.turnOrder.map((id) => <div className="centre-oc-row" key={id}><span>{session.state.players[id].name}</span><div className="stepper"><button onClick={() => adjustCentreOc(id, -1)}>−</button><strong>{confirmations.centreOcByPlayer?.[id] ?? 0} OC</strong><button onClick={() => adjustCentreOc(id, 1)}>+</button></div></div>)}
      </section>}

      <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Secondary physical conditions</span><h2>Quick confirmation</h2></div></div>
        {activeIds.has('ZA_LINIAMI_WROGA') && <div className="centre-oc-row">
          <span><strong>Za Liniami Wroga</strong><small>Units wholly inside the current Rival deployment zone.</small></span>
          <div className="stepper"><button onClick={() => adjustBehindEnemyLines(-1)}>−</button><strong>{confirmations.behindEnemyLinesUnitCount ?? 0}</strong><button onClick={() => adjustBehindEnemyLines(1)}>+</button></div>
        </div>}
        {activeIds.has('SZEROKI_FRONT') && <>
          <ConfirmationRow label="OC>0 units are in at least four battlefield sectors." checked={confirmations.wideFrontFourSectors ?? false} onChange={(value) => setConfirmation('wideFrontFourSectors', value)} />
          <ConfirmationRow label="At least three qualifying units are outside your deployment zone." checked={confirmations.wideFrontThreeOutsideDeployment ?? false} onChange={(value) => setConfirmation('wideFrontThreeOutsideDeployment', value)} />
        </>}
        {activeIds.has('UTRZYMAJ_BAZE') && <ConfirmationRow label="No enemy unit is inside your deployment zone." checked={confirmations.noEnemyInOwnDeployment ?? false} onChange={(value) => setConfirmation('noEnemyInOwnDeployment', value)} />}
        {activeIds.has('ODCIECIE_ODWROTU') && <>
          <ConfirmationRow label="You control a qualifying neutral objective closest to the Rival deployment zone." checked={confirmations.controlsClosestNeutralObjective ?? false} onChange={(value) => setConfirmation('controlsClosestNeutralObjective', value)} />
          <ConfirmationRow label="An OC>0 unit is within 9″ of the Rival deployment zone." checked={confirmations.unitNearRivalDeployment ?? false} onChange={(value) => setConfirmation('unitNearRivalDeployment', value)} />
        </>}
        {!['DOMINACJA_CENTRUM', 'ZA_LINIAMI_WROGA', 'SZEROKI_FRONT', 'UTRZYMAJ_BAZE', 'ODCIECIE_ODWROTU'].some((id) => activeIds.has(id as SecondaryId)) && <p className="context-note">No additional Secondary physical-state confirmation is required.</p>}
      </section>

      {(planId === 'ZWIAD_OPERACYJNY' || planId === 'TWIERDZA') && session.state.round >= 2 && <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Operational Plan</span><h2>{primaryPreview.planEvaluation.name}</h2></div><strong>up to +5 VP</strong></div>
        {planId === 'ZWIAD_OPERACYJNY' && <>
          <ConfirmationRow label="Non-AIRCRAFT OC>0 units are in at least four different sectors; each unit counts once." checked={confirmations.zwiadHasFourSectors ?? false} onChange={(value) => setConfirmation('zwiadHasFourSectors', value)} />
          <ConfirmationRow label="At least two of those qualifying units are outside your deployment zone." checked={confirmations.zwiadHasTwoOutsideDeployment ?? false} onChange={(value) => setConfirmation('zwiadHasTwoOutsideDeployment', value)} />
        </>}
        {planId === 'TWIERDZA' && <ConfirmationRow label="No enemy OC>0 unit is in range of your HOME or within 6″ of the marked neutral objective. Battle-shocked units do not block this." checked={confirmations.twierdzaNoEnemyAtObjectives ?? false} onChange={(value) => setConfirmation('twierdzaNoEnemyAtObjectives', value)} />}
      </section>}

      <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Primary · Balance patch 2.1.2</span><h2>Score at the end of your turn</h2></div><strong>{primaryPreview.roundPrimary} VP</strong></div>
        {[primaryPreview.neutralObjective, primaryPreview.twoObjectives, primaryPreview.operationalPlan].map((condition) => <div className="primary-condition" key={condition.label}>
          <span className={condition.completed ? 'condition-mark complete' : 'condition-mark'}>{condition.completed ? '✓' : '×'}</span>
          <span>{condition.label}</span><strong>+{condition.vp}</strong>
        </div>)}
        {planId === 'WYNISZCZENIE' && <p className="context-note">Wyniszczenie is intentionally not included here. It is checked after every player finishes the Battle Round.</p>}
      </section>

      <div className="review-actions"><button onClick={onCancel}>Back to turn</button><button className="button--gold" onClick={evaluate}>Apply scoring</button></div>
    </>}

    {evaluated && <>
      <section className={`panel turn-handoff-summary turn-handoff-summary--player-${activePlayerIndex}`} aria-label="Turn summary">
        <div className="turn-handoff-summary__heading">
          <div className="turn-handoff-summary__identity">
            <span className="turn-handoff-summary__marker" aria-hidden="true">{player.name.trim().charAt(0).toUpperCase()}</span>
            <div><span className="eyebrow">Turn complete</span><h2>{player.name} · Round {session.state.round}</h2><p>Everything recorded this turn is collected here before control passes on.</p></div>
          </div>
          <div className="turn-handoff-summary__score"><span>{turnSummary.scoreBefore} VP</span><b>→</b><strong>{turnSummary.scoreAfter} VP</strong><small>+{turnSummary.pointsGained} this turn</small></div>
        </div>
        <div className="turn-handoff-summary__stats">
          <div><span>Primary</span><strong>+{turnSummary.primaryGained} VP</strong><small>{primaryCommit?.review.operationalPlan.completed ? 'Operational Plan scored' : 'End-turn scoring'}</small></div>
          <div><span>Secondary</span><strong>+{turnSummary.secondaryGained} VP</strong><small>{turnSummary.completedSecondaries.length} completed</small></div>
          <div><span>Enemy units destroyed</span><strong>{turnSummary.kills.length}</strong><small>Kills credited to {player.name}</small></div>
        </div>
        {(turnSummary.completedSecondaries.length > 0 || turnSummary.kills.length > 0) && <details className="turn-handoff-summary__details">
          <summary><span>Recorded this turn</span><strong>{turnSummary.completedSecondaries.length} missions · {turnSummary.kills.length} destroyed</strong></summary>
          {turnSummary.completedSecondaries.length > 0 && <div className="turn-handoff-summary__list">
            <span className="eyebrow">Completed Secondaries</span>
            {turnSummary.completedSecondaries.map((entry, index) => <div className="turn-handoff-summary__row" key={`${entry.cardId}-${index}`}><span>✓ {entry.name}</span><strong>+{entry.pointsAwarded} VP</strong></div>)}
          </div>}
          {turnSummary.kills.length > 0 && <div className="turn-handoff-summary__list">
            <span className="eyebrow">Destroyed this turn</span>
            {turnSummary.kills.map((kill) => <div className="turn-handoff-summary__row" key={`${kill.victimPlayerId}-${kill.unitId}`}><span>{kill.unitName}<small>{kill.victimPlayerName}</small></span><strong>Destroyed</strong></div>)}
          </div>}
        </details>}
      </section>

      <details className="panel turn-review-details">
        <summary>
          <span><span className="eyebrow">Optional details</span><strong>Scoring and Mission Action audit</strong></span>
          <small>Primary +{turnSummary.primaryGained} · Secondary +{turnSummary.secondaryGained}</small>
        </summary>
        <div className="turn-review-details__body">
          <section className="turn-review-details__group">
            <div className="section-heading"><div><span className="eyebrow">Resolved</span><h2>Primary</h2></div></div>
            <div className="review-result review-result--completed"><span>✓</span><div><strong>End-turn Primary committed</strong><small>Round {session.state.round} · this score will not be recalculated after later players move.</small></div><strong>+{primaryCommit?.pointsAwarded ?? primaryPreview.roundPrimary} VP</strong></div>
            {planId === 'WYNISZCZENIE' && <p className="context-note">Wyniszczenie remains pending until the end of the Battle Round.</p>}
          </section>
          <section className="turn-review-details__group">
            <div className="section-heading"><div><span className="eyebrow">Resolved</span><h2>Mission Actions</h2></div></div>
            {review.missionActions.length === 0
              ? <p className="context-note">No Mission Actions this turn.</p>
              : review.missionActions.map((action) => <div className={`review-result review-result--${action.status.toLowerCase()}`} key={`${action.name}-${action.unitName}`}><span>{action.status === 'COMPLETED' ? '✓' : action.status === 'FAILED' ? '✕' : '○'}</span><div><strong>{action.name}</strong><small>{action.unitName} · {action.detail}</small></div></div>)}
          </section>
          <section className="turn-review-details__group">
            <div className="section-heading"><div><span className="eyebrow">Secondary</span><h2>{review.roundSecondaryVp} / {review.roundCap} VP this round</h2></div><strong>{review.gameSecondaryVp} / {review.gameCap}</strong></div>
            {turnSummary.completedSecondaries.map((entry, index) => <div className="review-result review-result--completed" key={`${entry.cardId}-${index}`}><span>✓</span><div><strong>{entry.name}</strong><small>Completed this turn</small></div><strong>+{entry.pointsAwarded} VP</strong></div>)}
            {turnSummary.completedSecondaries.length === 0 && <p className="context-note">No Secondary was completed this turn.</p>}
          </section>
        </div>
      </details>
      {review.incompleteCards.length > 0 && <section className="panel turn-review-section turn-review-carryover">
        <div className="section-heading"><div><span className="eyebrow">Incomplete cards</span><h2>Choose what carries over</h2></div></div>
        {review.incompleteCards.map((card) => {
            const discarding = discardIds.includes(card.cardId)
            return <div className={`discard-choice${discarding ? ' discard-choice--discarding' : ''}`} key={card.cardId}>
              <div><strong>{card.name}</strong><small>{discarding ? 'Will be discarded at the end of this review.' : 'Will remain active for your next turn.'}</small></div>
              <button
                aria-pressed={discarding}
                className={discarding ? 'button--danger' : ''}
                onClick={() => toggleDiscard(card.cardId)}
              >{discarding ? 'Keep card' : 'Discard card'}</button>
            </div>
          })}
      </section>}
      <div className={`turn-handoff-next turn-handoff-next--player-${nextPlayerIndex}`}>
        <span className="turn-handoff-next__icon"><AppIcon name={lastTurnOfRound ? 'objectives' : 'next'} /></span>
        <span><span className="eyebrow">Next command</span><strong>{lastTurnOfRound ? `Finish Round ${session.state.round}` : `${nextPlayer?.name ?? 'Next player'} · Command phase`}</strong><small>{lastTurnOfRound ? 'Resolve deferred end-of-round effects before the next Battle Round.' : 'The next commander will immediately see their newly drawn Secondary cards.'}</small></span>
      </div>
      <div className="review-actions review-actions--final"><button className="button--gold" onClick={finish}><span>{finishLabel}</span><AppIcon name="next" /></button></div>
    </>}
  </main>
}

function ConfirmationRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="review-check-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>
}
