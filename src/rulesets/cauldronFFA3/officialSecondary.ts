import { dispatchBattleEvents } from '../../domain/battle/engine'
import { getPlayerTurnNumber } from '../../domain/battle/missionActions'
import type { BattleSession } from '../../domain/battle/types'
import { cauldronEvent, getCauldronEventData } from './events'
import { OFFICIAL_SECONDARY_BY_ID, type OfficialSecondaryDefinition } from './officialSecondaryDefinitions'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { secondaryStrategyFor } from './sessionConfig'
import { getGameSecondaryVp, getRoundSecondaryVp, getSecondaryState, isOfficialSecondary, officialDrawEvents } from './secondary'
import type { OfficialSecondaryId } from './secondaryTypes'

function assertOfficial(session: BattleSession): void {
  if (!isOfficialSecondary(session)) throw new Error('This battle does not use Chapter Approved Secondaries.')
}

export function officialTurnKey(session: BattleSession): string {
  return `${session.state.round}:${session.state.activePlayerId}`
}

export function canScoreOfficialSecondary(session: BattleSession, playerId: string, cardId: OfficialSecondaryId): boolean {
  if (!isOfficialSecondary(session) || session.state.phase !== 'END_TURN' || session.state.status !== 'active') return false
  if (officialWindowAcknowledged(session, playerId)) return false
  const card = getSecondaryState(session)[playerId]?.active.find((entry) => entry.cardId === cardId)
  if (!card) return false
  const definition = OFFICIAL_SECONDARY_BY_ID[cardId]
  const ownTurn = session.state.activePlayerId === playerId
  const lastTurn = session.state.round === session.state.maxRounds
    && session.state.activePlayerId === session.state.turnOrder.at(-1)
  if (definition.scoreAt === 'own' && !ownTurn) return false
  if (definition.scoreAt === 'opponent' && !(lastTurn || (!ownTurn && getCurrentRivalPlayerId(session, playerId) === session.state.activePlayerId))) return false
  if (definition.scoreAt === 'either' && !ownTurn && getCurrentRivalPlayerId(session, playerId) !== session.state.activePlayerId) return false
  if (cardId === 'OFFICIAL_DEFEND_STRONGHOLD' && session.state.round === 1) return false
  if ((cardId === 'OFFICIAL_CLEANSE' || cardId === 'OFFICIAL_PLUNDER') && officialActionCount(session, playerId, cardId) === 0) return false
  if (secondaryStrategyFor(session, playerId) === 'fixed') {
    if (getSecondaryState(session)[playerId].scoreHistory.filter((entry) => entry.cardId === cardId).reduce((sum, entry) => sum + entry.pointsAwarded, 0) >= 20) return false
    return !getSecondaryState(session)[playerId].scoreHistory.some((entry) => entry.cardId === cardId && entry.turnKey === officialTurnKey(session))
  }
  return true
}

export function officialAwards(session: BattleSession, playerId: string, cardId: OfficialSecondaryId): number[] {
  const definition = OFFICIAL_SECONDARY_BY_ID[cardId]
  if (secondaryStrategyFor(session, playerId) !== 'fixed') {
    if (cardId === 'OFFICIAL_DISPLAY_OF_MIGHT') return [session.state.activePlayerId === playerId ? 2 : 5]
    if (cardId === 'OFFICIAL_CLEANSE') return officialActionCount(session, playerId, cardId) >= 2 ? [2, 5] : [2]
    return [...definition.awards]
  }
  if (cardId === 'OFFICIAL_ENGAGE_ON_ALL_FRONTS') return [2, 4]
  if (cardId === 'OFFICIAL_ASSASSINATION') {
    return [...new Set(Array.from({ length: 6 }, (_, index) => index + 1)
      .flatMap((count) => Array.from({ length: count + 1 }, (_, bonus) => count * 3 + bonus)))]
      .filter((points) => points <= 20).sort((a, b) => a - b)
  }
  return [4, 8, 12, 16, 20]
}

export function officialWindowNeedsReview(session: BattleSession, playerId: string): boolean {
  if (!isOfficialSecondary(session) || session.state.phase !== 'END_TURN') return false
  return getSecondaryState(session)[playerId]?.active.some((card) => canScoreOfficialSecondary(session, playerId, card.cardId as OfficialSecondaryId)) ?? false
}

export function officialWindowAcknowledged(session: BattleSession, playerId: string): boolean {
  return getCauldronEventData<{ playerId: string; turnKey: string }>(session, 'SECONDARY_OFFICIAL_WINDOW_ACK')
    .some((entry) => entry.playerId === playerId && entry.turnKey === officialTurnKey(session))
}

export function officialPendingReviewPlayers(session: BattleSession): string[] {
  if (!isOfficialSecondary(session)) return []
  return session.state.turnOrder.filter((playerId) => officialWindowNeedsReview(session, playerId) && !officialWindowAcknowledged(session, playerId))
}

export function acknowledgeOfficialWindow(session: BattleSession, playerId: string): BattleSession {
  assertOfficial(session)
  if (!officialWindowNeedsReview(session, playerId) || officialWindowAcknowledged(session, playerId)) return session
  return dispatchBattleEvents(session, [cauldronEvent('SECONDARY_OFFICIAL_WINDOW_ACK', {
    playerId, turnKey: officialTurnKey(session),
  })], { actorPlayerId: playerId })
}

type OfficialActionStart = { playerId: string; cardId: OfficialSecondaryId; turnKey: string; unit: string; target: string }
export function officialActionCount(session: BattleSession, playerId: string, cardId: OfficialSecondaryId): number {
  return getCauldronEventData<OfficialActionStart>(session, 'SECONDARY_OFFICIAL_ACTION_STARTED')
    .filter((action) => action.playerId === playerId && action.cardId === cardId && action.turnKey === officialTurnKey(session)).length
}

export function startOfficialSecondaryAction(session: BattleSession, playerId: string, cardId: OfficialSecondaryId, unit: string, target: string): BattleSession {
  assertOfficial(session)
  if (session.state.activePlayerId !== playerId || session.state.phase !== 'SHOOTING'
    || (cardId !== 'OFFICIAL_CLEANSE' && cardId !== 'OFFICIAL_PLUNDER')
    || !getSecondaryState(session)[playerId]?.active.some((card) => card.cardId === cardId)) {
    throw new Error('Cleanse or Plunder must be started in your Shooting phase while the card is active.')
  }
  if (!unit.trim() || !target.trim()) throw new Error('Record the unit and objective or terrain area.')
  const starts = getCauldronEventData<OfficialActionStart>(session, 'SECONDARY_OFFICIAL_ACTION_STARTED')
    .filter((action) => action.playerId === playerId && action.cardId === cardId && action.turnKey === officialTurnKey(session))
  if (starts.some((action) => action.unit.toLocaleLowerCase() === unit.trim().toLocaleLowerCase())) throw new Error('This unit already started this action this turn.')
  if (cardId === 'OFFICIAL_PLUNDER' && starts.length > 0) throw new Error('Only one unit can start Plunder per turn.')
  if (cardId === 'OFFICIAL_CLEANSE' && starts.some((action) => action.target.toLocaleLowerCase() === target.trim().toLocaleLowerCase())) {
    throw new Error('Each Cleanse unit must choose a different objective.')
  }
  return dispatchBattleEvents(session, [cauldronEvent('SECONDARY_OFFICIAL_ACTION_STARTED', {
    playerId, cardId, turnKey: officialTurnKey(session), unit: unit.trim().slice(0, 100), target: target.trim().slice(0, 100),
  } satisfies OfficialActionStart)], { actorPlayerId: playerId })
}

export function scoreOfficialSecondary(session: BattleSession, playerId: string, cardId: OfficialSecondaryId, requestedVp: number): BattleSession {
  assertOfficial(session)
  if (!canScoreOfficialSecondary(session, playerId, cardId)) throw new Error('This card cannot score at this turn end or has already scored this turn.')
  if (!officialAwards(session, playerId, cardId).includes(requestedVp)) throw new Error('Choose a valid VP award for this card.')
  const strategy = secondaryStrategyFor(session, playerId)
  const state = getSecondaryState(session)[playerId]
  const cardAlready = state.scoreHistory.filter((entry) => entry.cardId === cardId).reduce((sum, entry) => sum + entry.pointsAwarded, 0)
  const award = Math.max(0, Math.min(requestedVp, 15 - getRoundSecondaryVp(session, playerId), 45 - getGameSecondaryVp(session, playerId), strategy === 'fixed' ? 20 - cardAlready : 5))
  const action = strategy === 'fixed' ? 'SECONDARY_FIXED_SCORED' : 'SECONDARY_COMPLETED'
  return dispatchBattleEvents(session, [
    cauldronEvent(action, {
      playerId, cardId, round: session.state.round, turn: getPlayerTurnNumber(session, playerId),
      turnKey: officialTurnKey(session), pointsAwarded: award,
    }),
    ...(award > 0 ? [{ type: 'SCORE_ADJUSTED' as const, payload: { playerId, category: 'secondary' as const, delta: award } }] : []),
  ], { actorPlayerId: playerId })
}

function isNewDraw(session: BattleSession, playerId: string, cardId: OfficialSecondaryId): boolean {
  const card = getSecondaryState(session)[playerId]?.active.find((entry) => entry.cardId === cardId)
  return Boolean(card && card.drawnRound === session.state.round && card.drawnTurn === getPlayerTurnNumber(session, playerId))
}

export function officialRedrawReason(session: BattleSession, playerId: string, cardId: OfficialSecondaryId): string | undefined {
  if (!isOfficialSecondary(session) || secondaryStrategyFor(session, playerId) === 'fixed'
    || session.state.activePlayerId !== playerId || session.state.phase !== 'COMMAND'
    || !isNewDraw(session, playerId, cardId) || getSecondaryState(session)[playerId].deck.length === 0) return undefined
  const definition: OfficialSecondaryDefinition = OFFICIAL_SECONDARY_BY_ID[cardId]
  if (definition.redraw === 'round-one-optional' && session.state.round === 1) return 'Optional replacement in round 1'
  if (definition.redraw === 'no-target') return 'Optional replacement if no eligible target exists'
  if (definition.redraw === 'plunder-conflict' && getSecondaryState(session)[playerId].active.some((card) => card.cardId === 'OFFICIAL_PLUNDER')) return 'Optional replacement while Plunder is active'
  if (definition.redraw === 'cleanse-conflict' && getSecondaryState(session)[playerId].active.some((card) => card.cardId === 'OFFICIAL_CLEANSE')) return 'Optional replacement while Cleanse is active'
  return undefined
}

export function replaceOfficialSecondary(session: BattleSession, playerId: string, cardId: OfficialSecondaryId, newOrders = false): BattleSession {
  assertOfficial(session)
  if (secondaryStrategyFor(session, playerId) === 'fixed') throw new Error('Fixed cards cannot be redrawn.')
  if (session.state.phase !== 'COMMAND' || session.state.activePlayerId !== playerId) throw new Error('Replace a card in your Command phase.')
  const state = getSecondaryState(session)[playerId]
  if (!state.active.some((card) => card.cardId === cardId) || state.deck.length === 0) throw new Error('No active card or deck card is available.')
  if (newOrders) {
    if (session.state.players[playerId].cp < 1) throw new Error('New Orders costs 1 CP.')
    if (getCauldronEventData<{ playerId: string }>(session, 'SECONDARY_NEW_ORDERS_USED').some((entry) => entry.playerId === playerId)) {
      throw new Error('New Orders is available once per battle.')
    }
  } else if (!officialRedrawReason(session, playerId, cardId)) throw new Error('This card has no available when-drawn replacement.')
  const round = session.state.round
  const turn = getPlayerTurnNumber(session, playerId)
  return dispatchBattleEvents(session, [
    ...(newOrders ? [
      { type: 'CP_SPENT' as const, payload: { playerId, amount: 1 } },
      cauldronEvent('SECONDARY_NEW_ORDERS_USED', { playerId }),
    ] : []),
    cauldronEvent('SECONDARY_DISCARDED', { playerId, cardId, round, turn, reason: newOrders ? 'New Orders' : 'When drawn' }),
    ...officialDrawEvents(playerId, state.deck, 1, round, turn),
  ], { actorPlayerId: playerId })
}

export function discardOfficialAtEndTurn(session: BattleSession, playerId: string, cardIds: readonly OfficialSecondaryId[]): BattleSession {
  assertOfficial(session)
  if (secondaryStrategyFor(session, playerId) === 'fixed') throw new Error('Fixed cards cannot be discarded.')
  if (session.state.phase !== 'END_TURN' || session.state.activePlayerId !== playerId) throw new Error('Discard at the end of your own turn.')
  const unique = [...new Set(cardIds)]
  const active = getSecondaryState(session)[playerId].active
  if (!unique.length || unique.some((cardId) => !active.some((card) => card.cardId === cardId))) throw new Error('Choose one or more active cards.')
  return dispatchBattleEvents(session, [
    ...unique.map((cardId) => cauldronEvent('SECONDARY_DISCARDED', { playerId, cardId, round: session.state.round, turn: getPlayerTurnNumber(session, playerId), reason: 'End of turn' })),
    { type: 'CP_GAINED', payload: { playerId, amount: 1 } },
  ], { actorPlayerId: playerId })
}

export function noteOfficialTarget(session: BattleSession, playerId: string, cardId: OfficialSecondaryId, note: string): BattleSession {
  assertOfficial(session)
  if (!getSecondaryState(session)[playerId]?.active.some((card) => card.cardId === cardId)) throw new Error('This card is not active.')
  if (!['OFFICIAL_A_TEMPTING_TARGET', 'OFFICIAL_BEACON', 'OFFICIAL_BURDEN_OF_TRUST'].includes(cardId)) throw new Error('This card does not choose a target.')
  if (!note.trim()) throw new Error('Enter the selected objective or unit.')
  return dispatchBattleEvents(session, [cauldronEvent('SECONDARY_CARD_STATE_UPDATED', {
    playerId, cardId, patch: { lastConfirmation: note.trim().slice(0, 160) },
  })], { actorPlayerId: playerId })
}
