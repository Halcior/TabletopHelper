import { useEffect, useMemo, useState } from 'react'
import type { StartMissionActionInput } from '../../../domain/battle/missionActions'
import type { BattleEventInput, BattleSession } from '../../../domain/battle/types'
import type { BattleContext, ContextAction, ContextItem, RelevantStratagem } from '../../../domain/context'
import type { StratagemAvailability } from '../../../domain/stratagems/types'
import {
  getPendingEliminationChoice,
  getPriorityTargetCandidates,
  getSecondaryState,
} from '../../../rulesets/cauldronFFA3/secondary'
import type { EndTurnSecondaryConfirmations, SecondaryId } from '../../../rulesets/cauldronFFA3/secondaryTypes'
import type { OperationalPlanId } from '../../../rulesets/cauldronFFA3/types'
import { CauldronPlanPanel } from '../CauldronPlanPanel'
import { MissionActionLauncher } from '../MissionActionLauncher'
import { ArmyQuickPanel } from '../quickPanels/ArmyQuickPanel'
import { ObjectiveQuickPanel } from '../quickPanels/ObjectiveQuickPanel'

type PanelState =
  | { type: 'army'; playerId?: string; unitId?: string; secondaryId?: SecondaryId }
  | { type: 'objectives' }
  | { type: 'mission'; secondaryId: SecondaryId }
  | { type: 'stratagems' }
  | { type: 'mulligan' }
  | { type: 'priority' }
  | { type: 'elimination' }
  | { type: 'plan' }
  | null

type Props = {
  context: BattleContext
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
  focusItemId?: string | null
  onStartMissionAction: (input: StartMissionActionInput) => void
  onMulligan: (playerId: string, cardId: SecondaryId) => void
  onOpenEndTurn: () => void
  onUseStratagem: (availability: StratagemAvailability) => void
  onHoldReaction: (playerId: string) => void
  onPassReaction: (windowId: string, playerId: string) => void
  onChangePlan: (playerId: string, planId: OperationalPlanId) => void
  onResolveEliminationChoice: (playerId: string, cardId: SecondaryId) => void
  onSelectPriorityCandidates: (playerId: string, unitIds: string[]) => void
  onChoosePriorityTarget: (playerId: string, unitId: string) => void
  onOpenArmyDetails: (playerId: string, unitId: string) => void
}

function statusLabel(item: ContextItem): string {
  switch (item.status) {
    case 'BLOCKING': return 'Resolve now'
    case 'AVAILABLE': return 'Available'
    case 'DONE': return 'Handled'
    case 'WARNING': return 'Warning'
    case 'REQUIRED': return 'Required'
    default: return 'Information'
  }
}

function sourceLabel(item: ContextItem): string {
  return item.source.replace('_', ' ').toLocaleLowerCase()
}

export function ContextCommandCentre({
  context,
  session,
  dispatch,
  focusItemId,
  onStartMissionAction,
  onMulligan,
  onOpenEndTurn,
  onUseStratagem,
  onHoldReaction,
  onPassReaction,
  onChangePlan,
  onResolveEliminationChoice,
  onSelectPriorityCandidates,
  onChoosePriorityTarget,
  onOpenArmyDetails,
}: Props) {
  const [panel, setPanel] = useState<PanelState>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [candidateIds, setCandidateIds] = useState<string[]>([])
  const playerId = session.state.activePlayerId
  const secondary = getSecondaryState(session)[playerId]
  const pendingChoice = getPendingEliminationChoice(session, playerId)
  const priorityCard = secondary?.active.find((card) => card.cardId === 'CEL_PRIORYTETOWY')
  const selectedPriorityCandidates = priorityCard?.cardSpecificState?.priorityCandidateUnitIds ?? []
  const priorityTargetId = priorityCard?.cardSpecificState?.priorityTargetUnitId
  const priorityCandidates = getPriorityTargetCandidates(session, playerId).filter((candidate) => candidate.eligible)
  const visibleSections = useMemo(() => context.sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !dismissed.has(item.id)),
  })).filter((section) => section.items.length > 0), [context.sections, dismissed])

  useEffect(() => {
    if (!focusItemId) return
    const target = document.getElementById(`context-${focusItemId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target?.focus({ preventScroll: true })
  }, [focusItemId])

  function toggleCandidate(unitId: string) {
    setCandidateIds((current) => current.includes(unitId)
      ? current.filter((id) => id !== unitId)
      : current.length < 2 ? [...current, unitId] : current)
  }

  function handleAction(item: ContextItem, itemAction: ContextAction) {
    switch (itemAction.type) {
      case 'GAIN_COMMAND_POINT':
        dispatch({ type: 'CP_GAINED', payload: { playerId, amount: 1 } })
        break
      case 'OPEN_RIVAL_ARMY':
        setPanel({ type: 'army', playerId: itemAction.playerId, secondaryId: itemAction.secondaryId as SecondaryId | undefined })
        break
      case 'OPEN_UNIT':
        setPanel({ type: 'army', playerId: itemAction.playerId, unitId: itemAction.unitId })
        break
      case 'CHANGE_OBJECTIVE_CONTROL': setPanel({ type: 'objectives' }); break
      case 'START_MISSION_ACTION': setPanel({ type: 'mission', secondaryId: itemAction.secondaryId as SecondaryId }); break
      case 'CHECK_SECONDARY_CONDITION':
      case 'END_TURN': onOpenEndTurn(); break
      case 'SELECT_PRIORITY_TARGET': setPanel({ type: 'priority' }); break
      case 'RESOLVE_ELIMINATION_CHOICE': setPanel({ type: 'elimination' }); break
      case 'MULLIGAN_SECONDARY': setPanel({ type: 'mulligan' }); break
      case 'CHANGE_OPERATIONAL_PLAN': setPanel({ type: 'plan' }); break
      case 'OPEN_STRATAGEMS': setPanel({ type: 'stratagems' }); break
      case 'USE_STRATAGEM': {
        const option = context.relevantStratagems.find(({ definition }) => definition.id === itemAction.stratagemId)
        if (option) onUseStratagem(option.availability)
        break
      }
      case 'HOLD_REACTION': if (itemAction.playerId) onHoldReaction(itemAction.playerId); break
      case 'PASS_REACTION': if (itemAction.playerId && itemAction.reactionWindowId) onPassReaction(itemAction.reactionWindowId, itemAction.playerId); break
      case 'DISMISS': setDismissed((current) => new Set(current).add(item.id)); break
      default: break
    }
  }

  function useContextStratagem(option: RelevantStratagem) {
    onUseStratagem(option.availability)
    if (option.availability.canUse) setPanel(null)
  }

  return <section className={`context-centre context-centre--${context.guidanceLevel}`}>
    <div className="context-centre__heading">
      <div><span className="eyebrow">What matters now</span><h2>{context.phase.replace('_', ' ')} context</h2></div>
      {context.blockingItems.length > 0
        ? <span className="context-blocker-count">{context.blockingItems.length} to resolve</span>
        : <span className="context-clear">Safe to advance</span>}
    </div>

    {visibleSections.map((section) => <section className={`context-section context-section--${section.id}`} key={section.id}>
      <h3>{section.title}</h3>
      <div className="context-item-list">{section.items.map((item) => <article
        className={`context-item context-item--${item.severity.toLowerCase()} context-item--${item.status.toLowerCase()}`}
        id={`context-${item.id}`}
        key={item.id}
        tabIndex={-1}
      >
        <div className="context-item__top"><span>{sourceLabel(item)}</span><strong>{statusLabel(item)}</strong></div>
        <h4>{item.title}</h4>
        <p>{item.shortDescription}</p>
        {item.details && item.details.length > 0 && <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}
        {item.actions.length > 0 && <div className="context-item__actions">{item.actions.map((itemAction) => <button
          className={item.status === 'BLOCKING' && itemAction.type !== 'DISMISS' ? 'button--gold' : ''}
          key={itemAction.id}
          onClick={() => handleAction(item, itemAction)}
        >{itemAction.label}</button>)}</div>}
      </article>)}</div>
    </section>)}

    {visibleSections.length === 0 && <p className="context-empty">No action requires attention in this phase.</p>}

    {panel?.type === 'army' && <ArmyQuickPanel
      session={session}
      playerId={panel.playerId}
      unitId={panel.unitId}
      secondaryId={panel.secondaryId}
      dispatch={dispatch}
      onClose={() => setPanel(null)}
      onDetails={(ownerId, unitId) => { setPanel(null); onOpenArmyDetails(ownerId, unitId) }}
    />}
    {panel?.type === 'objectives' && <ObjectiveQuickPanel session={session} dispatch={dispatch} onClose={() => setPanel(null)} />}
    {panel?.type === 'mission' && <MissionActionLauncher
      session={session}
      secondaryId={panel.secondaryId}
      onStart={(input) => { onStartMissionAction(input); setPanel(null) }}
      onClose={() => setPanel(null)}
    />}
    {panel?.type === 'mulligan' && <ContextOverlay title="Select a card to replace" eyebrow="Free mulligan" onClose={() => setPanel(null)}>
      <div className="context-choice-list">{secondary.active.map((card) => <button key={card.cardId} onClick={() => { onMulligan(playerId, card.cardId); setPanel(null) }}>{card.cardId in Object ? card.cardId : card.cardId}</button>)}</div>
    </ContextOverlay>}
    {panel?.type === 'elimination' && <ContextOverlay title="Choose one Secondary" eyebrow="One kill · one card" onClose={() => setPanel(null)}>
      {pendingChoice ? <><p>{pendingChoice.destroyedUnitName} can complete multiple cards.</p><div className="context-choice-list">{pendingChoice.options.map((option) => <button className="button--gold" key={option.cardId} onClick={() => { onResolveEliminationChoice(playerId, option.cardId); setPanel(null) }}>{option.name}<span>{option.vp} VP</span></button>)}</div></> : <p className="context-note">The decision is no longer pending.</p>}
    </ContextOverlay>}
    {panel?.type === 'priority' && <ContextOverlay title="Priority Target" eyebrow="Current Rival decision" onClose={() => setPanel(null)}>
      {!priorityCard || priorityTargetId ? <p className="context-note">Priority Target selection is already resolved.</p>
        : selectedPriorityCandidates.length !== 2 ? <>
          <p>Select two eligible Rival units worth at least 10% of their starting army.</p>
          <div className="priority-target-list">{priorityCandidates.map((candidate) => <label key={candidate.unitId}><input type="checkbox" checked={candidateIds.includes(candidate.unitId)} onChange={() => toggleCandidate(candidate.unitId)} /><span><strong>{candidate.name}</strong><small>{candidate.points} pts</small></span></label>)}</div>
          <button className="button--gold button--wide" disabled={candidateIds.length !== 2} onClick={() => onSelectPriorityCandidates(playerId, candidateIds)}>Confirm two targets</button>
        </> : <><p>The current Rival chooses one target.</p><div className="context-choice-list">{priorityCandidates.filter((candidate) => selectedPriorityCandidates.includes(candidate.unitId)).map((candidate) => <button key={candidate.unitId} onClick={() => { onChoosePriorityTarget(playerId, candidate.unitId); setPanel(null) }}>{candidate.name}<span>{candidate.points} pts</span></button>)}</div></>}
    </ContextOverlay>}
    {panel?.type === 'stratagems' && <ContextOverlay title="Potential Stratagems" eyebrow={`${context.phase.replace('_', ' ')} phase`} onClose={() => setPanel(null)}>
      <div className="context-stratagem-list">{context.relevantStratagems.map((option) => <article key={option.definition.id}>
        <div><strong>{option.definition.name}</strong><span>{option.definition.cpCost} CP · {option.classification.toLocaleLowerCase()}</span></div>
        <p>{option.manualConfirmationRequired ? 'Timing requires player confirmation.' : option.definition.timing ?? 'Structured timing available.'}</p>
        {!option.availability.canUse && <small>{option.availability.reasons.join(' ')}</small>}
        <div><button className="button--gold" disabled={!option.availability.canUse} onClick={() => useContextStratagem(option)}>{option.manualConfirmationRequired ? 'Trigger applies' : 'Use Stratagem'}</button>{option.manualConfirmationRequired && <button onClick={() => { setDismissed((current) => new Set(current).add(`stratagems-${playerId}-${context.phase}`)); setPanel(null) }}>Not now</button>}</div>
      </article>)}</div>
    </ContextOverlay>}
    {panel?.type === 'plan' && <ContextOverlay title="Operational Plan" eyebrow="Command option" onClose={() => setPanel(null)}><CauldronPlanPanel session={session} onChangePlan={(ownerId, planId) => { onChangePlan(ownerId, planId); setPanel(null) }} /></ContextOverlay>}
  </section>
}

function ContextOverlay({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><aside className="quick-panel" role="dialog" aria-modal="true"><div className="quick-panel__heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose}>Close</button></div>{children}</aside></div>
}
