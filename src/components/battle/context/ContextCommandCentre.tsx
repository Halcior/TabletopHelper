import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { StartMissionActionInput } from '../../../domain/battle/missionActions'
import type { BattleEventInput, BattleSession } from '../../../domain/battle/types'
import type { BattleContext, ContextAction, ContextItem, RelevantStratagem } from '../../../domain/context'
import type { StratagemAvailability } from '../../../domain/stratagems/types'
import { getCurrentRivalPlayerId } from '../../../rulesets/cauldronFFA3'
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
  sharedMode?: boolean
  viewerPlayerId?: string | null
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
  return item.source.replaceAll('_', ' ').toLocaleLowerCase()
}

function phaseLabel(phase: BattleContext['phase']): string {
  return phase.replaceAll('_', ' ').toLocaleLowerCase().replace(/^./, (letter) => letter.toLocaleUpperCase())
}

function stratagemContextCopy(options: RelevantStratagem[]): { title: string; description: string } {
  const availableNow = options.filter((option) => !option.manualConfirmationRequired && option.availability.canUse).length
  const unverified = options.filter((option) => option.manualConfirmationRequired && option.availability.canUse).length
  if (availableNow > 0 && unverified > 0) return {
    title: `${availableNow} available now · ${unverified} timing to confirm`,
    description: 'Confirmed timing is shown separately from phase-only matches.',
  }
  if (availableNow > 0) return {
    title: `${availableNow} Stratagem${availableNow === 1 ? '' : 's'} available now`,
    description: 'Structured timing matches the current game context.',
  }
  if (unverified > 0) return {
    title: `${unverified} Stratagem${unverified === 1 ? '' : 's'} with timing to confirm`,
    description: 'These match the phase, but the exact trigger is not structured.',
  }
  return {
    title: 'Stratagem references',
    description: 'No listed Stratagem is currently confirmed as usable.',
  }
}

function hideQuietReaction(item: ContextItem): boolean {
  return item.type === 'REACTION_STATUS' && item.status === 'INFO' && item.actions.length === 0
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
    case 'OPEN_STRATAGEMS':
    case 'DISMISS':
      return true
    case 'HOLD_REACTION':
    case 'PASS_REACTION':
      return Boolean(viewerPlayerId && itemAction.playerId === viewerPlayerId)
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
  const [expanded, setExpanded] = useState(false)
  const playerId = session.state.activePlayerId
  const viewerControlsTurn = !sharedMode || viewerPlayerId === playerId
  const rivalPlayerId = getCurrentRivalPlayerId(session, playerId)
  const secondary = getSecondaryState(session)[playerId]
  const pendingChoice = getPendingEliminationChoice(session, playerId)
  const priorityCard = secondary?.active.find((card) => card.cardId === 'CEL_PRIORYTETOWY')
  const selectedPriorityCandidates = priorityCard?.cardSpecificState?.priorityCandidateUnitIds ?? []
  const priorityTargetId = priorityCard?.cardSpecificState?.priorityTargetUnitId
  const priorityCandidates = getPriorityTargetCandidates(session, playerId).filter((candidate) => candidate.eligible)
  const priorityWaitingForRival = selectedPriorityCandidates.length === 2 && !priorityTargetId
  const availableSections = useMemo(() => context.sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !dismissed.has(item.id) && !hideQuietReaction(item)),
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
  const stratagemOptions = useMemo(() => [...context.relevantStratagems].sort((left, right) => (
    Number(left.manualConfirmationRequired) - Number(right.manualConfirmationRequired)
  )), [context.relevantStratagems])
  const stratagemCopy = stratagemContextCopy(context.relevantStratagems)

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
      : current.length < 2 ? [...current, unitId] : current)
  }

  function viewerCanUseAction(itemAction: ContextAction): boolean {
    if (itemAction.type === 'SELECT_PRIORITY_TARGET' && priorityWaitingForRival) {
      return !sharedMode || viewerPlayerId === rivalPlayerId
    }
    return canViewerUseAction(itemAction, playerId, sharedMode, viewerPlayerId)
  }

  function handleAction(item: ContextItem, itemAction: ContextAction) {
    if (!viewerCanUseAction(itemAction)) return
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
      case 'START_MISSION_ACTION': setPanel({
        type: 'mission',
        secondaryId: itemAction.secondaryId as SecondaryId | undefined,
        missionActionType: itemAction.missionActionType === 'SABOTAGE' ? 'SABOTAGE' : undefined,
      }); break
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
    if (!viewerControlsTurn) return
    onUseStratagem(option.availability)
    if (option.availability.canUse) setPanel(null)
  }

  return <section className={`context-centre context-centre--${context.guidanceLevel}`}>
    <LatestBattleUpdateCard session={session} />

    <div className="context-centre__heading">
      <div><span className="eyebrow">What matters now</span><h2>{phaseLabel(context.phase)} priorities</h2></div>
      {sharedMode && !viewerControlsTurn
        ? <span className="context-clear">Watching {session.state.players[playerId]?.name ?? 'active player'}</span>
        : context.blockingItems.length > 0
          ? <span className="context-blocker-count">{context.blockingItems.length} to resolve</span>
          : <span className="context-clear">Safe to advance</span>}
    </div>

    {visibleSections.map((section) => <section className={`context-section context-section--${section.id}`} key={section.id}>
      <h3>{section.title}</h3>
      <div className="context-item-list">{section.items.map((item) => {
        const isStratagemSummary = item.type === 'AVAILABLE_STRATAGEMS'
        return <article
          className={`context-item context-item--${item.severity.toLowerCase()} context-item--${item.status.toLowerCase()}`}
          id={`context-${item.id}`}
          key={item.id}
          tabIndex={-1}
        >
          <div className="context-item__top"><span>{sourceLabel(item)}</span><strong>{statusLabel(item)}</strong></div>
          <h4>{isStratagemSummary ? stratagemCopy.title : item.title}</h4>
          <p>{isStratagemSummary ? stratagemCopy.description : item.shortDescription}</p>
          {item.details && item.details.length > 0 && <ul>{item.details.map((detail) => <li key={detail}>{detail.replace('confirm timing', 'timing unverified')}</li>)}</ul>}
          {item.actions.length > 0 && <div className="context-item__actions">{item.actions.map((itemAction) => {
            const allowed = viewerCanUseAction(itemAction)
            const priorityOwner = itemAction.type === 'SELECT_PRIORITY_TARGET' && priorityWaitingForRival
              ? session.state.players[rivalPlayerId]?.name ?? 'the current Rival'
              : session.state.players[playerId]?.name ?? 'the active player'
            return <button
              className={item.status === 'BLOCKING' && itemAction.type !== 'DISMISS' ? 'button--gold' : ''}
              disabled={!allowed}
              title={!allowed ? `This action belongs to ${priorityOwner} or another responding player.` : undefined}
              key={itemAction.id}
              onClick={() => handleAction(item, itemAction)}
            >{itemAction.type === 'SELECT_PRIORITY_TARGET' && priorityWaitingForRival && !allowed ? `Waiting for ${priorityOwner}` : itemAction.label}</button>
          })}</div>}
        </article>
      })}</div>
    </section>)}

    {visibleSections.length === 0 && <p className="context-empty">Nothing requires attention in this phase.</p>}

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
    {panel?.type === 'priority' && <ContextOverlay title="Priority Target" eyebrow={priorityWaitingForRival ? 'Current Rival decision' : 'Choose candidate targets'} onClose={() => setPanel(null)}>
      {!priorityCard || priorityTargetId ? <p className="context-note">Priority Target selection is already resolved.</p>
        : selectedPriorityCandidates.length !== 2 ? <>
          <p>Select two eligible Rival units worth at least 10% of their starting army.</p>
          <div className="priority-target-list">{priorityCandidates.map((candidate) => <label key={candidate.unitId}><input type="checkbox" checked={candidateIds.includes(candidate.unitId)} onChange={() => toggleCandidate(candidate.unitId)} /><span><strong>{candidate.name}</strong><small>{candidate.points} pts</small></span></label>)}</div>
          <button className="button--gold button--wide" disabled={candidateIds.length !== 2} onClick={() => onSelectPriorityCandidates(playerId, candidateIds)}>Confirm two targets</button>
        </> : <><p>{session.state.players[rivalPlayerId]?.name ?? 'The current Rival'} chooses one target on their device.</p><div className="context-choice-list">{priorityCandidates.filter((candidate) => selectedPriorityCandidates.includes(candidate.unitId)).map((candidate) => <button key={candidate.unitId} onClick={() => { onChoosePriorityTarget(playerId, candidate.unitId); setPanel(null) }}>{candidate.name}<span>{candidate.points} pts</span></button>)}</div></>}
    </ContextOverlay>}
    {panel?.type === 'stratagems' && <ContextOverlay title="Stratagems in this phase" eyebrow={`${phaseLabel(context.phase)} phase`} onClose={() => setPanel(null)}>
      {!viewerControlsTurn && <p className="context-note">You can review these Stratagems, but only {session.state.players[playerId]?.name ?? 'the active player'} can spend CP on their turn.</p>}
      <div className="context-stratagem-list">{stratagemOptions.map((option) => <article className={option.manualConfirmationRequired ? 'context-stratagem context-stratagem--unverified' : 'context-stratagem'} key={option.definition.id}>
        <div><strong>{option.definition.name}</strong><span>{option.definition.cpCost} CP · {option.classification.toLocaleLowerCase()}</span></div>
        <span className={`stratagem-confidence ${option.manualConfirmationRequired ? 'stratagem-confidence--unverified' : 'stratagem-confidence--exact'}`}>{option.manualConfirmationRequired ? 'Timing unverified' : 'Available timing matched'}</span>
        <p>{option.definition.description || (option.manualConfirmationRequired ? 'Timing requires player confirmation.' : 'Structured timing available.')}</p>
        {option.manualConfirmationRequired && <small>Phase matches, but the exact trigger is not structured. Confirm the timing at the table before spending CP.</small>}
        {!option.availability.canUse && <small>{option.availability.reasons.join(' ')}</small>}
        <div><button className="button--gold" disabled={!option.availability.canUse || !viewerControlsTurn} onClick={() => useContextStratagem(option)}>{!viewerControlsTurn ? 'Active player only' : option.manualConfirmationRequired ? 'Confirm timing & use' : 'Use Stratagem'}</button>{option.manualConfirmationRequired && <button onClick={() => { setDismissed((current) => new Set(current).add(`stratagems-${playerId}-${context.phase}`)); setPanel(null) }}>Not now</button>}</div>
      </article>)}</div>
    </ContextOverlay>}
    {panel?.type === 'plan' && <ContextOverlay title="Operational Plan" eyebrow="Command option" onClose={() => setPanel(null)}><CauldronPlanPanel session={session} onChangePlan={(ownerId, planId) => { onChangePlan(ownerId, planId); setPanel(null) }} /></ContextOverlay>}
  </section>
}

function ContextOverlay({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return <div className="quick-panel-layer" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><aside className="quick-panel" role="dialog" aria-modal="true"><div className="quick-panel__heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><button onClick={onClose}>Close</button></div>{children}</aside></div>
}
