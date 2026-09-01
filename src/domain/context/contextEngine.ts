import type { BattlePhase, BattleSession } from '../battle/types'
import { getCurrentReactionWindow } from '../stratagems/battleIntegration'
import { CAULDRON_RULESET_ID } from '../../rulesets/cauldronFFA3'
import {
  canChangeOperationalPlan,
  evaluateOperationalPlan,
  getOperationalPlanState,
} from '../../rulesets/cauldronFFA3/operationalPlans'
import { CAULDRON_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { ActiveSecondaryView, SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import {
  getRoundSecondaryVp,
  getSecondaryState,
  isMulliganAvailable,
} from '../../rulesets/cauldronFFA3/secondary'
import {
  selectActiveMissionActions,
  selectActivePlayer,
  selectActiveSecondaries,
  selectCommandPointRecordedThisTurn,
  selectCompletedSecondariesThisTurn,
  selectCurrentRival,
  selectReactionPlayers,
  selectRelevantStratagems,
  selectSecondaryBlockers,
} from './selectors'
import type {
  BattleContext,
  BuildBattleContextInput,
  ContextAction,
  ContextItem,
  ContextSection,
} from './types'

function action(id: string, type: ContextAction['type'], label: string, data: Partial<ContextAction> = {}): ContextAction {
  return { id, type, label, ...data }
}

function isSecondaryRelevant(cardId: SecondaryId, phase: BattlePhase): boolean {
  if (phase === 'COMMAND' || phase === 'END_TURN') return true
  if (phase === 'MOVEMENT') return [
    'SZTURM_NA_POZYCJE', 'ZIEMIA_NICZYJA', 'DOMINACJA_CENTRUM', 'ZA_LINIAMI_WROGA', 'SZEROKI_FRONT',
    'ZABEZPIECZ_DANE', 'SKANOWANIE_SYGNALU', 'UTRZYMAJ_BAZE', 'PRESJA_TAKTYCZNA',
    'ODCIECIE_ODWROTU', 'CEL_PRIORYTETOWY',
  ].includes(cardId)
  if (phase === 'SHOOTING') return [
    'SILA_OGNIA', 'ZNISZCZ_KOLOSA', 'ELIMINACJA_DOWODCY', 'CEL_PRIORYTETOWY',
  ].includes(cardId)
  if (phase === 'FIGHT') return [
    'WALKA_W_ZWARCIU', 'ZNISZCZ_KOLOSA', 'ELIMINACJA_DOWODCY', 'CEL_PRIORYTETOWY',
  ].includes(cardId)
  return cardId === 'CEL_PRIORYTETOWY'
}

function secondaryAction(
  card: ActiveSecondaryView,
  playerId: string,
  phase: BattlePhase,
  rivalId?: string,
): ContextAction | null {
  switch (card.action) {
    case 'OPEN_RIVAL_ARMY': return action(`secondary-${card.cardId}-army`, 'OPEN_RIVAL_ARMY', 'Open Rival army', { playerId: rivalId, secondaryId: card.cardId })
    case 'QUICK_OBJECTIVES': return action(`secondary-${card.cardId}-objectives`, 'CHANGE_OBJECTIVE_CONTROL', 'Quick objectives', { playerId, secondaryId: card.cardId })
    case 'START_MISSION_ACTION': return action(`secondary-${card.cardId}-mission`, 'START_MISSION_ACTION', 'Start action', { playerId, secondaryId: card.cardId })
    case 'CHECK_CONDITION': return phase === 'END_TURN'
      ? action(`secondary-${card.cardId}-check`, 'CHECK_SECONDARY_CONDITION', 'Review scoring', { playerId, secondaryId: card.cardId })
      : null
    case 'SELECT_TARGET': return action(`secondary-${card.cardId}-target`, 'SELECT_PRIORITY_TARGET', 'Select target', { playerId, secondaryId: card.cardId })
    default: return null
  }
}

function secondaryItems(session: BattleSession): ContextItem[] {
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return []
  const playerId = session.state.activePlayerId
  const rival = selectCurrentRival(session, playerId)
  const blockerIds = new Set(selectSecondaryBlockers(session, playerId).map((blocker) => blocker.secondaryId))
  return selectActiveSecondaries(session, playerId).flatMap((card) => {
    const blocking = blockerIds.has(card.cardId)
    if (!blocking && !isSecondaryRelevant(card.cardId, session.state.phase)) return []
    const cardAction = secondaryAction(card, playerId, session.state.phase, rival?.id)
    const deferredEndTurnCheck = !blocking
      && card.action === 'CHECK_CONDITION'
      && session.state.phase !== 'END_TURN'
    const dismissible = session.setup.guidanceLevel === 'guided'
      && session.state.phase === 'MOVEMENT'
      && card.action === 'START_MISSION_ACTION'
    const itemId = `secondary-${card.cardId}-${session.state.phase}`
    return [{
      id: itemId,
      type: 'SECONDARY_GOAL',
      title: card.name,
      shortDescription: card.progress,
      status: blocking ? 'BLOCKING' : deferredEndTurnCheck ? 'INFO' : 'AVAILABLE',
      severity: blocking ? 'CRITICAL' : deferredEndTurnCheck ? 'QUIET' : 'ATTENTION',
      source: 'SECONDARY',
      phase: session.state.phase,
      relatedPlayerId: rival?.id,
      relatedSecondaryId: card.cardId,
      actions: [
        ...(cardAction ? [cardAction] : []),
        ...(dismissible ? [action(`dismiss-${itemId}`, 'DISMISS', 'Ignore for this phase')] : []),
      ],
      details: [card.objective, `${card.vp} VP`],
      dismissible,
    } satisfies ContextItem]
  })
}

function commandItems(session: BattleSession): ContextItem[] {
  if (session.state.phase !== 'COMMAND') return []
  const playerId = session.state.activePlayerId
  const cpRecorded = selectCommandPointRecordedThisTurn(session)
  const items: ContextItem[] = [{
    id: `command-cp-${playerId}`,
    type: 'COMMAND_POINT',
    title: cpRecorded ? '+1 Command Point recorded' : 'Gain 1 Command Point',
    shortDescription: cpRecorded ? 'The Command phase gain is already in the battle log.' : 'Record the Command phase CP gain.',
    status: cpRecorded ? 'DONE' : 'AVAILABLE',
    severity: cpRecorded ? 'QUIET' : 'ATTENTION',
    source: 'SYSTEM',
    phase: 'COMMAND',
    relatedPlayerId: playerId,
    actions: cpRecorded ? [] : [action('gain-command-cp', 'GAIN_COMMAND_POINT', '+1 CP', { playerId })],
  }]
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return items
  const activeCards = getSecondaryState(session)[playerId]?.active.length ?? 0
  items.push({
    id: `secondary-refill-${playerId}`,
    type: 'SECONDARY_REFILL',
    title: activeCards === 2 ? 'Secondary hand ready' : 'Secondary refill pending',
    shortDescription: `${activeCards} / 2 active cards. Refill is handled by the Battle Engine.`,
    status: activeCards === 2 ? 'DONE' : 'WARNING',
    severity: activeCards === 2 ? 'QUIET' : 'ATTENTION',
    source: 'SECONDARY',
    phase: 'COMMAND',
    relatedPlayerId: playerId,
    actions: [],
  })
  if (isMulliganAvailable(session, playerId)) items.push({
    id: `secondary-mulligan-${playerId}`,
    type: 'SECONDARY_MULLIGAN',
    title: 'Free mulligan available',
    shortDescription: 'Replace one active incomplete card immediately.',
    status: 'AVAILABLE',
    severity: 'INFO',
    source: 'SECONDARY',
    phase: 'COMMAND',
    relatedPlayerId: playerId,
    actions: [action('open-secondary-mulligan', 'MULLIGAN_SECONDARY', 'Mulligan', { playerId })],
  })
  return items
}

function missionActionItems(session: BattleSession): ContextItem[] {
  const phase = session.state.phase
  if (!['MOVEMENT', 'SHOOTING', 'CHARGE', 'END_TURN'].includes(phase)) return []
  return selectActiveMissionActions(session).map((mission) => {
    const restriction = phase === 'SHOOTING'
      ? 'Cannot Shoot while this Mission Action is active.'
      : phase === 'CHARGE'
        ? 'Cannot declare a charge while this Mission Action is active.'
        : phase === 'END_TURN'
          ? 'Resolve completion or failure during End Turn Review.'
          : 'Keep the unit eligible and in the required position.'
    return {
      id: `mission-action-${mission.id}-${phase}`,
      type: 'ACTIVE_MISSION_ACTION',
      title: `${mission.unitName} · ${mission.name}`,
      shortDescription: restriction,
      status: phase === 'SHOOTING' || phase === 'CHARGE' ? 'WARNING' : 'INFO',
      severity: phase === 'SHOOTING' || phase === 'CHARGE' ? 'ATTENTION' : 'INFO',
      source: 'MISSION_ACTION',
      phase,
      relatedPlayerId: mission.playerId,
      relatedUnitId: mission.unitId,
      relatedSecondaryId: mission.linkedSecondaryCardId,
      actions: [action(`open-unit-${mission.unitId}`, 'OPEN_UNIT', 'Open unit', {
        playerId: mission.playerId,
        unitId: mission.unitId,
      })],
    } satisfies ContextItem
  })
}

function planItems(session: BattleSession): ContextItem[] {
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return []
  const playerId = session.state.activePlayerId
  const evaluation = evaluateOperationalPlan(session, playerId)
  const planState = getOperationalPlanState(session, playerId)
  const visible = session.state.phase === 'COMMAND'
    || session.state.phase === 'END_TURN'
    || evaluation.status === 'COMPLETED'
    || (planState.planId === 'WYNISZCZENIE' && ['SHOOTING', 'FIGHT'].includes(session.state.phase))
  if (!visible) return []
  const availability = canChangeOperationalPlan(session, playerId)
  const progress = evaluation.progress
    ? `${evaluation.progress.current} / ${evaluation.progress.target} ${evaluation.progress.unit}`
    : evaluation.reason
  return [{
    id: `operational-plan-${playerId}-${session.state.phase}`,
    type: 'OPERATIONAL_PLAN_PROGRESS',
    title: evaluation.name,
    shortDescription: progress,
    status: evaluation.status === 'COMPLETED' ? 'DONE' : availability.available ? 'AVAILABLE' : 'INFO',
    severity: evaluation.status === 'COMPLETED' ? 'INFO' : 'QUIET',
    source: 'OPERATIONAL_PLAN',
    phase: session.state.phase,
    relatedPlayerId: playerId,
    actions: availability.available
      ? [action('change-operational-plan', 'CHANGE_OPERATIONAL_PLAN', 'Change plan', { playerId })]
      : [],
    details: [evaluation.reason],
  }]
}

function stratagemItems(input: BuildBattleContextInput, relevantStratagems: BattleContext['relevantStratagems']): ContextItem[] {
  if (relevantStratagems.length === 0) return []
  const playerId = input.session.state.activePlayerId
  const usable = relevantStratagems.filter((option) => option.availability.canUse || option.manualConfirmationRequired)
  if (usable.length === 0) return []
  return [{
    id: `stratagems-${playerId}-${input.session.state.phase}`,
    type: 'AVAILABLE_STRATAGEMS',
    title: `${usable.length} Stratagem${usable.length === 1 ? '' : 's'} potentially available`,
    shortDescription: usable.some((option) => option.manualConfirmationRequired)
      ? 'Some timing requires player confirmation.'
      : 'Structured timing matches the current phase.',
    status: 'AVAILABLE',
    severity: 'INFO',
    source: 'STRATAGEM',
    phase: input.session.state.phase,
    relatedPlayerId: playerId,
    actions: [
      action('open-context-stratagems', 'OPEN_STRATAGEMS', 'Show', { playerId }),
      ...(input.session.setup.guidanceLevel === 'guided'
        ? [action(`dismiss-stratagems-${input.session.state.phase}`, 'DISMISS', 'Ignore for this phase')]
        : []),
    ],
    details: usable.slice(0, 2).map((option) => `${option.definition.name} · ${option.definition.cpCost} CP${option.manualConfirmationRequired ? ' · confirm timing' : ''}`),
    dismissible: input.session.setup.guidanceLevel === 'guided',
  }]
}

function reactionItems(input: BuildBattleContextInput, players: BattleContext['reactionPlayers']): ContextItem[] {
  const session = input.session
  const window = getCurrentReactionWindow(session)
  if (window) {
    const pending = players.filter((player) => player.pending)
    const blocking = window.behavior === 'HARD' && pending.length > 0
    return [{
      id: `reaction-window-${window.id}`,
      type: 'REACTION_WINDOW',
      title: blocking ? 'Reaction response required' : 'Reaction window open',
      shortDescription: pending.length > 0
        ? `${pending.map((player) => player.playerName).join(', ')} must respond.`
        : 'All players have responded.',
      status: blocking ? 'BLOCKING' : 'INFO',
      severity: blocking ? 'CRITICAL' : 'INFO',
      source: 'REACTION',
      phase: session.state.phase,
      actions: pending.map((player) => action(`pass-${window.id}-${player.playerId}`, 'PASS_REACTION', `Pass · ${player.playerName}`, {
        playerId: player.playerId,
        reactionWindowId: window.id,
      })),
    }]
  }
  const total = players.reduce((sum, player) => sum + player.exactCount + player.potentialCount, 0)
  return [{
    id: `reaction-status-${session.state.phase}`,
    type: 'REACTION_STATUS',
    title: total === 0 ? 'No reactions available' : `${total} potential reaction${total === 1 ? '' : 's'}`,
    shortDescription: total === 0
      ? 'No opponent Stratagem matches this phase.'
      : players.map((player) => `${player.playerName}: ${player.exactCount + player.potentialCount}`).join(' · '),
    status: total === 0 ? 'INFO' : 'AVAILABLE',
    severity: total === 0 ? 'QUIET' : 'ATTENTION',
    source: 'REACTION',
    phase: session.state.phase,
    actions: players.filter((player) => player.exactCount + player.potentialCount > 0).map((player) => (
      action(`hold-reaction-${player.playerId}`, 'HOLD_REACTION', `Review · ${player.playerName}`, { playerId: player.playerId })
    )),
  }]
}

function automaticItems(session: BattleSession): ContextItem[] {
  if (session.setup.guidanceLevel === 'fast' || session.setup.rulesetId !== CAULDRON_RULESET_ID) return []
  const playerId = session.state.activePlayerId
  return selectCompletedSecondariesThisTurn(session, playerId).map((card) => ({
    id: `completed-secondary-${card.cardId}-${card.completedTurn}`,
    type: 'AUTOMATIC_SECONDARY_RESULT',
    title: `${CAULDRON_SECONDARY_BY_ID[card.cardId].name} completed`,
    shortDescription: `+${card.pointsAwarded} VP · ${getRoundSecondaryVp(session, playerId)} / 10 this Battle Round`,
    status: 'DONE',
    severity: 'INFO',
    source: 'SECONDARY',
    phase: session.state.phase,
    relatedPlayerId: playerId,
    relatedSecondaryId: card.cardId,
    actions: [],
  }))
}

function explicitBlockerItems(session: BattleSession): ContextItem[] {
  if (session.setup.rulesetId !== CAULDRON_RULESET_ID) return []
  const playerId = session.state.activePlayerId
  const items: ContextItem[] = selectSecondaryBlockers(session, playerId).flatMap((blocker) => {
    if (blocker.secondaryId === 'CEL_PRIORYTETOWY') return []
    return [{
      id: blocker.id,
      type: 'SECONDARY_DECISION',
      title: blocker.title,
      shortDescription: blocker.description,
      status: 'BLOCKING',
      severity: 'CRITICAL',
      source: 'SECONDARY',
      phase: session.state.phase,
      relatedPlayerId: playerId,
      actions: [action('resolve-elimination-choice', 'RESOLVE_ELIMINATION_CHOICE', 'Resolve choice', { playerId })],
    } satisfies ContextItem]
  })
  if (session.state.phase === 'END_TURN') items.push({
    id: `end-turn-review-${playerId}`,
    type: 'END_TURN_REVIEW',
    title: 'End Turn Review required',
    shortDescription: 'Resolve Mission Actions, Secondary scoring and incomplete cards in one review.',
    status: 'BLOCKING',
    severity: 'CRITICAL',
    source: 'SYSTEM',
    phase: 'END_TURN',
    relatedPlayerId: playerId,
    actions: [action('open-end-turn-review', 'END_TURN', 'Review turn', { playerId })],
  })
  return items
}

function section(id: string, title: string, items: ContextItem[]): ContextSection | null {
  return items.length > 0 ? { id, title, items } : null
}

export function buildBattleContext(input: BuildBattleContextInput): BattleContext {
  const session = input.session
  const activePlayer = selectActivePlayer(session)
  const rival = selectCurrentRival(session)
  const relevantStratagems = selectRelevantStratagems(session, input.rulesDataByPlayer)
  const reactionPlayers = selectReactionPlayers(session, input.rulesDataByPlayer)
  const explicit = explicitBlockerItems(session)
  const secondaries = secondaryItems(session)
  const commands = commandItems(session)
  const missions = missionActionItems(session)
  const plans = planItems(session)
  const stratagems = stratagemItems(input, relevantStratagems)
  const reactions = reactionItems(input, reactionPlayers)
  const automaticEvents = automaticItems(session)
  const allItems = [...explicit, ...secondaries, ...commands, ...missions, ...plans, ...stratagems, ...reactions, ...automaticEvents]
  const blockingItems = allItems.filter((item) => item.status === 'BLOCKING')
  const warnings = allItems.filter((item) => item.status === 'WARNING')
  const priorities = allItems.filter((item) => ['BLOCKING', 'REQUIRED', 'AVAILABLE'].includes(item.status) && item.source !== 'REACTION')
  const sections = [
    section('attention', 'Requires attention', blockingItems),
    section('goals', 'Active goals', secondaries),
    section('now', 'What matters now', [...commands, ...missions, ...plans, ...automaticEvents]),
    section('stratagems', 'Stratagems', stratagems),
    section('reactions', 'Reactions', reactions),
  ].filter((value): value is ContextSection => Boolean(value))
  const availableActions = [...new Map(allItems.flatMap((item) => item.actions).map((itemAction) => [itemAction.id, itemAction])).values()]
  return {
    activePlayer,
    rival,
    round: session.state.round,
    phase: session.state.phase,
    guidanceLevel: session.setup.guidanceLevel,
    priorities,
    availableActions,
    warnings,
    automaticEvents,
    reactions,
    blockingItems,
    sections,
    relevantStratagems,
    reactionPlayers,
  }
}
