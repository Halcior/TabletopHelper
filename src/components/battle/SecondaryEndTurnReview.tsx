import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
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
  const [evaluated, setEvaluated] = useState(false)
  const [historyStart] = useState(() => getSecondaryState(session)[playerId].scoreHistory.length)
  const [missionPositions, setMissionPositions] = useState<Record<string, boolean>>({})
  const [confirmations, setConfirmations] = useState<EndTurnSecondaryConfirmations>({
    centreOcByPlayer: Object.fromEntries(session.state.turnOrder.map((id) => [id, 0])),
  })
  const [discardIds, setDiscardIds] = useState<SecondaryId[]>([])
  const review = getEndTurnReview(session, playerId)
  const newScores = getSecondaryState(session)[playerId].scoreHistory.slice(historyStart)
  const activeActions = Object.values(session.state.missionActions).filter((action) => (
    action.playerId === playerId && action.status === 'ACTIVE'
  ))

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
    <div className="round-review__intro"><span className="eyebrow">{player.name}</span><h1>End Turn Review</h1><p>Resolve Mission Actions and Secondary scoring in one place.</p></div>

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
        <div className="section-heading"><div><span className="eyebrow">Physical conditions</span><h2>Quick confirmation</h2></div></div>
        {activeIds.has('ZA_LINIAMI_WROGA') && <ConfirmationRow label="A qualifying unit is completely inside the Rival deployment zone." checked={confirmations.behindEnemyLines ?? false} onChange={(value) => setConfirmation('behindEnemyLines', value)} />}
        {activeIds.has('SZEROKI_FRONT') && <>
          <ConfirmationRow label="OC>0 units are in three battlefield sectors." checked={confirmations.wideFrontThreeSectors ?? false} onChange={(value) => setConfirmation('wideFrontThreeSectors', value)} />
          <ConfirmationRow label="At least two qualifying units are outside your deployment zone." checked={confirmations.wideFrontTwoOutsideDeployment ?? false} onChange={(value) => setConfirmation('wideFrontTwoOutsideDeployment', value)} />
        </>}
        {activeIds.has('UTRZYMAJ_BAZE') && <ConfirmationRow label="No enemy unit is inside your deployment zone." checked={confirmations.noEnemyInOwnDeployment ?? false} onChange={(value) => setConfirmation('noEnemyInOwnDeployment', value)} />}
        {activeIds.has('ODCIECIE_ODWROTU') && <>
          <ConfirmationRow label="You control a qualifying neutral objective closest to the Rival deployment zone." checked={confirmations.controlsClosestNeutralObjective ?? false} onChange={(value) => setConfirmation('controlsClosestNeutralObjective', value)} />
          <ConfirmationRow label="An OC>0 unit is within 9″ of the Rival deployment zone." checked={confirmations.unitNearRivalDeployment ?? false} onChange={(value) => setConfirmation('unitNearRivalDeployment', value)} />
        </>}
        {!['DOMINACJA_CENTRUM', 'ZA_LINIAMI_WROGA', 'SZEROKI_FRONT', 'UTRZYMAJ_BAZE', 'ODCIECIE_ODWROTU'].some((id) => activeIds.has(id as SecondaryId)) && <p className="context-note">No additional physical-state confirmation is required.</p>}
      </section>

      <div className="review-actions"><button onClick={onCancel}>Back</button><button className="button--gold" onClick={evaluate}>Evaluate turn</button></div>
    </>}

    {evaluated && <>
      <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Resolved</span><h2>Mission Actions</h2></div></div>
        {review.missionActions.length === 0
          ? <p className="context-note">No Mission Actions this turn.</p>
          : review.missionActions.map((action) => <div className={`review-result review-result--${action.status.toLowerCase()}`} key={`${action.name}-${action.unitName}`}><span>{action.status === 'COMPLETED' ? '✓' : action.status === 'FAILED' ? '✕' : '○'}</span><div><strong>{action.name}</strong><small>{action.unitName} · {action.detail}</small></div></div>)}
      </section>
      <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Secondary</span><h2>{review.roundSecondaryVp} / {review.roundCap} VP this round</h2></div><strong>{review.gameSecondaryVp} / {review.gameCap}</strong></div>
        {newScores.map((entry) => <div className="review-result review-result--completed" key={`${entry.cardId}-${entry.round}`}><span>✓</span><div><strong>{entry.cardName}</strong><small>Completed</small></div><strong>+{entry.pointsAwarded} VP</strong></div>)}
        {newScores.length === 0 && <p className="context-note">No new Secondary completed during this review.</p>}
      </section>
      <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">Incomplete cards</span><h2>Keep or discard</h2></div></div>
        {review.incompleteCards.length === 0
          ? <p className="context-note">No incomplete cards remain.</p>
          : review.incompleteCards.map((card) => <div className="discard-choice" key={card.cardId}><strong>{card.name}</strong><button className={discardIds.includes(card.cardId) ? 'button--danger' : ''} onClick={() => toggleDiscard(card.cardId)}>{discardIds.includes(card.cardId) ? 'Discard' : 'Keep'}</button></div>)}
      </section>
      <div className="review-actions"><button onClick={() => setEvaluated(false)}>Review inputs</button><button className="button--gold" onClick={finish}>End turn</button></div>
    </>}
  </main>
}

function ConfirmationRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="review-check-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>
}
