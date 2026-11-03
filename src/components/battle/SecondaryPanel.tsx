import { t as tr } from '../../features/i18n/locale'
import { useState } from 'react'
import { AppIcon } from '../AppIcon'
import type { StartMissionActionInput } from '../../domain/battle/missionActions'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import {
  getActiveSecondaryViews,
  getGameSecondaryVp,
  getPriorityTargetCandidates,
  getPendingEliminationChoice,
  getRoundSecondaryVp,
  getSecondaryState,
  getSecondaryRoundCap,
  isMulliganAvailable,
} from '../../rulesets/cauldronFFA3/secondary'
import type { ActiveSecondaryView, SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { MissionActionLauncher } from './MissionActionLauncher'
import { QuickObjectiveControls } from './QuickObjectiveControls'
import { SecondaryDrawReveal } from './SecondaryDrawReveal'
import { getSecondaryPresentation } from './secondaryPresentation'

type SecondaryPanelProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
  onMulligan: (playerId: string, cardId: SecondaryId) => void
  onOpenRivalArmy: (cardId: SecondaryId) => void
  onStartMissionAction: (input: StartMissionActionInput) => void
  onCheckCondition: () => void
  onSelectPriorityCandidates: (playerId: string, unitIds: string[]) => void
  onChoosePriorityTarget: (playerId: string, unitId: string) => void
  onResolveEliminationChoice: (playerId: string, cardId: SecondaryId) => void
}

const ACTION_LABELS: Record<NonNullable<ActiveSecondaryView['action']>, string> = {
  OPEN_RIVAL_ARMY: 'Open Rival army',
  QUICK_OBJECTIVES: 'Quick objectives',
  START_MISSION_ACTION: 'Start action',
  CHECK_CONDITION: 'Check condition',
  SELECT_TARGET: 'Select target',
}

function statusLabel(status: ActiveSecondaryView['status']): string {
  switch (status) {
    case 'INPUT_REQUIRED': return 'Input required'
    case 'DECISION_REQUIRED': return 'Decision required'
    case 'DEADLINE_FAILED': return 'Deadline passed'
    case 'COMPLETED': return 'Completed'
    default: return 'Incomplete'
  }
}

export function SecondaryPanel({
  session,
  dispatch,
  onMulligan,
  onOpenRivalArmy,
  onStartMissionAction,
  onCheckCondition,
  onSelectPriorityCandidates,
  onChoosePriorityTarget,
  onResolveEliminationChoice,
}: SecondaryPanelProps) {
  const playerId = session.state.activePlayerId
  const secondary = getSecondaryState(session)[playerId]
  const cards = getActiveSecondaryViews(session, playerId)
  const [mulliganOpen, setMulliganOpen] = useState(false)
  const [quickObjectivesFor, setQuickObjectivesFor] = useState<SecondaryId | null>(null)
  const [missionActionFor, setMissionActionFor] = useState<SecondaryId | null>(null)
  const [targetFlowOpen, setTargetFlowOpen] = useState(false)
  const [candidateIds, setCandidateIds] = useState<string[]>([])
  const mulliganAvailable = isMulliganAvailable(session, playerId)
  const priorityCard = secondary.active.find((card) => card.cardId === 'CEL_PRIORYTETOWY')
  const selectedCandidates = priorityCard?.cardSpecificState?.priorityCandidateUnitIds ?? []
  const chosenTarget = priorityCard?.cardSpecificState?.priorityTargetUnitId
  const candidates = getPriorityTargetCandidates(session, playerId).filter((candidate) => candidate.eligible)
  const recentScore = secondary.scoreHistory.at(-1)
  const pendingChoice = getPendingEliminationChoice(session, playerId)

  function runAction(card: ActiveSecondaryView) {
    switch (card.action) {
      case 'OPEN_RIVAL_ARMY': onOpenRivalArmy(card.cardId); break
      case 'QUICK_OBJECTIVES': setQuickObjectivesFor((current) => current === card.cardId ? null : card.cardId); break
      case 'START_MISSION_ACTION': setMissionActionFor(card.cardId); break
      case 'CHECK_CONDITION': onCheckCondition(); break
      case 'SELECT_TARGET': setTargetFlowOpen(true); break
    }
  }

  function toggleCandidate(unitId: string) {
    setCandidateIds((current) => current.includes(unitId)
      ? current.filter((id) => id !== unitId)
      : current.length < 2 ? [...current, unitId] : current)
  }

  return (
    <section className="panel secondary-panel">
      <SecondaryDrawReveal session={session} playerId={playerId} onMulligan={onMulligan} />
      <div className="section-heading secondary-heading">
        <div><span className="eyebrow">{tr("Current objectives")}</span><h2>{tr("Secondary Missions")}</h2></div>
        <div className="secondary-score"><strong>{getRoundSecondaryVp(session, playerId)} / {getSecondaryRoundCap(session)}</strong><span>{tr("round")}</span><small>{getGameSecondaryVp(session, playerId)} {tr(" / 45 game")}</small></div>
      </div>
      {recentScore?.round === session.state.round && <div className="secondary-feedback" role="status">✓ {recentScore.cardName} {tr(" completed · +")}{recentScore.pointsAwarded} {tr(" VP")}</div>}
      {pendingChoice && <div className="secondary-decision" role="alert">
        <div><span className="eyebrow">{tr("Decision required")}</span><strong>{tr("This kill can complete multiple Secondaries")}</strong><p>{tr("Destroyed: ")}{pendingChoice.destroyedUnitName}{tr(". Choose one card.")}</p></div>
        <div>{pendingChoice.options.map((option) => <button className="button--gold" key={option.cardId} onClick={() => onResolveEliminationChoice(playerId, option.cardId)}>{option.name}<span>{option.vp} {tr(" VP")}</span></button>)}</div>
      </div>}
      <div className="secondary-card-grid">
        {cards.map((card) => {
          const visual = getSecondaryPresentation(card)
          return <article className={`secondary-card secondary-card--${card.status.toLowerCase()} secondary-card--${visual.kind}`} key={card.cardId}>
            <div className="secondary-card__heading">
              <div className="secondary-card__identity">
                <span className="secondary-card__icon"><AppIcon name={visual.icon} /></span>
                <div><span>{tr(visual.label)} · {statusLabel(card.status)}</span><h3>{card.name}</h3></div>
              </div>
              <div className="secondary-card__vp"><strong>{card.vp}</strong><span>{tr("VP")}</span></div>
            </div>
            <p className="secondary-card__objective">{card.objective}</p>
            <p className="secondary-card__progress"><i aria-hidden="true" />{tr(card.progress)}</p>
            {card.action && <button
              className={card.status === 'DECISION_REQUIRED' ? 'button--danger' : ''}
              disabled={card.action === 'CHECK_CONDITION' && session.state.phase !== 'END_TURN'}
              onClick={() => runAction(card)}
            >{card.action === 'CHECK_CONDITION' && session.state.phase !== 'END_TURN'
                ? tr('Check at End Turn')
                : card.action === 'OPEN_RIVAL_ARMY' && ['ZNISZCZ_KOLOSA', 'ELIMINACJA_DOWODCY'].includes(card.cardId)
                  ? tr('Show Rival targets')
                  : ACTION_LABELS[card.action]}</button>}
          </article>
        })}
      </div>
      {cards.length === 0 && <p className="context-note">{tr("No active Secondary cards. Cards refill automatically at the start of your next Command phase.")}</p>}

      {mulliganAvailable && <div className="secondary-mulligan">
        {!mulliganOpen
          ? <><span><strong>{tr("Free mulligan available")}</strong><small>{tr("Once during this turn.")}</small></span><button onClick={() => setMulliganOpen(true)}>{tr("Mulligan")}</button></>
          : <><span><strong>{tr("Select a card to replace")}</strong><small>{tr("The replacement is drawn immediately.")}</small></span><div>{cards.map((card) => <button key={card.cardId} onClick={() => { onMulligan(playerId, card.cardId); setMulliganOpen(false) }}>{card.name}</button>)}</div></>}
      </div>}

      {quickObjectivesFor && <div className="secondary-context-panel">
        <div className="context-panel-heading"><strong>{tr("Quick objective control")}</strong><button onClick={() => setQuickObjectivesFor(null)}>{tr("Close")}</button></div>
        <QuickObjectiveControls session={session} dispatch={dispatch} />
      </div>}

      {missionActionFor && <MissionActionLauncher
        session={session}
        secondaryId={missionActionFor}
        onStart={(input) => { onStartMissionAction(input); setMissionActionFor(null) }}
        onClose={() => setMissionActionFor(null)}
      />}

      {targetFlowOpen && priorityCard && !chosenTarget && <div className="secondary-context-panel priority-target-flow">
        <div className="context-panel-heading"><strong>{tr("Priority Target")}</strong><button onClick={() => setTargetFlowOpen(false)}>{tr("Close")}</button></div>
        {selectedCandidates.length !== 2 ? <>
          <p>{tr("Select two Rival units worth at least 10% of their starting army.")}</p>
          <div className="priority-target-list">{candidates.map((candidate) => <label key={candidate.unitId}>
            <input type="checkbox" checked={candidateIds.includes(candidate.unitId)} onChange={() => toggleCandidate(candidate.unitId)} />
            <span><strong>{candidate.name}</strong><small>{candidate.points} {tr(" pts")}</small></span>
          </label>)}</div>
          <button className="button--gold button--wide" disabled={candidateIds.length !== 2} onClick={() => onSelectPriorityCandidates(playerId, candidateIds)}>{tr("Confirm two targets")}</button>
        </> : <>
          <p>{tr("The current Rival chooses one target.")}</p>
          <div className="priority-rival-choice">{candidates.filter((candidate) => selectedCandidates.includes(candidate.unitId)).map((candidate) => <button key={candidate.unitId} onClick={() => { onChoosePriorityTarget(playerId, candidate.unitId); setTargetFlowOpen(false) }}>{candidate.name}<span>{candidate.points} {tr(" pts")}</span></button>)}</div>
        </>}
      </div>}
    </section>
  )
}

export function SecondaryDetailPanel({ session, playerId = session.state.activePlayerId }: { session: BattleSession; playerId?: string }) {
  const state = getSecondaryState(session)[playerId]
  const player = session.state.players[playerId]
  if (!state || !player) return <section className="panel secondary-detail-panel"><p className="context-note">{tr("Secondary data is unavailable for this player.")}</p></section>
  return <section className="panel secondary-detail-panel">
    <div className="section-heading"><div><span className="eyebrow">{tr("Deck & history")}</span><h2>{player.name} {tr(" Secondaries")}</h2></div><div className="secondary-score"><strong>{getGameSecondaryVp(session, playerId)} / 45</strong><span>{tr("game VP")}</span></div></div>
    <div className="secondary-deck-counts">
      <div><strong>{state.active.length}</strong><span>{tr("Active")}</span></div>
      <div><strong>{state.deck.length}</strong><span>{tr("Deck")}</span></div>
      <div><strong>{state.completed.length}</strong><span>{tr("Completed")}</span></div>
      <div><strong>{state.discarded.length}</strong><span>{tr("Discarded")}</span></div>
    </div>
    <h3>{tr("Scoring history")}</h3>
    {state.scoreHistory.length === 0
      ? <p className="context-note">{tr("No Secondary VP scored yet.")}</p>
      : <ul className="secondary-history">{state.scoreHistory.map((entry, index) => <li key={`${entry.round}-${entry.cardId}-${index}`}><span>{tr("Round ")}{entry.round} · {entry.cardName}</span><strong>+{entry.pointsAwarded} {tr(" VP")}</strong></li>)}</ul>}
  </section>
}
