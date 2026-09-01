import { useState } from 'react'
import type { StartMissionActionInput } from '../../domain/battle/missionActions'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import {
  getActiveSecondaryViews,
  getGameSecondaryVp,
  getPriorityTargetCandidates,
  getPendingEliminationChoice,
  getRoundSecondaryVp,
  getSecondaryState,
  isMulliganAvailable,
} from '../../rulesets/cauldronFFA3/secondary'
import type { ActiveSecondaryView, SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { MissionActionLauncher } from './MissionActionLauncher'
import { QuickObjectiveControls } from './QuickObjectiveControls'

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
      <div className="section-heading secondary-heading">
        <div><span className="eyebrow">Current objectives</span><h2>Secondary Missions</h2></div>
        <div className="secondary-score"><strong>{getRoundSecondaryVp(session, playerId)} / 10</strong><span>round</span><small>{getGameSecondaryVp(session, playerId)} / 45 game</small></div>
      </div>
      {recentScore?.round === session.state.round && <div className="secondary-feedback" role="status">✓ {recentScore.cardName} completed · +{recentScore.pointsAwarded} VP</div>}
      {pendingChoice && <div className="secondary-decision" role="alert">
        <div><span className="eyebrow">Decision required</span><strong>This kill can complete multiple Secondaries</strong><p>Destroyed: {pendingChoice.destroyedUnitName}. Choose one card.</p></div>
        <div>{pendingChoice.options.map((option) => <button className="button--gold" key={option.cardId} onClick={() => onResolveEliminationChoice(playerId, option.cardId)}>{option.name}<span>{option.vp} VP</span></button>)}</div>
      </div>}
      <div className="secondary-card-grid">
        {cards.map((card) => <article className={`secondary-card secondary-card--${card.status.toLowerCase()}`} key={card.cardId}>
          <div className="secondary-card__heading"><div><span>{statusLabel(card.status)}</span><h3>{card.name}</h3></div><strong>{card.vp} VP</strong></div>
          <p className="secondary-card__objective">{card.objective}</p>
          <p className="secondary-card__progress">{card.progress}</p>
          {card.action && <button
            className={card.status === 'DECISION_REQUIRED' ? 'button--danger' : ''}
            disabled={card.action === 'CHECK_CONDITION' && session.state.phase !== 'END_TURN'}
            onClick={() => runAction(card)}
          >{card.action === 'CHECK_CONDITION' && session.state.phase !== 'END_TURN'
              ? 'Check at End Turn'
              : card.action === 'OPEN_RIVAL_ARMY' && ['ZNISZCZ_KOLOSA', 'ELIMINACJA_DOWODCY'].includes(card.cardId)
                ? 'Show Rival targets'
                : ACTION_LABELS[card.action]}</button>}
        </article>)}
      </div>
      {cards.length === 0 && <p className="context-note">No active Secondary cards. Cards refill automatically at the start of your next Command phase.</p>}

      {mulliganAvailable && <div className="secondary-mulligan">
        {!mulliganOpen
          ? <><span><strong>Free mulligan available</strong><small>Once during this turn.</small></span><button onClick={() => setMulliganOpen(true)}>Mulligan</button></>
          : <><span><strong>Select a card to replace</strong><small>The replacement is drawn immediately.</small></span><div>{cards.map((card) => <button key={card.cardId} onClick={() => { onMulligan(playerId, card.cardId); setMulliganOpen(false) }}>{card.name}</button>)}</div></>}
      </div>}

      {quickObjectivesFor && <div className="secondary-context-panel">
        <div className="context-panel-heading"><strong>Quick objective control</strong><button onClick={() => setQuickObjectivesFor(null)}>Close</button></div>
        <QuickObjectiveControls session={session} dispatch={dispatch} />
      </div>}

      {missionActionFor && <MissionActionLauncher
        session={session}
        secondaryId={missionActionFor}
        onStart={(input) => { onStartMissionAction(input); setMissionActionFor(null) }}
        onClose={() => setMissionActionFor(null)}
      />}

      {targetFlowOpen && priorityCard && !chosenTarget && <div className="secondary-context-panel priority-target-flow">
        <div className="context-panel-heading"><strong>Priority Target</strong><button onClick={() => setTargetFlowOpen(false)}>Close</button></div>
        {selectedCandidates.length !== 2 ? <>
          <p>Select two Rival units worth at least 10% of their starting army.</p>
          <div className="priority-target-list">{candidates.map((candidate) => <label key={candidate.unitId}>
            <input type="checkbox" checked={candidateIds.includes(candidate.unitId)} onChange={() => toggleCandidate(candidate.unitId)} />
            <span><strong>{candidate.name}</strong><small>{candidate.points} pts</small></span>
          </label>)}</div>
          <button className="button--gold button--wide" disabled={candidateIds.length !== 2} onClick={() => onSelectPriorityCandidates(playerId, candidateIds)}>Confirm two targets</button>
        </> : <>
          <p>The current Rival chooses one target.</p>
          <div className="priority-rival-choice">{candidates.filter((candidate) => selectedCandidates.includes(candidate.unitId)).map((candidate) => <button key={candidate.unitId} onClick={() => { onChoosePriorityTarget(playerId, candidate.unitId); setTargetFlowOpen(false) }}>{candidate.name}<span>{candidate.points} pts</span></button>)}</div>
        </>}
      </div>}
    </section>
  )
}

export function SecondaryDetailPanel({ session, playerId = session.state.activePlayerId }: { session: BattleSession; playerId?: string }) {
  const state = getSecondaryState(session)[playerId]
  const player = session.state.players[playerId]
  if (!state || !player) return <section className="panel secondary-detail-panel"><p className="context-note">Secondary data is unavailable for this player.</p></section>
  return <section className="panel secondary-detail-panel">
    <div className="section-heading"><div><span className="eyebrow">Deck & history</span><h2>{player.name} Secondaries</h2></div><div className="secondary-score"><strong>{getGameSecondaryVp(session, playerId)} / 45</strong><span>game VP</span></div></div>
    <div className="secondary-deck-counts">
      <div><strong>{state.active.length}</strong><span>Active</span></div>
      <div><strong>{state.deck.length}</strong><span>Deck</span></div>
      <div><strong>{state.completed.length}</strong><span>Completed</span></div>
      <div><strong>{state.discarded.length}</strong><span>Discarded</span></div>
    </div>
    <h3>Scoring history</h3>
    {state.scoreHistory.length === 0
      ? <p className="context-note">No Secondary VP scored yet.</p>
      : <ul className="secondary-history">{state.scoreHistory.map((entry, index) => <li key={`${entry.round}-${entry.cardId}-${index}`}><span>Round {entry.round} · {entry.cardName}</span><strong>+{entry.pointsAwarded} VP</strong></li>)}</ul>}
  </section>
}
