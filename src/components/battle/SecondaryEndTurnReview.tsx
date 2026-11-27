import { t as tr } from '../../features/i18n/locale'
import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import { doublesForceForPlayer } from '../../domain/battle/doubles'
import type { BattleSession, MissionActionState } from '../../domain/battle/types'
import {
  buildCauldronTurnSummary,
  buildPrimaryTurnReview,
  createEndTurnSecondaryEvents,
  getDuelMission,
  getOperationalPlanState,
  getPrimaryTurnCommit,
  isOfficialPrimary,
  isDuelPrimary,
  getDuelConditions,
} from '../../rulesets/cauldronFFA3'
import { getEndTurnReview, getSecondaryState, isOfficialSecondary } from '../../rulesets/cauldronFFA3/secondary'
import { OfficialSecondaryPanel } from './OfficialSecondaryPanel'
import { OfficialPrimaryInputs } from './OfficialPrimaryInputs'
import { CurrentRivalPanel } from './RivalClarity'
import { DuelPrimaryPanel } from './DuelPrimaryPanel'
import type { EndTurnSecondaryConfirmations, SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { useBattleStore } from '../../stores/battleStore'
import { getPendingEndTurnScoring } from './turnReviewProgress'
import './turnReview.css'

type SecondaryEndTurnReviewProps = {
  session: BattleSession
  onCompleteMissionAction: (actionId: string, positionConfirmed: boolean) => void
  onEvaluate: (playerId: string, confirmations: EndTurnSecondaryConfirmations) => void
  onDiscard: (playerId: string, cardIds: SecondaryId[]) => void
  onFinish: () => void
  onCancel: () => void
  sharedBattle?: boolean
  reviewPlayerId?: string
}

export function SecondaryEndTurnReview(props: SecondaryEndTurnReviewProps) {
  const { session, reviewPlayerId } = props
  const turnKey = `${session.setup.gameId}:${session.state.round}:${session.state.activePlayerId}:${reviewPlayerId ?? 'local'}`
  if (isDuelPrimary(session)) return <DuelEndTurnReview key={turnKey} {...props} />
  if (reviewPlayerId && reviewPlayerId !== session.state.activePlayerId) {
    return <OpponentSecondaryReview key={turnKey} session={session} playerId={reviewPlayerId} onCancel={props.onCancel} />
  }
  return <CauldronEndTurnReview key={turnKey} {...props} />
}

function reviewOwnerName(session: BattleSession, playerId: string) {
  return doublesForceForPlayer(session.setup, playerId)?.name ?? session.state.players[playerId]?.name ?? playerId
}

function TurnReviewChecklist({ session, reviewPlayerId, onCancel }: {
  session: BattleSession
  reviewPlayerId?: string
  onCancel: () => void
}) {
  const activeId = session.state.activePlayerId
  const pending = getPendingEndTurnScoring(session)
  const ownReview = (id: string) => !reviewPlayerId || id === reviewPlayerId
  const hasPending = pending.primary.length > 0 || pending.secondary.length > 0 || pending.missionActions.length > 0 || pending.eliminationChoice
  function focusSection(id: string) {
    const target = document.getElementById(id)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'start' })
  }
  return <section className="panel turn-review-section turn-review-checklist" aria-labelledby="turn-review-next-steps">
    <h2 id="turn-review-next-steps">{tr('Next steps')}</h2>
    {!hasPending ? <p role="status">{tr('All required turn scoring is confirmed.')}</p> : <ul>
      {pending.missionActions.length > 0 && <li>
        <strong>{reviewOwnerName(session, activeId)}</strong><span>{tr('Resolve Mission Actions')}</span>
        {ownReview(activeId) && <button type="button" onClick={() => focusSection('turn-review-actions')}>{tr('Go to Mission Actions')}</button>}
      </li>}
      {pending.eliminationChoice && <li>
        <strong>{reviewOwnerName(session, activeId)}</strong><span>{tr('Resolve the pending Secondary scoring choice')}</span>
        {ownReview(activeId) && <button type="button" onClick={onCancel}>{tr('Back to turn')}</button>}
      </li>}
      {pending.primary.map((id) => <li key={id}>
        <strong>{reviewOwnerName(session, id)}</strong>
        <span>{isDuelPrimary(session) && id !== activeId ? tr(`Confirm ${getDuelMission(session, id).name}`, 'Confirm {0}') : tr('Confirm end-of-turn Primary')}</span>
        {ownReview(id) && <button type="button" onClick={() => focusSection(`turn-review-primary-${id}`)}>{tr('Go to Primary')}</button>}
      </li>)}
      {pending.secondary.length > 0 && <li>
        <strong>{tr('Secondary review pending')}</strong>
        <span>{pending.secondary.map((id) => reviewOwnerName(session, id)).join(', ')}</span>
        {pending.missionActions.length === 0 && pending.secondary.filter(ownReview).map((id) => <button type="button" key={id} onClick={() => focusSection(`turn-review-secondary-${id}`)}>{tr('Go to Secondary')} · {reviewOwnerName(session, id)}</button>)}
      </li>}
    </ul>}
  </section>
}

function TurnMissionActions({ session, actions, onResolve }: {
  session: BattleSession
  actions: MissionActionState[]
  onResolve: SecondaryEndTurnReviewProps['onCompleteMissionAction']
}) {
  if (actions.length === 0) return null
  return <section id="turn-review-actions" tabIndex={-1} className="panel turn-review-section turn-review-anchor">
    <h2>{tr('Complete Mission Actions')}</h2>
    {actions.map((action) => {
      const armyId = session.state.players[action.playerId]?.armyId
      const unitName = armyId ? session.setup.armies[armyId]?.units.find((unit) => unit.id === action.unitId)?.name : undefined
      return <div className="turn-review-mission" key={action.id}>
        <div><strong>{action.name}</strong>{unitName && <span>{unitName}</span>}</div>
        <div>
          <button type="button" onClick={() => onResolve(action.id, true)}>{tr('Confirm final position')}</button>
          <button type="button" onClick={() => onResolve(action.id, false)}>{tr('Position lost')}</button>
        </div>
      </div>
    })}
  </section>
}

function TurnSecondaryPanel({ session, playerId }: { session: BattleSession; playerId: string }) {
  return <div id={`turn-review-secondary-${playerId}`} tabIndex={-1} className="turn-review-anchor">
    <OfficialSecondaryPanel session={session} playerId={playerId} editable />
  </div>
}

function OpponentSecondaryReview({ session, playerId, onCancel }: { session: BattleSession; playerId: string; onCancel: () => void }) {
  return <main className="battle-content secondary-turn-review">
    <div className="round-review__intro"><span className="eyebrow">{reviewOwnerName(session, session.state.activePlayerId)}</span><h1>{tr('End Turn Review')}</h1></div>
    <TurnReviewChecklist session={session} reviewPlayerId={playerId} onCancel={onCancel} />
    {getPendingEndTurnScoring(session).missionActions.length === 0 && <TurnSecondaryPanel session={session} playerId={playerId} />}
    <div className="review-actions"><button type="button" onClick={onCancel}>{tr('Back to turn')}</button></div>
  </main>
}

function DuelEndTurnReview({ session, onCompleteMissionAction, onFinish, onCancel, sharedBattle = false, reviewPlayerId }: SecondaryEndTurnReviewProps) {
  const playerId = session.state.activePlayerId
  const otherId = session.state.turnOrder.find((id) => id !== playerId)!
  const opponentHasEither = getDuelConditions(session, otherId, 'turn').some((condition) => condition.window === 'either')
  const pending = getPendingEndTurnScoring(session)
  const visiblePrimaryIds = (sharedBattle ? [reviewPlayerId ?? playerId] : session.state.turnOrder)
    .filter((id) => id === playerId || opponentHasEither)
  const visibleSecondaryIds = sharedBattle ? [reviewPlayerId ?? playerId] : session.state.turnOrder
  const canManageTurn = !sharedBattle || !reviewPlayerId || reviewPlayerId === playerId
  const last = session.state.turnOrder.at(-1) === playerId
  const canFinish = pending.primary.length === 0 && pending.secondary.length === 0 && pending.missionActions.length === 0 && !pending.eliminationChoice

  return <main className="battle-content secondary-turn-review">
    <div className="round-review__intro"><span className="eyebrow">{reviewOwnerName(session, playerId)}</span><h1>{tr('End Turn · Chapter Approved')}</h1></div>
    <TurnReviewChecklist session={session} reviewPlayerId={reviewPlayerId} onCancel={onCancel} />
    {canManageTurn && <TurnMissionActions session={session} actions={pending.missionActions} onResolve={onCompleteMissionAction} />}
    {visiblePrimaryIds.map((id) => <div key={id} id={`turn-review-primary-${id}`} tabIndex={-1} className="turn-review-anchor">
      <DuelPrimaryPanel session={session} playerId={id} window="turn" editable={pending.missionActions.length === 0} compact />
    </div>)}
    {pending.missionActions.length === 0 && visibleSecondaryIds.map((id) => <TurnSecondaryPanel key={id} session={session} playerId={id} />)}
    <div className="review-actions"><button type="button" onClick={onCancel}>{tr('Back to turn')}</button>{canManageTurn && <button className="button--gold" type="button" disabled={!canFinish} onClick={onFinish}>{last ? tr('Continue to Battle Round review') : tr(`End turn → ${reviewOwnerName(session, otherId)}`, 'End turn → {0}')}</button>}</div>
  </main>
}

function CauldronEndTurnReview({
  session,
  onCompleteMissionAction,
  onEvaluate,
  onDiscard,
  onFinish,
  onCancel,
  sharedBattle = false,
  reviewPlayerId,
}: SecondaryEndTurnReviewProps) {
  const playerId = session.state.activePlayerId
  const player = session.state.players[playerId]
  const activeCards = getSecondaryState(session)[playerId].active
  const official = isOfficialSecondary(session)
  const officialPrimary = isOfficialPrimary(session)
  const pending = getPendingEndTurnScoring(session)
  const activeIds = new Set(activeCards.map((card) => card.cardId))
  const planId = officialPrimary ? null : getOperationalPlanState(session, playerId).planId
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
  const activeActions = pending.missionActions
  const secondaryPreview = !official && !primaryCommit && activeActions.length === 0
    ? createEndTurnSecondaryEvents(session, playerId, confirmations).reduce((total, event) => (
      event.type === 'SCORE_ADJUSTED' && event.payload.category === 'secondary' ? total + event.payload.delta : total
    ), 0)
    : undefined
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

  function setCentreOc(targetPlayerId: string, value: number) {
    if (!Number.isSafeInteger(value)) return
    setConfirmations((current) => ({
      ...current,
      centreOcByPlayer: {
        ...current.centreOcByPlayer,
        [targetPlayerId]: Math.max(0, value),
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
    if (confirmations.officialPrimary?.actions?.some((action) => !action.unitName.trim())) return
    onEvaluate(playerId, confirmations)
  }

  function toggleDiscard(cardId: SecondaryId) {
    setDiscardIds((current) => current.includes(cardId)
      ? current.filter((id) => id !== cardId)
      : [...current, cardId])
  }

  function finish() {
    if (discardIds.length > 0) {
      onDiscard(playerId, discardIds)
      if (useBattleStore.getState().error) return
    }
    onFinish()
  }

  return <main className="battle-content secondary-turn-review">
    <div className="round-review__intro"><span className="eyebrow">{player.name}</span><h1>{tr('End Turn Review')}</h1></div>
    <TurnReviewChecklist session={session} reviewPlayerId={reviewPlayerId} onCancel={onCancel} />
    <TurnMissionActions session={session} actions={activeActions} onResolve={onCompleteMissionAction} />

    {!primaryCommit && <>
      {!official && activeIds.has('DOMINACJA_CENTRUM') && <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">{tr("Dominacja Centrum")}</span><h2>{tr("Centre OC")}</h2></div></div>
        {session.state.turnOrder.map((id) => {
          const name = reviewOwnerName(session, id)
          const value = confirmations.centreOcByPlayer?.[id] ?? 0
          const inputId = `centre-oc-${id}`
          return <div className="centre-oc-row" key={id}>
            <label htmlFor={inputId}>{name}</label>
            <div className="stepper centre-oc-input">
              <button type="button" aria-label={tr(`Decrease OC for ${name}`, 'Decrease OC for {0}')} disabled={value === 0} onClick={() => setCentreOc(id, value - 1)}>−</button>
              <input id={inputId} type="number" inputMode="numeric" min={0} step={1} value={value || ''} placeholder="0" onFocus={(event) => event.currentTarget.select()} onChange={(event) => setCentreOc(id, Number(event.target.value))} />
              <button type="button" aria-label={tr(`Increase OC for ${name}`, 'Increase OC for {0}')} onClick={() => setCentreOc(id, value + 1)}>+</button>
            </div>
          </div>
        })}
      </section>}

      {!official && <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">{tr("Secondary physical conditions")}</span><h2>{tr("Quick confirmation")}</h2></div></div>
        {activeIds.has('ZA_LINIAMI_WROGA') && <div className="centre-oc-row">
          <span><strong>{tr("Za Liniami Wroga")}</strong><small>{tr("Units wholly inside the current Rival deployment zone.")}</small></span>
          <div className="stepper"><button onClick={() => adjustBehindEnemyLines(-1)}>−</button><strong>{confirmations.behindEnemyLinesUnitCount ?? 0}</strong><button onClick={() => adjustBehindEnemyLines(1)}>+</button></div>
        </div>}
        {activeIds.has('SZEROKI_FRONT') && <>
          <ConfirmationRow label={tr("OC>0 units are in at least four battlefield sectors.")} checked={confirmations.wideFrontFourSectors ?? false} onChange={(value) => setConfirmation('wideFrontFourSectors', value)} />
          <ConfirmationRow label={tr("At least three qualifying units are outside your deployment zone.")} checked={confirmations.wideFrontThreeOutsideDeployment ?? false} onChange={(value) => setConfirmation('wideFrontThreeOutsideDeployment', value)} />
        </>}
        {activeIds.has('UTRZYMAJ_BAZE') && <ConfirmationRow label={tr("No enemy unit is inside your deployment zone.")} checked={confirmations.noEnemyInOwnDeployment ?? false} onChange={(value) => setConfirmation('noEnemyInOwnDeployment', value)} />}
        {activeIds.has('ODCIECIE_ODWROTU') && <>
          <ConfirmationRow label={tr("You control a qualifying neutral objective closest to the Rival deployment zone.")} checked={confirmations.controlsClosestNeutralObjective ?? false} onChange={(value) => setConfirmation('controlsClosestNeutralObjective', value)} />
          <ConfirmationRow label={tr("An OC>0 unit is within 9″ of the Rival deployment zone.")} checked={confirmations.unitNearRivalDeployment ?? false} onChange={(value) => setConfirmation('unitNearRivalDeployment', value)} />
        </>}
        {!['DOMINACJA_CENTRUM', 'ZA_LINIAMI_WROGA', 'SZEROKI_FRONT', 'UTRZYMAJ_BAZE', 'ODCIECIE_ODWROTU'].some((id) => activeIds.has(id as SecondaryId)) && <p className="context-note">{tr("No additional Secondary physical-state confirmation is required.")}</p>}
      </section>}

      {!officialPrimary && (planId === 'ZWIAD_OPERACYJNY' || planId === 'TWIERDZA') && session.state.round >= 2 && <section className="panel turn-review-section">
        <div className="section-heading"><div><span className="eyebrow">{tr("Operational Plan")}</span><h2>{primaryPreview.planEvaluation.name}</h2></div><strong>{tr("up to +5 VP")}</strong></div>
        {planId === 'ZWIAD_OPERACYJNY' && <>
          <ConfirmationRow label={tr("Non-AIRCRAFT OC>0 units are in at least four different sectors; each unit counts once.")} checked={confirmations.zwiadHasFourSectors ?? false} onChange={(value) => setConfirmation('zwiadHasFourSectors', value)} />
          <ConfirmationRow label={tr("At least two of those qualifying units are outside your deployment zone.")} checked={confirmations.zwiadHasTwoOutsideDeployment ?? false} onChange={(value) => setConfirmation('zwiadHasTwoOutsideDeployment', value)} />
        </>}
        {planId === 'TWIERDZA' && <ConfirmationRow label={tr("No enemy OC>0 unit is in range of your HOME or within 6″ of the marked neutral objective. Battle-shocked units do not block this.")} checked={confirmations.twierdzaNoEnemyAtObjectives ?? false} onChange={(value) => setConfirmation('twierdzaNoEnemyAtObjectives', value)} />}
      </section>}

      <section id={`turn-review-primary-${playerId}`} tabIndex={-1} className="panel turn-review-section turn-review-anchor">
        <div className="section-heading"><div><span className="eyebrow">{officialPrimary ? tr('11th edition Primary · FFA') : tr('Primary · Balance patch 2.1.2')}</span><h2>{primaryPreview.official?.missionName ?? tr('Score at the end of your turn')}</h2></div><strong>{primaryPreview.roundPrimary} {tr(" VP")}</strong></div>
        {officialPrimary && <>
          <CurrentRivalPanel session={session} playerId={playerId} />
          <p className="context-note">{tr("Command checks use control recorded when you left Command; in round 5 they use end-of-turn control. Opponent and enemy conditions use your Current Rival for this Battle Round. The score is saved now, once per condition.")}</p>
          <OfficialPrimaryInputs session={session} playerId={playerId} value={confirmations.officialPrimary ?? {}} onChange={(value) => setConfirmations((current) => ({ ...current, officialPrimary: value }))} />
        </>}
        {(primaryPreview.official?.conditions ?? [primaryPreview.neutralObjective, primaryPreview.twoObjectives, primaryPreview.operationalPlan]).map((condition) => <div className="primary-condition" key={condition.label}>
          <span className={condition.completed ? 'condition-mark complete' : 'condition-mark'}>{condition.completed ? '✓' : '×'}</span>
          <span>{tr(condition.label)}</span><strong>+{condition.vp}</strong>
        </div>)}
        {secondaryPreview !== undefined && <p className="context-note">{tr('Secondary preview')}: <strong>+{secondaryPreview} {tr('VP')}</strong></p>}
        {primaryPreview.capped && <p className="context-note">{tr("The total is limited to 15 VP this round and 45 VP in this battle.")}</p>}
        {planId === 'WYNISZCZENIE' && <p className="context-note">{tr("Wyniszczenie is intentionally not included here. It is checked after every player finishes the Battle Round.")}</p>}
      </section>

    </>}

    {official && activeActions.length === 0 && (sharedBattle ? [playerId] : session.state.turnOrder)
      .filter((id) => getSecondaryState(session)[id]?.active.length || pending.secondary.includes(id))
      .map((id) => <TurnSecondaryPanel key={id} session={session} playerId={id} />)}

    {!primaryCommit && <div className="review-actions"><button type="button" onClick={onCancel}>{tr('Back to turn')}</button><button className="button--gold" type="button" disabled={activeActions.length > 0 || pending.eliminationChoice || confirmations.officialPrimary?.actions?.some((action) => !action.unitName.trim())} onClick={evaluate}>{official ? tr('Apply Primary scoring') : tr('Apply scoring')}</button></div>}

    {primaryCommit && <>
      <section className={`panel turn-handoff-summary turn-handoff-summary--player-${activePlayerIndex}`} aria-label={tr("Turn summary")}>
        <div className="turn-handoff-summary__heading">
          <div className="turn-handoff-summary__identity">
            <span className="turn-handoff-summary__marker" aria-hidden="true">{player.name.trim().charAt(0).toUpperCase()}</span>
            <div><span className="eyebrow">{tr("Turn complete")}</span><h2>{player.name} {tr(" · Round ")}{session.state.round}</h2><p>{tr("Everything recorded this turn is collected here before control passes on.")}</p></div>
          </div>
          <div className="turn-handoff-summary__score"><span>{turnSummary.scoreBefore} {tr(" VP")}</span><b>→</b><strong>{turnSummary.scoreAfter} {tr(" VP")}</strong><small>+{turnSummary.pointsGained} {tr(" this turn")}</small></div>
        </div>
        <div className="turn-handoff-summary__stats">
          <div><span>{tr("Primary")}</span><strong>+{turnSummary.primaryGained} {tr(" VP")}</strong><small>{officialPrimary ? primaryPreview.official?.missionName : primaryCommit?.review.operationalPlan.completed ? tr('Operational Plan scored') : tr('End-turn scoring')}</small></div>
          <div><span>{tr("Secondary")}</span><strong>+{turnSummary.secondaryGained} {tr(" VP")}</strong><small>{turnSummary.completedSecondaries.length} {tr(" completed")}</small></div>
          <div><span>{tr("Enemy units destroyed")}</span><strong>{turnSummary.kills.length}</strong><small>{tr("Kills credited to ")}{player.name}</small></div>
        </div>
        {(turnSummary.completedSecondaries.length > 0 || turnSummary.kills.length > 0) && <details className="turn-handoff-summary__details">
          <summary><span>{tr("Recorded this turn")}</span><strong>{turnSummary.completedSecondaries.length} {tr(" missions · ")}{turnSummary.kills.length} {tr(" destroyed")}</strong></summary>
          {turnSummary.completedSecondaries.length > 0 && <div className="turn-handoff-summary__list">
            <span className="eyebrow">{tr("Completed Secondaries")}</span>
            {turnSummary.completedSecondaries.map((entry, index) => <div className="turn-handoff-summary__row" key={`${entry.cardId}-${index}`}><span>✓ {entry.name}</span><strong>+{entry.pointsAwarded} {tr(" VP")}</strong></div>)}
          </div>}
          {turnSummary.kills.length > 0 && <div className="turn-handoff-summary__list">
            <span className="eyebrow">{tr("Destroyed this turn")}</span>
            {turnSummary.kills.map((kill) => <div className="turn-handoff-summary__row" key={`${kill.victimPlayerId}-${kill.unitId}`}><span>{kill.unitName}<small>{kill.victimPlayerName}</small></span><strong>{tr("Destroyed")}</strong></div>)}
          </div>}
        </details>}
      </section>

      <details className="panel turn-review-details">
        <summary>
          <span><span className="eyebrow">{tr("Optional details")}</span><strong>{tr("Scoring and Mission Action audit")}</strong></span>
          <small>{tr("Primary +")}{turnSummary.primaryGained} {tr(" · Secondary +")}{turnSummary.secondaryGained}</small>
        </summary>
        <div className="turn-review-details__body">
          <section className="turn-review-details__group">
            <div className="section-heading"><div><span className="eyebrow">{tr("Resolved")}</span><h2>{tr("Primary")}</h2></div></div>
            <div className="review-result review-result--completed"><span>✓</span><div><strong>{tr("End-turn Primary committed")}</strong><small>{tr("Round ")}{session.state.round} {tr(" · this score will not be recalculated after later players move.")}</small></div><strong>+{primaryCommit?.pointsAwarded ?? primaryPreview.roundPrimary} {tr(" VP")}</strong></div>
            {planId === 'WYNISZCZENIE' && <p className="context-note">{tr("Wyniszczenie remains pending until the end of the Battle Round.")}</p>}
          </section>
          <section className="turn-review-details__group">
            <div className="section-heading"><div><span className="eyebrow">{tr("Resolved")}</span><h2>{tr("Mission Actions")}</h2></div></div>
            {review.missionActions.length === 0
              ? <p className="context-note">{tr("No Mission Actions this turn.")}</p>
              : review.missionActions.map((action) => <div className={`review-result review-result--${action.status.toLowerCase()}`} key={`${action.name}-${action.unitName}`}><span>{action.status === 'COMPLETED' ? '✓' : action.status === 'FAILED' ? '✕' : '○'}</span><div><strong>{action.name}</strong><small>{action.unitName} · {action.detail}</small></div></div>)}
          </section>
          <section className="turn-review-details__group">
            <div className="section-heading"><div><span className="eyebrow">{tr("Secondary")}</span><h2>{review.roundSecondaryVp} / {review.roundCap} {tr(" VP this round")}</h2></div><strong>{review.gameSecondaryVp} / {review.gameCap}</strong></div>
            {turnSummary.completedSecondaries.map((entry, index) => <div className="review-result review-result--completed" key={`${entry.cardId}-${index}`}><span>✓</span><div><strong>{entry.name}</strong><small>{tr("Completed this turn")}</small></div><strong>+{entry.pointsAwarded} {tr(" VP")}</strong></div>)}
            {turnSummary.completedSecondaries.length === 0 && <p className="context-note">{tr("No Secondary was completed this turn.")}</p>}
          </section>
        </div>
      </details>
      {!official && review.incompleteCards.length > 0 && <section className="panel turn-review-section turn-review-carryover">
        <div className="section-heading"><div><span className="eyebrow">{tr("Incomplete cards")}</span><h2>{tr("Choose what carries over")}</h2></div></div>
        {review.incompleteCards.map((card) => {
            const discarding = discardIds.includes(card.cardId)
            return <div className={`discard-choice${discarding ? ' discard-choice--discarding' : ''}`} key={card.cardId}>
              <div><strong>{card.name}</strong><small>{discarding ? tr('Will be discarded at the end of this review.') : tr('Will remain active for your next turn.')}</small></div>
              <button
                aria-pressed={discarding}
                className={discarding ? 'button--danger' : ''}
                onClick={() => toggleDiscard(card.cardId)}
              >{discarding ? tr('Keep card') : tr('Discard card')}</button>
            </div>
          })}
      </section>}
      <div className={`turn-handoff-next turn-handoff-next--player-${nextPlayerIndex}`}>
        <span className="turn-handoff-next__icon"><AppIcon name={lastTurnOfRound ? 'objectives' : 'next'} /></span>
        <span><span className="eyebrow">{tr("Next command")}</span><strong>{lastTurnOfRound ? tr(`Finish Round ${session.state.round}`, "Finish Round {0}") : tr(`${nextPlayer?.name ?? 'Next player'} · Command phase`, "{0} · Command phase")}</strong><small>{lastTurnOfRound ? tr('Resolve deferred end-of-round effects before the next Battle Round.') : tr('The next commander will immediately see their newly drawn Secondary cards.')}</small></span>
      </div>
      <div className="review-actions review-actions--final"><button type="button" onClick={onCancel}>{tr('Back to turn')}</button><button className="button--gold" type="button" disabled={pending.secondary.length > 0 || activeActions.length > 0 || pending.eliminationChoice} onClick={finish}><span>{pending.secondary.length ? tr('Wait for Secondary review') : tr(finishLabel, lastTurnOfRound ? undefined : 'End turn → {0}')}</span><AppIcon name="next" /></button></div>
    </>}
  </main>
}

function ConfirmationRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="review-check-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{tr(label)}</span></label>
}
