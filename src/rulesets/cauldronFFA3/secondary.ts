import type { UnitDefinition } from '../../domain/army/types'
import { dispatchBattleEvents } from '../../domain/battle/engine'
import { getPlayerTurnNumber, getUnitDefinition } from '../../domain/battle/missionActions'
import type { BattleEventInput, BattleSession, MissionActionState } from '../../domain/battle/types'
import { cauldronEvent } from './events'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { getCauldronConfig } from './sessionConfig'
import { getCauldronTurnStartSnapshot } from './snapshots'
import { CAULDRON_SECONDARY_BY_ID, CAULDRON_SECONDARY_IDS } from './secondaryDefinitions'
import type {
  ActiveSecondaryView,
  EndTurnReview,
  EndTurnSecondaryConfirmations,
  PendingEliminationChoice,
  PlayerSecondaryState,
  SecondaryCardSpecificState,
  SecondaryCardState,
  SecondaryId,
  SecondaryState,
} from './secondaryTypes'

const ROUND_SECONDARY_CAP = 10
const GAME_SECONDARY_CAP = 45

type SecondaryEventData =
  | { playerId: string; deckOrder: SecondaryId[] }
  | { playerId: string; cardId: SecondaryId; round: number; turn: number; reason?: string }
  | { playerId: string; cardId: SecondaryId; round: number; turn: number; pointsAwarded: number; cardSpecificState?: SecondaryCardSpecificState }
  | { playerId: string; cardId: SecondaryId; patch: SecondaryCardSpecificState }
  | { playerId: string; turnKey: string }
  | { playerId: string; choice: PendingEliminationChoice }
  | { playerId: string; killEventId: string; cardId: SecondaryId }

function emptyPlayer(playerId: string): PlayerSecondaryState {
  return { playerId, deck: [], active: [], discarded: [], completed: [], scoreHistory: [] }
}

function cloneCard(card: SecondaryCardState): SecondaryCardState {
  return { ...card, cardSpecificState: card.cardSpecificState ? structuredClone(card.cardSpecificState) : undefined }
}

function removeCard(cards: SecondaryCardState[], cardId: SecondaryId): SecondaryCardState | undefined {
  const index = cards.findIndex((card) => card.cardId === cardId)
  return index < 0 ? undefined : cards.splice(index, 1)[0]
}

export function getSecondaryState(session: BattleSession): SecondaryState {
  const state: SecondaryState = Object.fromEntries(session.setup.players.map((player) => [player.id, emptyPlayer(player.id)]))
  for (const event of session.state.events) {
    if (event.type !== 'RULESET_EVENT' || event.payload.rulesetId !== 'cauldron-ffa-3') continue
    const data = event.payload.data as SecondaryEventData
    const player = data && 'playerId' in data ? state[data.playerId] : undefined
    if (!player) continue
    switch (event.payload.action) {
      case 'SECONDARY_DECK_SHUFFLED': {
        const deckOrder = (data as { deckOrder: SecondaryId[] }).deckOrder
        player.deck = [...deckOrder]
        const returning = new Set(deckOrder)
        player.discarded = player.discarded.filter((card) => !returning.has(card.cardId))
        break
      }
      case 'SECONDARY_DRAWN': {
        const drawn = data as { cardId: SecondaryId; round: number; turn: number }
        const index = player.deck.indexOf(drawn.cardId)
        if (index >= 0) player.deck.splice(index, 1)
        player.active.push({
          cardId: drawn.cardId,
          playerId: player.playerId,
          status: 'ACTIVE',
          drawnRound: drawn.round,
          drawnTurn: drawn.turn,
          pointsAwarded: 0,
        })
        break
      }
      case 'SECONDARY_DISCARDED': {
        const discarded = data as { cardId: SecondaryId; round: number; turn: number }
        const card = removeCard(player.active, discarded.cardId)
        if (card) player.discarded.push({
          ...card,
          status: 'DISCARDED_INCOMPLETE',
          discardedRound: discarded.round,
          discardedTurn: discarded.turn,
        })
        break
      }
      case 'SECONDARY_COMPLETED': {
        const completed = data as {
          cardId: SecondaryId
          round: number
          turn: number
          pointsAwarded: number
          cardSpecificState?: SecondaryCardSpecificState
        }
        const card = removeCard(player.active, completed.cardId)
        if (card) {
          const archived: SecondaryCardState = {
            ...card,
            status: 'COMPLETED_ARCHIVE',
            completedRound: completed.round,
            completedTurn: completed.turn,
            pointsAwarded: completed.pointsAwarded,
            cardSpecificState: completed.cardSpecificState ?? card.cardSpecificState,
          }
          player.completed.push(archived)
          player.scoreHistory.push({
            cardId: completed.cardId,
            cardName: CAULDRON_SECONDARY_BY_ID[completed.cardId].name,
            round: completed.round,
            pointsAwarded: completed.pointsAwarded,
          })
        }
        break
      }
      case 'SECONDARY_CARD_STATE_UPDATED': {
        const updated = data as { cardId: SecondaryId; patch: SecondaryCardSpecificState }
        const card = player.active.find((candidate) => candidate.cardId === updated.cardId)
        if (card) card.cardSpecificState = { ...card.cardSpecificState, ...structuredClone(updated.patch) }
        break
      }
      case 'SECONDARY_MULLIGAN_USED':
        player.mulliganUsedTurnKey = (data as { turnKey: string }).turnKey
        break
      case 'SECONDARY_ELIMINATION_CHOICE_REQUIRED':
        player.pendingEliminationChoice = structuredClone((data as { choice: PendingEliminationChoice }).choice)
        break
      case 'SECONDARY_SCORING_CHOICE_MADE':
        player.pendingEliminationChoice = undefined
        break
    }
  }
  return state
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[randomIndex]] = [result[randomIndex], result[index]]
  }
  return result
}

function normalizedTraits(unit: UnitDefinition): string[] {
  return [...unit.categories, ...unit.keywords].map((value) => value.toLocaleUpperCase())
}

function rivalUnits(session: BattleSession, playerId: string, round: number): UnitDefinition[] {
  const rivalId = getCurrentRivalPlayerId(session, playerId, round)
  const armyId = session.setup.players.find((player) => player.id === rivalId)?.armyId
  return armyId ? session.setup.armies[armyId]?.units ?? [] : []
}

function isInvalidForCurrentRival(session: BattleSession, playerId: string, cardId: SecondaryId, round: number): boolean {
  if (cardId === 'ZNISZCZ_KOLOSA') {
    return !rivalUnits(session, playerId, round).some((unit) => {
      const traits = normalizedTraits(unit)
      return traits.includes('VEHICLE') || traits.includes('MONSTER')
    })
  }
  if (cardId === 'ELIMINACJA_DOWODCY') {
    return !rivalUnits(session, playerId, round).some((unit) => normalizedTraits(unit).includes('CHARACTER'))
  }
  return false
}

type MutableDrawState = Pick<PlayerSecondaryState, 'deck' | 'active' | 'discarded'>

function drawEvents(
  session: BattleSession,
  playerId: string,
  mutable: MutableDrawState,
  targetCount: number,
  round: number,
  turn: number,
  random: () => number,
): BattleEventInput[] {
  const events: BattleEventInput[] = []
  const attempted = new Set<SecondaryId>()
  while (mutable.active.length < targetCount) {
    if (mutable.deck.length === 0) {
      const eligibleDiscarded = mutable.discarded.filter((card) => !attempted.has(card.cardId))
      if (eligibleDiscarded.length === 0) break
      const deckOrder = shuffle(eligibleDiscarded.map((card) => card.cardId), random)
      mutable.deck = [...deckOrder]
      mutable.discarded = mutable.discarded.filter((card) => !deckOrder.includes(card.cardId))
      events.push(cauldronEvent('SECONDARY_DECK_SHUFFLED', { playerId, deckOrder }))
    }
    const cardId = mutable.deck.shift()
    if (!cardId) break
    const card: SecondaryCardState = {
      cardId,
      playerId,
      status: 'ACTIVE',
      drawnRound: round,
      drawnTurn: turn,
      pointsAwarded: 0,
    }
    mutable.active.push(card)
    events.push(cauldronEvent('SECONDARY_DRAWN', { playerId, cardId, round, turn }))
    if (isInvalidForCurrentRival(session, playerId, cardId, round)) {
      attempted.add(cardId)
      removeCard(mutable.active, cardId)
      mutable.discarded.push({ ...card, status: 'DISCARDED_INCOMPLETE', discardedRound: round, discardedTurn: turn })
      events.push(cauldronEvent('SECONDARY_DISCARDED', {
        playerId,
        cardId,
        round,
        turn,
        reason: 'Current Rival has no eligible unit; card replaced automatically.',
      }))
    }
  }
  return events
}

function validateDeckOrder(order: readonly SecondaryId[]): void {
  if (order.length !== CAULDRON_SECONDARY_IDS.length || new Set(order).size !== CAULDRON_SECONDARY_IDS.length) {
    throw new Error('A Cauldron Secondary deck must contain all 15 unique cards.')
  }
  if (order.some((id) => !CAULDRON_SECONDARY_IDS.includes(id))) throw new Error('Unknown Cauldron Secondary card.')
}

export function createSecondaryInitializationEvents(
  session: BattleSession,
  deckOrders: Partial<Record<string, readonly SecondaryId[]>> = {},
  random: () => number = Math.random,
): BattleEventInput[] {
  return session.setup.players.flatMap((player) => {
    const order = deckOrders[player.id] ? [...deckOrders[player.id]!] : shuffle(CAULDRON_SECONDARY_IDS, random)
    validateDeckOrder(order)
    const mutable: MutableDrawState = { deck: [...order], active: [], discarded: [] }
    return [
      cauldronEvent('SECONDARY_DECK_SHUFFLED', { playerId: player.id, deckOrder: order }),
      ...drawEvents(session, player.id, mutable, 2, 1, 1, random),
    ]
  })
}

export function createSecondaryRefillEvents(
  session: BattleSession,
  playerId: string,
  round = session.state.round,
  random: () => number = Math.random,
): BattleEventInput[] {
  const current = getSecondaryState(session)[playerId]
  if (!current) throw new Error(`Unknown player: ${playerId}`)
  const mutable: MutableDrawState = {
    deck: [...current.deck],
    active: current.active.map(cloneCard),
    discarded: current.discarded.map(cloneCard),
  }
  return drawEvents(session, playerId, mutable, 2, round, getPlayerTurnNumber(session, playerId) + 1, random)
}

export function addSecondaryRefillEvents(
  session: BattleSession,
  transitions: readonly BattleEventInput[],
): BattleEventInput[] {
  let round = session.state.round
  return transitions.flatMap((event) => {
    if (event.type === 'ROUND_STARTED') round = event.payload.round
    return event.type === 'TURN_STARTED'
      ? [event, ...createSecondaryRefillEvents(session, event.payload.playerId, round)]
      : [event]
  })
}

function currentTurnKey(session: BattleSession, playerId: string): string {
  return `${session.state.round}:${getPlayerTurnNumber(session, playerId)}`
}

export function isMulliganAvailable(session: BattleSession, playerId: string): boolean {
  const state = getSecondaryState(session)[playerId]
  return Boolean(
    state
    && session.state.activePlayerId === playerId
    && state.active.length > 0
    && state.mulliganUsedTurnKey !== currentTurnKey(session, playerId),
  )
}

export function mulliganSecondary(
  session: BattleSession,
  playerId: string,
  cardId: SecondaryId,
  random: () => number = Math.random,
): BattleSession {
  const state = getSecondaryState(session)[playerId]
  if (!state?.active.some((card) => card.cardId === cardId)) throw new Error('Only an active incomplete card can be mulliganed.')
  if (!isMulliganAvailable(session, playerId)) throw new Error('The free mulligan has already been used this turn.')
  const turn = getPlayerTurnNumber(session, playerId)
  const discarded = state.active.find((card) => card.cardId === cardId)!
  const mutable: MutableDrawState = {
    deck: [...state.deck],
    active: state.active.filter((card) => card.cardId !== cardId).map(cloneCard),
    discarded: [...state.discarded.map(cloneCard), {
      ...cloneCard(discarded), status: 'DISCARDED_INCOMPLETE', discardedRound: session.state.round, discardedTurn: turn,
    }],
  }
  const events: BattleEventInput[] = [
    cauldronEvent('SECONDARY_MULLIGAN_USED', { playerId, turnKey: currentTurnKey(session, playerId) }),
    cauldronEvent('SECONDARY_DISCARDED', { playerId, cardId, round: session.state.round, turn, reason: 'Free mulligan' }),
    ...drawEvents(session, playerId, mutable, 2, session.state.round, turn, random),
  ]
  return dispatchBattleEvents(session, events, { actorPlayerId: playerId })
}

export function discardSecondaryCards(
  session: BattleSession,
  playerId: string,
  cardIds: readonly SecondaryId[],
): BattleSession {
  if (session.state.activePlayerId !== playerId || session.state.phase !== 'END_TURN') {
    throw new Error('Incomplete Secondary cards are discarded at the end of their player’s turn.')
  }
  const state = getSecondaryState(session)[playerId]
  const unique = [...new Set(cardIds)]
  if (unique.some((id) => !state.active.some((card) => card.cardId === id))) {
    throw new Error('Only active incomplete cards can be discarded.')
  }
  const turn = getPlayerTurnNumber(session, playerId)
  return dispatchBattleEvents(session, unique.map((cardId) => cauldronEvent('SECONDARY_DISCARDED', {
    playerId, cardId, round: session.state.round, turn, reason: 'End of turn discard',
  })), { actorPlayerId: playerId })
}

export function getRoundSecondaryVp(session: BattleSession, playerId: string, round = session.state.round): number {
  return getSecondaryState(session)[playerId]?.scoreHistory
    .filter((entry) => entry.round === round)
    .reduce((total, entry) => total + entry.pointsAwarded, 0) ?? 0
}

export function getGameSecondaryVp(session: BattleSession, playerId: string): number {
  return getSecondaryState(session)[playerId]?.scoreHistory.reduce((total, entry) => total + entry.pointsAwarded, 0) ?? 0
}

function completionInputs(
  session: BattleSession,
  playerId: string,
  cardIds: readonly SecondaryId[],
  specifics: Partial<Record<SecondaryId, SecondaryCardSpecificState>> = {},
): BattleEventInput[] {
  let roundRemaining = Math.max(0, ROUND_SECONDARY_CAP - getRoundSecondaryVp(session, playerId))
  let gameRemaining = Math.max(0, GAME_SECONDARY_CAP - getGameSecondaryVp(session, playerId))
  const turn = getPlayerTurnNumber(session, playerId)
  const inputs: BattleEventInput[] = []
  for (const cardId of cardIds) {
    const award = Math.min(CAULDRON_SECONDARY_BY_ID[cardId].vp, roundRemaining, gameRemaining)
    roundRemaining -= award
    gameRemaining -= award
    inputs.push(cauldronEvent('SECONDARY_COMPLETED', {
      playerId,
      cardId,
      round: session.state.round,
      turn,
      pointsAwarded: award,
      cardSpecificState: specifics[cardId],
    }))
    if (award > 0) inputs.push({
      type: 'SCORE_ADJUSTED',
      payload: { playerId, category: 'secondary', delta: award },
    })
  }
  return inputs
}

function isUnitDestroyedByEvent(session: BattleSession, event: BattleEventInput): boolean {
  if (!('payload' in event) || !('unitId' in event.payload) || !('playerId' in event.payload)) return false
  const unit = session.state.players[event.payload.playerId]?.units[event.payload.unitId]
  if (!unit || unit.destroyed) return false
  if (event.type === 'UNIT_DESTROYED') return true
  if (event.type === 'UNIT_WOUNDS_CHANGED') return event.payload.woundsRemaining <= 0
  if (event.type === 'UNIT_MODEL_DESTROYED') return unit.modelsAlive - Math.max(1, event.payload.amount) <= 0
  return false
}

function eliminationMatches(session: BattleSession, event: BattleEventInput): {
  playerId: string
  destroyedPlayerId: string
  destroyedUnitId: string
  unit: UnitDefinition
  matchingCardIds: SecondaryId[]
} | undefined {
  if (!isUnitDestroyedByEvent(session, event)) return undefined
  if (event.type !== 'UNIT_DESTROYED' && event.type !== 'UNIT_WOUNDS_CHANGED' && event.type !== 'UNIT_MODEL_DESTROYED') return undefined
  const playerId = event.payload.destroyedByPlayerId ?? undefined
  if (!playerId || playerId === event.payload.playerId) return undefined
  if (getCurrentRivalPlayerId(session, playerId) !== event.payload.playerId) return undefined
  const unit = getUnitDefinition(session, event.payload.playerId, event.payload.unitId)
  if (!unit) return undefined
  const active = getSecondaryState(session)[playerId]?.active ?? []
  const traits = normalizedTraits(unit)
  const matchingCardIds = active.flatMap((card): SecondaryId[] => {
    if (card.cardId === 'SILA_OGNIA' && session.state.phase === 'SHOOTING') return [card.cardId]
    if (card.cardId === 'WALKA_W_ZWARCIU' && session.state.phase === 'FIGHT') return [card.cardId]
    if (card.cardId === 'ZNISZCZ_KOLOSA' && (traits.includes('VEHICLE') || traits.includes('MONSTER'))) return [card.cardId]
    if (card.cardId === 'ELIMINACJA_DOWODCY' && traits.includes('CHARACTER')) return [card.cardId]
    if (
      card.cardId === 'CEL_PRIORYTETOWY'
      && card.cardSpecificState?.priorityTargetUnitId === unit.id
      && card.cardSpecificState.boundRivalPlayerId === event.payload.playerId
      && session.state.round <= (card.cardSpecificState.deadlineRound ?? 0)
    ) return [card.cardId]
    return []
  })
  return matchingCardIds.length > 0
    ? { playerId, destroyedPlayerId: event.payload.playerId, destroyedUnitId: event.payload.unitId, unit, matchingCardIds }
    : undefined
}

/** Dispatches a normal Battle event and attaches any automatic Cauldron Secondary consequence to the same undo action. */
export function dispatchCauldronBattleEvent(session: BattleSession, event: BattleEventInput): BattleSession {
  const match = eliminationMatches(session, event)
  const inputs: BattleEventInput[] = [event]
  if (match?.matchingCardIds.length === 1) {
    inputs.push(...completionInputs(session, match.playerId, match.matchingCardIds))
  } else if (match && match.matchingCardIds.length > 1) {
    const killEventId = `kill-${session.state.events.length + 1}-${match.destroyedPlayerId}-${match.destroyedUnitId}`
    inputs.push(cauldronEvent('SECONDARY_ELIMINATION_CHOICE_REQUIRED', {
      playerId: match.playerId,
      choice: {
        playerId: match.playerId,
        destroyedPlayerId: match.destroyedPlayerId,
        destroyedUnitId: match.destroyedUnitId,
        destroyedUnitName: match.unit.name,
        killEventId,
        matchingCardIds: match.matchingCardIds,
      } satisfies PendingEliminationChoice,
    }))
  }
  return dispatchBattleEvents(session, inputs, { actorPlayerId: match?.playerId })
}

export function resolveEliminationChoice(
  session: BattleSession,
  playerId: string,
  cardId: SecondaryId,
): BattleSession {
  const choice = getSecondaryState(session)[playerId]?.pendingEliminationChoice
  if (!choice || !choice.matchingCardIds.includes(cardId)) throw new Error('Choose one of the matching active elimination cards.')
  return dispatchBattleEvents(session, [
    cauldronEvent('SECONDARY_SCORING_CHOICE_MADE', { playerId, killEventId: choice.killEventId, cardId }),
    ...completionInputs(session, playerId, [cardId]),
  ], { actorPlayerId: playerId })
}

export function getPriorityTargetCandidates(
  session: BattleSession,
  playerId: string,
): Array<{ unitId: string; name: string; points: number; eligible: boolean }> {
  const rivalId = getCurrentRivalPlayerId(session, playerId)
  const rival = session.setup.players.find((player) => player.id === rivalId)
  const army = rival?.armyId ? session.setup.armies[rival.armyId] : undefined
  if (!army) return []
  const threshold = army.totalPoints * 0.1
  return army.units.map((unit) => ({
    unitId: unit.id,
    name: unit.name,
    points: unit.points,
    eligible: unit.points >= threshold && !session.state.players[rivalId]?.units[unit.id]?.destroyed,
  }))
}

export function selectPriorityTargetCandidates(
  session: BattleSession,
  playerId: string,
  unitIds: readonly string[],
): BattleSession {
  const card = getSecondaryState(session)[playerId]?.active.find((active) => active.cardId === 'CEL_PRIORYTETOWY')
  if (!card) throw new Error('Cel Priorytetowy is not active.')
  if (unitIds.length !== 2 || new Set(unitIds).size !== 2) throw new Error('Select exactly two different eligible units.')
  const eligible = new Set(getPriorityTargetCandidates(session, playerId).filter((unit) => unit.eligible).map((unit) => unit.unitId))
  if (unitIds.some((id) => !eligible.has(id))) throw new Error('Every selected target must be worth at least 10% of the Rival army.')
  return dispatchBattleEvents(session, [cauldronEvent('SECONDARY_CARD_STATE_UPDATED', {
    playerId,
    cardId: 'CEL_PRIORYTETOWY',
    patch: {
      priorityCandidateUnitIds: [...unitIds],
      boundRivalPlayerId: getCurrentRivalPlayerId(session, playerId),
    },
  })], { actorPlayerId: playerId })
}

export function choosePriorityTarget(session: BattleSession, playerId: string, unitId: string): BattleSession {
  const card = getSecondaryState(session)[playerId]?.active.find((active) => active.cardId === 'CEL_PRIORYTETOWY')
  const candidates = card?.cardSpecificState?.priorityCandidateUnitIds
  if (!card || !candidates?.includes(unitId)) throw new Error('The Rival must choose one of the two selected candidates.')
  return dispatchBattleEvents(session, [cauldronEvent('SECONDARY_CARD_STATE_UPDATED', {
    playerId,
    cardId: 'CEL_PRIORYTETOWY',
    patch: {
      priorityTargetUnitId: unitId,
      deadlineRound: session.state.round + 1,
      deadlineTurn: getPlayerTurnNumber(session, playerId) + 1,
    },
  })], { actorPlayerId: getCurrentRivalPlayerId(session, playerId) })
}

function completedMissionActions(session: BattleSession, playerId: string): MissionActionState[] {
  const turn = getPlayerTurnNumber(session, playerId)
  return Object.values(session.state.missionActions).filter((action) => (
    action.playerId === playerId
    && action.status === 'COMPLETED'
    && action.endedRound === session.state.round
    && action.endedTurn === turn
  ))
}

function controlledCount(session: BattleSession, playerId: string): number {
  return Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === playerId).length
}

function evaluateEndTurnCard(
  session: BattleSession,
  playerId: string,
  card: SecondaryCardState,
  confirmation: EndTurnSecondaryConfirmations,
): { complete: boolean; patch?: SecondaryCardSpecificState } {
  const rivalId = getCurrentRivalPlayerId(session, playerId)
  const objectives = Object.values(session.state.objectives)
  switch (card.cardId) {
    case 'SZTURM_NA_POZYCJE': {
      const snapshot = getCauldronTurnStartSnapshot(session, playerId, session.state.round)
      return { complete: Boolean(snapshot && objectives.some((objective) => (
        snapshot.objectiveStates[objective.id]?.controllerPlayerId === rivalId
        && objective.controllerPlayerId === playerId
      ))) }
    }
    case 'ZIEMIA_NICZYJA':
      return { complete: objectives.filter((objective) => objective.type === 'neutral' && objective.controllerPlayerId === playerId).length >= 2 }
    case 'DOMINACJA_CENTRUM': {
      const values = confirmation.centreOcByPlayer
      if (!values || Object.keys(session.state.players).some((id) => values[id] === undefined)) return { complete: false }
      const own = values[playerId]
      const highestOther = Math.max(...Object.entries(values).filter(([id]) => id !== playerId).map(([, oc]) => oc))
      return { complete: own > highestOther, patch: { centreOcByPlayer: { ...values }, lastConfirmation: own > highestOther ? 'Highest centre OC confirmed' : 'Centre OC did not qualify' } }
    }
    case 'ZA_LINIAMI_WROGA':
      return {
        complete: confirmation.behindEnemyLines === true,
        patch: confirmation.behindEnemyLines === undefined
          ? undefined
          : { lastConfirmation: confirmation.behindEnemyLines ? 'Qualifying unit confirmed' : 'Condition not confirmed' },
      }
    case 'SZEROKI_FRONT':
      return {
        complete: confirmation.wideFrontThreeSectors === true && confirmation.wideFrontTwoOutsideDeployment === true,
        patch: confirmation.wideFrontThreeSectors === undefined || confirmation.wideFrontTwoOutsideDeployment === undefined
          ? undefined
          : { lastConfirmation: 'Sector positions checked' },
      }
    case 'ZABEZPIECZ_DANE':
      return { complete: completedMissionActions(session, playerId).some((action) => (
        action.type === 'SECURE_DATA'
        && Boolean(action.targetObjectiveId)
        && session.state.objectives[action.targetObjectiveId!]?.type === 'neutral'
        && session.state.objectives[action.targetObjectiveId!]?.controllerPlayerId === playerId
      )) }
    case 'SKANOWANIE_SYGNALU':
      return { complete: completedMissionActions(session, playerId).some((action) => (
        action.type === 'SCAN_SIGNAL' && action.locationType === 'BATTLEFIELD_CENTRE'
      )) }
    case 'UTRZYMAJ_BAZE': {
      const zone = getCauldronConfig(session).playerConfigs[playerId]?.deploymentZone
      const home = objectives.find((objective) => objective.id === `${zone}-HOME`)
      return {
        complete: home?.controllerPlayerId === playerId && confirmation.noEnemyInOwnDeployment === true,
        patch: confirmation.noEnemyInOwnDeployment === undefined ? undefined : { lastConfirmation: 'Enemy presence checked' },
      }
    }
    case 'PRESJA_TAKTYCZNA': {
      const own = controlledCount(session, playerId)
      return { complete: own >= 2 && own > controlledCount(session, rivalId) }
    }
    case 'ODCIECIE_ODWROTU':
      return {
        complete: confirmation.controlsClosestNeutralObjective === true && confirmation.unitNearRivalDeployment === true,
        patch: confirmation.controlsClosestNeutralObjective === undefined || confirmation.unitNearRivalDeployment === undefined
          ? undefined
          : { lastConfirmation: 'Closest objective and unit position confirmed' },
      }
    default:
      return { complete: false }
  }
}

export function createEndTurnSecondaryEvents(
  session: BattleSession,
  playerId: string,
  confirmation: EndTurnSecondaryConfirmations = {},
): BattleEventInput[] {
  if (session.state.activePlayerId !== playerId || session.state.phase !== 'END_TURN') {
    throw new Error('End-turn Secondary evaluation is only available for the active player.')
  }
  const state = getSecondaryState(session)[playerId]
  const completed: SecondaryId[] = []
  const specifics: Partial<Record<SecondaryId, SecondaryCardSpecificState>> = {}
  const stateEvents: BattleEventInput[] = []
  for (const card of state.active) {
    if (card.cardId === 'CEL_PRIORYTETOWY') {
      const specific = card.cardSpecificState
      if (
        specific?.priorityTargetUnitId
        && !specific.deadlineFailed
        && getPlayerTurnNumber(session, playerId) >= (specific.deadlineTurn ?? Number.POSITIVE_INFINITY)
      ) {
        stateEvents.push(cauldronEvent('SECONDARY_CARD_STATE_UPDATED', {
          playerId, cardId: card.cardId, patch: { deadlineFailed: true },
        }))
      }
      continue
    }
    const result = evaluateEndTurnCard(session, playerId, card, confirmation)
    if (result.complete) {
      completed.push(card.cardId)
      if (result.patch) specifics[card.cardId] = { ...card.cardSpecificState, ...result.patch }
    } else if (result.patch) {
      stateEvents.push(cauldronEvent('SECONDARY_CARD_STATE_UPDATED', {
        playerId, cardId: card.cardId, patch: result.patch,
      }))
    }
  }
  return [
    ...stateEvents,
    ...completionInputs(session, playerId, completed, specifics),
  ]
}

export function evaluateEndTurnSecondaries(
  session: BattleSession,
  playerId: string,
  confirmation: EndTurnSecondaryConfirmations = {},
): BattleSession {
  const events = createEndTurnSecondaryEvents(session, playerId, confirmation)
  return events.length === 0 ? session : dispatchBattleEvents(session, events, { actorPlayerId: playerId })
}

function progressForCard(session: BattleSession, playerId: string, card: SecondaryCardState): string {
  const rivalId = getCurrentRivalPlayerId(session, playerId)
  const rivalName = session.state.players[rivalId]?.name ?? 'Current Rival'
  switch (card.cardId) {
    case 'SILA_OGNIA': return `No qualifying Shooting kill yet. Current Rival: ${rivalName}.`
    case 'WALKA_W_ZWARCIU': return `No qualifying Fight kill yet. Current Rival: ${rivalName}.`
    case 'ZNISZCZ_KOLOSA': return `${rivalUnits(session, playerId, session.state.round).filter((unit) => normalizedTraits(unit).some((trait) => trait === 'VEHICLE' || trait === 'MONSTER')).length} qualifying Rival targets.`
    case 'ELIMINACJA_DOWODCY': return `${rivalUnits(session, playerId, session.state.round).filter((unit) => normalizedTraits(unit).includes('CHARACTER')).length} qualifying Rival targets.`
    case 'ZIEMIA_NICZYJA': return `${Object.values(session.state.objectives).filter((objective) => objective.type === 'neutral' && objective.controllerPlayerId === playerId).length} / 2 neutral objectives.`
    case 'PRESJA_TAKTYCZNA': return `You ${controlledCount(session, playerId)}; Rival ${controlledCount(session, rivalId)} objectives.`
    case 'CEL_PRIORYTETOWY': {
      const targetId = card.cardSpecificState?.priorityTargetUnitId
      const target = targetId ? getUnitDefinition(session, card.cardSpecificState?.boundRivalPlayerId ?? rivalId, targetId) : undefined
      if (card.cardSpecificState?.deadlineFailed) return 'Deadline passed; card remains incomplete and may be discarded.'
      if (target) return `Target: ${target.name}. Deadline: end of your turn in Round ${card.cardSpecificState?.deadlineRound}.`
      const count = card.cardSpecificState?.priorityCandidateUnitIds?.length ?? 0
      return count === 2 ? 'Two candidates selected; the Rival must choose one.' : 'Select two eligible Rival units.'
    }
    case 'ZABEZPIECZ_DANE': return 'Complete the action on a neutral objective, then control it.'
    case 'SKANOWANIE_SYGNALU': return 'Complete a scanning action near the battlefield centre.'
    default: return 'Condition is checked at the end of your turn.'
  }
}

function contextualAction(cardId: SecondaryId): ActiveSecondaryView['action'] {
  if (['SILA_OGNIA', 'WALKA_W_ZWARCIU', 'ZNISZCZ_KOLOSA', 'ELIMINACJA_DOWODCY'].includes(cardId)) return 'OPEN_RIVAL_ARMY'
  if (['SZTURM_NA_POZYCJE', 'ZIEMIA_NICZYJA', 'PRESJA_TAKTYCZNA'].includes(cardId)) return 'QUICK_OBJECTIVES'
  if (['ZABEZPIECZ_DANE', 'SKANOWANIE_SYGNALU'].includes(cardId)) return 'START_MISSION_ACTION'
  if (cardId === 'CEL_PRIORYTETOWY') return 'SELECT_TARGET'
  return 'CHECK_CONDITION'
}

export function getActiveSecondaryViews(session: BattleSession, playerId: string): ActiveSecondaryView[] {
  const state = getSecondaryState(session)[playerId]
  const pending = state?.pendingEliminationChoice
  return (state?.active ?? []).map((card) => {
    const definition = CAULDRON_SECONDARY_BY_ID[card.cardId]
    const inputRequired = definition.evaluationMode !== 'AUTOMATIC'
    return {
      cardId: card.cardId,
      name: definition.name,
      vp: definition.vp,
      objective: definition.description,
      status: pending?.matchingCardIds.includes(card.cardId)
        ? 'DECISION_REQUIRED'
        : card.cardSpecificState?.deadlineFailed
          ? 'DEADLINE_FAILED'
          : inputRequired ? 'INPUT_REQUIRED' : 'INCOMPLETE',
      progress: progressForCard(session, playerId, card),
      pointsAwarded: card.pointsAwarded,
      action: contextualAction(card.cardId),
    }
  })
}

export function getPendingEliminationChoice(
  session: BattleSession,
  playerId: string,
): (PendingEliminationChoice & { options: Array<{ cardId: SecondaryId; name: string; vp: number }> }) | undefined {
  const choice = getSecondaryState(session)[playerId]?.pendingEliminationChoice
  return choice ? {
    ...choice,
    options: choice.matchingCardIds.map((cardId) => ({
      cardId,
      name: CAULDRON_SECONDARY_BY_ID[cardId].name,
      vp: CAULDRON_SECONDARY_BY_ID[cardId].vp,
    })),
  } : undefined
}

export function getSecondaryCommandCentre(session: BattleSession, playerId: string) {
  const player = getSecondaryState(session)[playerId]
  return {
    playerId,
    activeCards: getActiveSecondaryViews(session, playerId),
    roundVp: getRoundSecondaryVp(session, playerId),
    roundCap: ROUND_SECONDARY_CAP,
    gameVp: getGameSecondaryVp(session, playerId),
    gameCap: GAME_SECONDARY_CAP,
    deckRemaining: player?.deck.length ?? 0,
    discardedCount: player?.discarded.length ?? 0,
    completedCount: player?.completed.length ?? 0,
    mulliganAvailable: isMulliganAvailable(session, playerId),
    pendingEliminationChoice: getPendingEliminationChoice(session, playerId),
  }
}

export function getEndTurnReview(session: BattleSession, playerId: string): EndTurnReview {
  const secondary = getSecondaryState(session)[playerId]
  const turn = getPlayerTurnNumber(session, playerId)
  const completedThisTurn: ActiveSecondaryView[] = secondary.completed
    .filter((card) => card.completedRound === session.state.round && card.completedTurn === turn)
    .map((card) => {
      const definition = CAULDRON_SECONDARY_BY_ID[card.cardId]
      return {
        cardId: card.cardId,
        name: definition.name,
        vp: definition.vp,
        objective: definition.description,
        status: 'COMPLETED',
        progress: `Completed for +${card.pointsAwarded} VP.`,
        pointsAwarded: card.pointsAwarded,
        action: null,
      }
    })
  return {
    playerId,
    missionActions: Object.values(session.state.missionActions)
      .filter((action) => action.playerId === playerId && action.startedRound === session.state.round)
      .map((action) => ({
        name: action.name,
        unitName: getUnitDefinition(session, playerId, action.unitId)?.name ?? 'Unknown unit',
        status: action.status,
        detail: action.status === 'ACTIVE' ? 'Requires end-turn resolution' : action.failureReason ?? 'Resolved',
      })),
    secondaries: [...completedThisTurn, ...getActiveSecondaryViews(session, playerId)],
    roundSecondaryVp: getRoundSecondaryVp(session, playerId),
    roundCap: 10,
    gameSecondaryVp: getGameSecondaryVp(session, playerId),
    gameCap: 45,
    incompleteCards: secondary.active.map((card) => ({ cardId: card.cardId, name: CAULDRON_SECONDARY_BY_ID[card.cardId].name })),
  }
}
