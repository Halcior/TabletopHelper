import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StartMissionActionInput } from '../../../domain/battle/missionActions'
import type { BattleEventInput, BattleSession } from '../../../domain/battle/types'
import { doublesScorekeeperId } from '../../../domain/battle/doubles'
import type { BattleContext, ContextAction, ContextItem } from '../../../domain/context'
import { getCurrentRivalPlayerId, isDuelPrimary } from '../../../rulesets/cauldronFFA3'
import { useBattleStore } from '../../../stores/battleStore'
import {
  getPendingEliminationChoice,
  getPriorityTargetCandidates,
  getSecondaryState,
} from '../../../rulesets/cauldronFFA3/secondary'
import { CAULDRON_SECONDARY_BY_ID } from '../../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../../rulesets/cauldronFFA3/secondaryTypes'
import type { OperationalPlanId } from '../../../rulesets/cauldronFFA3/types'
import { CauldronPlanPanel } from '../CauldronPlanPanel'
import { MissionActionLauncher } from '../MissionActionLauncher'
import { ArmyQuickPanel } from '../quickPanels/ArmyQuickPanel'
import { ObjectiveQuickPanel } from '../quickPanels/ObjectiveQuickPanel'
import { LatestBattleUpdateCard } from './LatestBattleUpdateCard'

type PanelState =
  | { type: 'army'; playerId?: string; unitId?: string; secondaryId?: SecondaryId }
  | { type: 'objectives' }
  | { type: 'mission'; secondaryId?: SecondaryId; missionActionType?: 'SABOTAGE' }
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
  sharedMode?: boolean
  viewerPlayerId?: string | null
  onStartMissionAction: (input: StartMissionActionInput) => void
  onMulligan: (playerId: string, cardId: SecondaryId) => void
  onOpenEndTurn: () => void
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
  return item.source.replaceAll('_', ' ').toLocaleLowerCase()
}

function phaseLabel(phase: BattleContext['phase']): string {
  return phase.replaceAll('_', ' ').toLocaleLowerCase().replace(/^./, (letter) => letter.toLocaleUpperCase())
}

function canViewerUseAction(
  itemAction: ContextAction,
  activePlayerId: string,
  sharedMode: boolean,
  viewerPlayerId: string | null,
): boolean {
  if (!sharedMode) return true
  switch (itemAction.type) {
    case 'OPEN_RIVAL_ARMY':
    case 'OPEN_UNIT':
    case 'CHANGE_OBJECTIVE_CONTROL':
    case 'DISMISS':
      return true
    default:
      return viewerPlayerId === activePlayerId
  }
}

export function ContextCommandCentre({
  context,
  session,
  dispatch,
  focusItemId,
  sharedMode = false,
  viewerPlayerId = null,
  onStartMissionAction,
  onMulligan,
  onOpenEndTurn,
  onChangePlan,
  onResolveEliminationChoice,
  onSelectPriorityCandidates,
  onChoosePriorityTarget,
  onOpenArmyDetails,
}: Props) {
  const [panel, setPanel] = useState<PanelState>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const [candidateIds, setCandidateIds] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)
  const playerId = session.state.activePlayerId
  const viewerControlsTurn = !sharedMode || Boolean(viewerPlayerId && doublesScorekeeperId(session.setup, viewerPlayerId) === playerId)
  const rivalPlayerId = getCurrentRivalPlayerId(session, playerId)
  const secondary = getSecondaryState(session)[playerId]
  const pendingChoice = getPendingEliminationChoice(session, playerId)
  const priorityCard = secondary?.active.find((card) => card.cardId === 'CEL_PRIORYTETOWY')
  const selectedPriorityCandidates = priorityCard?.cardSpecificState?.priorityCandidateUnitIds ?? []
  const priorityTargetId = priorityCard?.cardSpecificState?.priorityTargetUnitId
  const priorityCandidates = getPriorityTargetCandidates(session, playerId).filter((candidate) => candidate.eligible)
  const requiredAlphaCount = Math.min(3, priorityCandidates.length)
  const priorityNeedsAlpha = Boolean(priorityCard && selectedPriorityCandidates.length !== requiredAlphaCount)
  const gammaCandidates = priorityCandidates.filter((candidate) => !selectedPriorityCandidates.includes(candidate.unitId))
  const priorityNeedsGamma = Boolean(priorityCard && !priorityNeedsAlpha && !priorityTargetId && gammaCandidates.length > 0)
  const prioritySelectionResolved = Boolean(priorityCard && !priorityNeedsAlpha && !priorityNeedsGamma)
  const availableSections = useMemo(() => context.sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !dismissed.has(item.id) && item.source !== 'STRATAGEM' && item.source !== 'REACTION'),
  })).filter((section) => section.items.length > 0), [context.sections, dismissed])
  const visibleSections = useMemo(() => {
    if (expanded) return availableSections
    const blockingIds = new Set(availableSections.flatMap((section) => (
      section.items.filter((item) => item.status === 'BLOCKING').map((item) => item.id)
    )))
    const firstActionable = availableSections
      .flatMap((section) => section.items)
      .find((item) => !blockingIds.has(item.id) && ['REQUIRED', 'WARNING', 'AVAILABLE'].includes(item.status))
    const visibleIds = blockingIds.size > 0
      ? blockingIds
      : new Set(firstActionable ? [firstActionable.id] : availableSections[0]?.items[0] ? [availableSections[0].items[0].id] : [])
    return availableSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => visibleIds.has(item.id)),
    })).filter((section) => section.items.length > 0)
  }, [availableSections, expanded])
  const hiddenItemCount = availableSections.reduce((sum, section) => sum + section.items.length, 0)
    - visibleSections.reduce((sum, section) => sum + section.items.length, 0)
  const blockerCount = availableSections.flatMap((section) => section.items).filter((item) => item.status === 'BLOCKING').length

  useEffect(() => {
    setDismissed(new Set())
    setPanel(null)
    setCandidateIds([])
    setExpanded(false)
  }, [session.state.activePlayerId, session.state.round, session.state.phase])

  useEffect(() => {
    if (!focusItemId) return
    const target = document.getElementById(`context-${focusItemId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target?.focus({ preventScroll: true })
  }, [focusItemId])

  function toggleCandidate(unitId: string) {
    setCandidateIds((current) => current.includes(unitId)
      ? current.filter((id) => id !== unitId)
      : current.length < requiredAlphaCount ? [...current, unitId] : current)
  }

  function viewerCanUseAction(itemAction: ContextAction): boolean {
    if (itemAction.type === 'SELECT_PRIORITY_TARGET' && priorityNeedsAlpha) {
      return !sharedMode || viewerPlayerId === rivalPlayerId
    }
    if (itemAction.type === 'SELECT_PRIORITY_TARGET' && priorityNeedsGamma) {
      return !sharedMode || viewerPlayerId === playerId
    }
    if (session.setup.doubles && viewerControlsTurn && itemAction.type !== 'PASS_REACTION') return true
    return canViewerUseAction(itemAction, playerId, sharedMode, viewerPlayerId)
  }

  function handleAction(item: ContextItem, itemAction: ContextAction) {
    if (!viewerCanUseAction(itemAction)) return
    switch (itemAction.type) {
      case 'GAIN_COMMAND_POINT':
        if (isDuelPrimary(session)) useBattleStore.getState().grantCommandPhaseCp()
        else dispatch({ type: 'CP_GAINED', payload: { playerId, amount: 1 } })
        break
      case 'OPEN_RIVAL_ARMY':
        setPanel({ type: 'army', playerId: itemAction.playerId, secondaryId: itemAction.secondaryId as SecondaryId | undefined })
        break
      case 'OPEN_UNIT':
        setPanel({ type: 'army', playerId: itemAction.playerId, unitId: itemAction.unitId })
        break
      case 'CHANGE_OBJECTIVE_CONTROL': setPanel({ type: 'objectives' }); break
      case 'START_MISSION_ACTION': setPanel({
        type: 'mission',
        secondaryId: itemAction.secondaryId as SecondaryId | undefined,
        missionActionType: itemAction.missionActionType === 'SABOTAGE' ? 'SABOTAGE' : undefined,
      }); break
      case 'CHECK_SECONDARY_CONDITION':
      case 'END_TURN': onOpenEndTurn(); break
      case 'SELECT_PRIORITY_TARGET':
        setCandidateIds(selectedPriorityCandidates)
        setPanel({ type: 'priority' })
        break
      case 'RESOLVE_ELIMINATION_CHOICE': setPanel({ type: 'elimination' }); break
      case 'MULLIGAN_SECONDARY': setPanel({ type: 'mulligan' }); break
      case 'CHANGE_OPERATIONAL_PLAN': setPanel({ type: 'plan' }); break
      case 'DISMISS': setDismissed((current) => new Set(current).add(item.id)); break
      default: break
    }
  }

  return <section className={`context-centre context-centre--${context.guidanceLevel}${visibleSections.length === 0 ? " context-centre--idle" : ""}`}>

    <div className="context-centre__heading">
      <div><span className="eyebrow">What matters now</span><h2>{phaseLabel(context.phase)} priorities</h2></div>
      {sharedMode && !viewerControlsTurn
        ? <span className="context-clear">Watching {session.state.players[playerId]?.name ?? 'active player'}</span>
        : blockerCount > 0
          ? <span className="context-blocker-count">{blockerCount} to resolve</span>
          : <span className="context-clear">Safe to advance</span>}
    </div>

    {visibleSections.map((section) => <section className={`context-section context-section--${section.id}`} key={section.id}>
      <h3 className={visibleSections.length === 1 ? 'sr-only' : undefined}>{section.title}</h3>
      <div className="context-item-list">{section.items.map((item) => {
        return <article
          className={`context-item context-item--${item.severity.toLowerCase()} context-item--${item.status.toLowerCase()}`}
          id={`context-${item.id}`}
          key={item.id}
          tabIndex={-1}
        >
          <div className="context-item__top"><span>{sourceLabel(item)}</span><strong>{statusLabel(item)}</strong></div>
          <h4>{item.title}</h4>
          <p>{item.shortDescription}</p>
          {item.details && item.details.length > 0 && (['BLOCKING', 'REQUIRED'].includes(item.status) ? <ul>{item.details.map((detail) => <li key={detail}>{detail.replace('confirm timing', 'timing unverified')}</li>)}</ul> : <details className="context-item__more"><summary>Timing & details</summary><ul>{item.details.map((detail) => <li key={detail}>{detail.replace('confirm timing', 'timing unverified')}</li>)}</ul></details>)}
          {item.actions.length > 0 && <div className="context-item__actions">{item.actions.map((itemAction) => {
            const allowed = viewerCanUseAction(itemAction)
            const priorityOwner = itemAction.type === 'SELECT_PRIORITY_TARGET' && priorityNeedsAlpha
              ? session.state.players[rivalPlayerId]?.name ?? 'the current Rival'
              : session.state.players[playerId]?.name ?? 'the active player'
            return <button
              className={item.status === 'BLOCKING' && itemAction.type !== 'DISMISS' ? 'button--gold' : ''}
              disabled={!allowed}
              title={!allowed ? `This action belongs to ${priorityOwner} or another responding player.` : undefined}
              key={itemAction.id}
              onClick={() => handleAction(item, itemAction)}
            >{itemAction.type === 'SELECT_PRIORITY_TARGET' && !allowed ? `Waiting for ${priorityOwner}` : itemAction.label}</button>
          })}</div>}
        </article>
      })}</div>
    </section>)}

    {visibleSections.length === 0 && <p className="context-empty">Nothing requires attention in this phase.</p>}
    <LatestBattleUpdateCard session={session} />

    {(hiddenItemCount > 0 || expanded) && <button
      className="context-expand"
      type="button"
      aria-expanded={expanded}
      onClick={() => setExpanded((current) => !current)}
    >{expanded ? 'Show only priorities' : `Show ${hiddenItemCount} more reminder${hiddenItemCount === 1 ? '' : 's'}`}</button>}

    {panel?.type === 'army' && <ArmyQuickPanel
      session={session}
      playerId={panel.playerId}
      unitId={panel.unitId}
      secondaryId={panel.secondaryId}
      dispatch={dispatch}
      sharedMode={sharedMode}
      viewerPlayerId={viewerPlayerId}
      onClose={() => setPanel(null)}
      onDetails={(ownerId, unitId) => { setPanel(null); onOpenArmyDetails(ownerId, unitId) }}
    />}
    {panel?.type === 'objectives' && <ObjectiveQuickPanel session={session} dispatch={dispatch} onClose={() => setPanel(null)} />}
    {panel?.type === 'mission' && <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPanel(null) }}><aside className="quick-panel" role="dialog" aria-modal="true"><MissionActionLauncher
      session={session}
      secondaryId={panel.secondaryId}
      missionActionType={panel.missionActionType}
      onStart={(input) => { onStartMissionAction(input); setPanel(null) }}
      onClose={() => setPanel(null)}
    /></aside></div>}
    {panel?.type === 'mulligan' && <ContextOverlay title="Select a card to replace" eyebrow="Free mulligan" onClose={() => setPanel(null)}>
      <div className="context-choice-list">{secondary?.active.map((card) => <button key={card.cardId} onClick={() => { onMulligan(playerId, card.cardId); setPanel(null) }}>{CAULDRON_SECONDARY_BY_ID[card.cardId].name}<span>{CAULDRON_SECONDARY_BY_ID[card.cardId].vp} VP</span></button>)}</div>
    </ContextOverlay>}
    {panel?.type === 'elimination' && <ContextOverlay title="Choose one Secondary" eyebrow="One kill · one card" onClose={() => setPanel(null)}>
      {pendingChoice ? <><p>{pendingChoice.destroyedUnitName} can complete multiple cards.</p><div className="context-choice-list">{pendingChoice.options.map((option) => <button className="button--gold" key={option.cardId} onClick={() => { onResolveEliminationChoice(playerId, option.cardId); setPanel(null) }}>{option.name}<span>{option.vp} VP</span></button>)}</div></> : <p className="context-note">The decision is no longer pending.</p>}
    </ContextOverlay>}
    {panel?.type === 'priority' && <ContextOverlay
      title="Cel Priorytetowy"
      eyebrow={priorityNeedsAlpha ? 'Rival chooses Alpha' : priorityNeedsGamma ? 'Choose Gamma' : 'Targets locked'}
      onClose={() => setPanel(null)}
    >
      {!priorityCard ? <p className="context-note">Cel Priorytetowy is no longer active.</p>
        : priorityNeedsAlpha ? <>
          <p><strong>{session.state.players[rivalPlayerId]?.name ?? 'The marked Rival'}</strong> selects {requiredAlphaCount} Alpha target{requiredAlphaCount === 1 ? '' : 's'} from their living units.</p>
          {sharedMode && viewerPlayerId !== rivalPlayerId && <p className="context-note">Waiting for the marked Rival to nominate Alpha targets on their device.</p>}
          <div className="priority-target-list">{priorityCandidates.map((candidate) => <label key={candidate.unitId}>
            <input
              type="checkbox"
              disabled={sharedMode && viewerPlayerId !== rivalPlayerId}
              checked={candidateIds.includes(candidate.unitId)}
              onChange={() => toggleCandidate(candidate.unitId)}
            />
            <span><strong>{candidate.name}</strong><small>{candidate.points} pts</small></span>
          </label>)}</div>
          <button
            className="button--gold button--wide"
            disabled={candidateIds.length !== requiredAlphaCount || (sharedMode && viewerPlayerId !== rivalPlayerId)}
            onClick={() => onSelectPriorityCandidates(playerId, candidateIds)}
          >Confirm {requiredAlphaCount} Alpha target{requiredAlphaCount === 1 ? '' : 's'}</button>
        </> : priorityNeedsGamma ? <>
          <p>Now <strong>{session.state.players[playerId]?.name ?? 'the active player'}</strong> selects one different living unit as Gamma.</p>
          {sharedMode && viewerPlayerId !== playerId && <p className="context-note">Waiting for the active player to choose Gamma on their device.</p>}
          <div className="context-choice-list">{gammaCandidates.map((candidate) => <button
            disabled={sharedMode && viewerPlayerId !== playerId}
            key={candidate.unitId}
            onClick={() => { onChoosePriorityTarget(playerId, candidate.unitId); setPanel(null) }}
          >{candidate.name}<span>{candidate.points} pts</span></button>)}</div>
        </> : prioritySelectionResolved ? <p className="context-note">Alpha targets are locked{priorityTargetId ? ' and Gamma is selected' : '; no separate Gamma target is available'}. Score this card at the end of the current turn.</p>
          : <p className="context-note">Target selection is already resolved.</p>}
    </ContextOverlay>}
    {panel?.type === 'plan' && <ContextOverlay title="Operational Plan" eyebrow="Command option" onClose={() => setPanel(null)}><CauldronPlanPanel session={session} onChangePlan={(ownerId, planId) => { onChangePlan(ownerId, planId); setPanel(null) }} /></ContextOverlay>}
  </section>
}

function ContextOverlay({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><aside className="quick-panel" role="dialog" aria-modal="true"><div className="quick-panel__heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose}>Close</button></div>{children}</aside></div>
}
