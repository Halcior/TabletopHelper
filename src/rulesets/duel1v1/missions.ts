import { dispatchBattleEvents } from '../../domain/battle/engine'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import {
  DUEL_FIXED_CARD_GAME_CAP,
  DUEL_PRIMARY_GAME_CAP,
  DUEL_PRIMARY_ROUND_CAP,
  DUEL_RULESET_ID,
  DUEL_SECONDARY_GAME_CAP,
  DUEL_SECONDARY_ROUND_CAP,
  DUEL_TACTICAL_CARD_CAP,
} from './constants'
import { DUEL_SECONDARY_CARDS } from './missionData'
import type { DuelConfig, DuelMissionState, DuelPlayerMissionState } from './types'

const ACTION_INIT = 'DUEL_MISSIONS_INITIALIZED'
const ACTION_DRAW = 'DUEL_SECONDARIES_DRAWN'
const ACTION_SCORE_SECONDARY = 'DUEL_SECONDARY_SCORED'
const ACTION_DISCARD = 'DUEL_SECONDARIES_DISCARDED'
const ACTION_MULLIGAN = 'DUEL_SECONDARY_MULLIGANED'
const ACTION_REDRAW = 'DUEL_SECONDARY_REDRAWN'
const ACTION_PRIMARY = 'DUEL_PRIMARY_SET'

function emptyPlayerState(playerId: string): DuelPlayerMissionState {
  return {
    playerId,
    activeCardIds: [],
    deckCardIds: [],
    discardCardIds: [],
    scoredSecondaries: [],
    primaryByRound: {},
    secondaryByRound: {},
    mulliganUsed: false,
    discardCpRounds: [],
  }
}

function clonePlayerState(state: DuelPlayerMissionState): DuelPlayerMissionState {
  return {
    ...state,
    activeCardIds: [...state.activeCardIds],
    deckCardIds: [...state.deckCardIds],
    discardCardIds: [...state.discardCardIds],
    scoredSecondaries: state.scoredSecondaries.map((entry) => ({ ...entry })),
    primaryByRound: { ...state.primaryByRound },
    secondaryByRound: { ...state.secondaryByRound },
    discardCpRounds: [...state.discardCpRounds],
  }
}

export function getDuelConfig(session: BattleSession): DuelConfig {
  if (session.setup.rulesetId !== DUEL_RULESET_ID) throw new Error('This battle is not Duel 1v1.')
  const config = session.setup.rulesetConfig as DuelConfig | undefined
  if (!config || config.version !== 2) throw new Error('This Duel battle uses an unsupported mission configuration.')
  return config
}

export function duelRulesetEvent(action: string, data: unknown): BattleEventInput {
  return { type: 'RULESET_EVENT', payload: { rulesetId: DUEL_RULESET_ID, action, data } }
}

function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[result[index], result[target]] = [result[target], result[index]]
  }
  return result
}

export function createDuelMissionInitializationEvents(
  session: BattleSession,
  random: () => number = Math.random,
): BattleEventInput[] {
  const config = getDuelConfig(session)
  const secondaryIds = DUEL_SECONDARY_CARDS.map((card) => card.id)
  const events: BattleEventInput[] = []

  for (const playerId of session.state.turnOrder) {
    const playerConfig = config.playerConfigs[playerId]
    if (!playerConfig) throw new Error(`Missing 11th edition mission setup for ${playerId}.`)
    if (playerConfig.secondaryMode === 'fixed') {
      events.push(duelRulesetEvent(ACTION_INIT, {
        playerId,
        activeCardIds: [...playerConfig.fixedSecondaryIds],
        deckCardIds: [],
      }))
      continue
    }

    const deck = shuffle(secondaryIds, random)
    const initialDrawCount = playerId === session.state.activePlayerId ? Math.min(2, deck.length) : 0
    events.push(duelRulesetEvent(ACTION_INIT, {
      playerId,
      activeCardIds: deck.slice(0, initialDrawCount),
      deckCardIds: deck.slice(initialDrawCount),
    }))
  }
  return events
}

export function getDuelMissionState(session: BattleSession): DuelMissionState {
  const state: DuelMissionState = Object.fromEntries(
    session.state.turnOrder.map((playerId) => [playerId, emptyPlayerState(playerId)]),
  )

  for (const event of session.state.events) {
    if (event.type !== 'RULESET_EVENT' || event.payload.rulesetId !== DUEL_RULESET_ID) continue
    const data = event.payload.data as Record<string, unknown> | null
    const playerId = typeof data?.playerId === 'string' ? data.playerId : undefined
    if (!playerId || !state[playerId]) continue
    const player = clonePlayerState(state[playerId])

    if (event.payload.action === ACTION_INIT) {
      player.activeCardIds = Array.isArray(data.activeCardIds) ? data.activeCardIds.filter((id): id is string => typeof id === 'string') : []
      player.deckCardIds = Array.isArray(data.deckCardIds) ? data.deckCardIds.filter((id): id is string => typeof id === 'string') : []
    } else if (event.payload.action === ACTION_DRAW) {
      const cardIds = Array.isArray(data.cardIds) ? data.cardIds.filter((id): id is string => typeof id === 'string') : []
      player.deckCardIds = player.deckCardIds.filter((id) => !cardIds.includes(id))
      player.activeCardIds.push(...cardIds.filter((id) => !player.activeCardIds.includes(id)))
    } else if (event.payload.action === ACTION_SCORE_SECONDARY) {
      const cardId = typeof data.cardId === 'string' ? data.cardId : ''
      const round = typeof data.round === 'number' ? data.round : 0
      const vp = typeof data.vp === 'number' ? data.vp : 0
      if (cardId && round > 0) {
        player.scoredSecondaries.push({ cardId, round, vp })
        player.secondaryByRound[round] = (player.secondaryByRound[round] ?? 0) + vp
        const config = getDuelConfig(session).playerConfigs[playerId]
        if (config?.secondaryMode === 'tactical') {
          player.activeCardIds = player.activeCardIds.filter((id) => id !== cardId)
          if (!player.discardCardIds.includes(cardId)) player.discardCardIds.push(cardId)
        }
      }
    } else if (event.payload.action === ACTION_DISCARD) {
      const cardIds = Array.isArray(data.cardIds) ? data.cardIds.filter((id): id is string => typeof id === 'string') : []
      player.activeCardIds = player.activeCardIds.filter((id) => !cardIds.includes(id))
      for (const cardId of cardIds) if (!player.discardCardIds.includes(cardId)) player.discardCardIds.push(cardId)
      if (data.gainedCp === true && typeof data.round === 'number' && !player.discardCpRounds.includes(data.round)) {
        player.discardCpRounds.push(data.round)
      }
    } else if (event.payload.action === ACTION_MULLIGAN) {
      const cardId = typeof data.cardId === 'string' ? data.cardId : ''
      const replacementCardId = typeof data.replacementCardId === 'string' ? data.replacementCardId : ''
      player.activeCardIds = player.activeCardIds.filter((id) => id !== cardId)
      if (cardId && !player.discardCardIds.includes(cardId)) player.discardCardIds.push(cardId)
      if (replacementCardId) {
        player.deckCardIds = player.deckCardIds.filter((id) => id !== replacementCardId)
        player.activeCardIds.push(replacementCardId)
      }
      player.mulliganUsed = true
    } else if (event.payload.action === ACTION_REDRAW) {
      const cardId = typeof data.cardId === 'string' ? data.cardId : ''
      const replacementCardId = typeof data.replacementCardId === 'string' ? data.replacementCardId : ''
      player.activeCardIds = player.activeCardIds.filter((id) => id !== cardId)
      if (replacementCardId) {
        player.deckCardIds = player.deckCardIds.filter((id) => id !== replacementCardId)
        player.activeCardIds.push(replacementCardId)
      }
      if (cardId) player.deckCardIds.push(cardId)
    } else if (event.payload.action === ACTION_PRIMARY) {
      const round = typeof data.round === 'number' ? data.round : 0
      const vp = typeof data.vp === 'number' ? data.vp : 0
      if (round > 0) player.primaryByRound[round] = vp
    }

    state[playerId] = player
  }

  return state
}

export function createDuelCommandDrawEvents(session: BattleSession, playerId = session.state.activePlayerId): BattleEventInput[] {
  const config = getDuelConfig(session).playerConfigs[playerId]
  if (!config || config.secondaryMode !== 'tactical') return []
  const state = getDuelMissionState(session)[playerId]
  if (!state) return []
  const cardIds = state.deckCardIds.slice(0, 2)
  return cardIds.length > 0 ? [duelRulesetEvent(ACTION_DRAW, { playerId, cardIds })] : []
}

export function scoreDuelSecondary(
  session: BattleSession,
  playerId: string,
  cardId: string,
  requestedVp: number,
  options: { endOfBattle?: boolean } = {},
): BattleSession {
  const config = getDuelConfig(session).playerConfigs[playerId]
  const state = getDuelMissionState(session)[playerId]
  if (!config || !state) throw new Error('Unknown Duel player mission state.')
  if (!state.activeCardIds.includes(cardId)) throw new Error('That Secondary is not active.')

  const round = session.state.round
  const roundTotal = state.secondaryByRound[round] ?? 0
  const gameTotal = Object.values(state.secondaryByRound).reduce((sum, value) => sum + value, 0)
  const cardTotal = state.scoredSecondaries.filter((entry) => entry.cardId === cardId).reduce((sum, entry) => sum + entry.vp, 0)
  const raw = Math.max(0, Math.floor(requestedVp))
  const cardRoom = config.secondaryMode === 'tactical'
    ? DUEL_TACTICAL_CARD_CAP
    : Math.max(0, DUEL_FIXED_CARD_GAME_CAP - cardTotal)
  const roundRoom = options.endOfBattle ? Number.POSITIVE_INFINITY : Math.max(0, DUEL_SECONDARY_ROUND_CAP - roundTotal)
  const gameRoom = Math.max(0, DUEL_SECONDARY_GAME_CAP - gameTotal)
  const vp = Math.min(raw, cardRoom, roundRoom, gameRoom)
  if (vp <= 0) throw new Error('No Secondary VP can be scored from this card right now.')

  return dispatchBattleEvents(session, [
    duelRulesetEvent(ACTION_SCORE_SECONDARY, { playerId, cardId, round, vp, endOfBattle: Boolean(options.endOfBattle) }),
    { type: 'SCORE_ADJUSTED', payload: { playerId, category: 'secondary', delta: vp } },
  ], { actorPlayerId: playerId })
}

export function setDuelPrimaryForRound(
  session: BattleSession,
  playerId: string,
  requestedVp: number,
): BattleSession {
  const state = getDuelMissionState(session)[playerId]
  if (!state) throw new Error('Unknown Duel player mission state.')
  const round = session.state.round
  const previous = state.primaryByRound[round] ?? 0
  const otherRounds = Object.entries(state.primaryByRound)
    .filter(([key]) => Number(key) !== round)
    .reduce((sum, [, value]) => sum + value, 0)
  const vp = Math.max(0, Math.min(Math.floor(requestedVp), DUEL_PRIMARY_ROUND_CAP, DUEL_PRIMARY_GAME_CAP - otherRounds))
  const delta = vp - previous
  if (delta === 0) return session
  return dispatchBattleEvents(session, [
    duelRulesetEvent(ACTION_PRIMARY, { playerId, round, vp }),
    { type: 'SCORE_ADJUSTED', payload: { playerId, category: 'primary', delta } },
  ], { actorPlayerId: playerId })
}

export function discardDuelSecondariesAtEndTurn(
  session: BattleSession,
  playerId: string,
  cardIds: string[],
): BattleSession {
  const config = getDuelConfig(session).playerConfigs[playerId]
  const state = getDuelMissionState(session)[playerId]
  if (!config || config.secondaryMode !== 'tactical' || !state) throw new Error('Only Tactical Secondaries can be discarded.')
  const unique = [...new Set(cardIds)].filter((id) => state.activeCardIds.includes(id))
  if (unique.length === 0) return session
  const gainedCp = !state.discardCpRounds.includes(session.state.round)
  return dispatchBattleEvents(session, [
    duelRulesetEvent(ACTION_DISCARD, { playerId, cardIds: unique, round: session.state.round, gainedCp }),
    ...(gainedCp ? [{ type: 'CP_GAINED', payload: { playerId, amount: 1 } } as BattleEventInput] : []),
  ], { actorPlayerId: playerId })
}

export function mulliganDuelSecondary(session: BattleSession, playerId: string, cardId: string): BattleSession {
  const config = getDuelConfig(session).playerConfigs[playerId]
  const state = getDuelMissionState(session)[playerId]
  if (!config || config.secondaryMode !== 'tactical' || !state) throw new Error('Only Tactical Secondaries can be replaced.')
  if (state.mulliganUsed) throw new Error('The once-per-battle Secondary replacement has already been used.')
  if (!state.activeCardIds.includes(cardId)) throw new Error('That Secondary is not active.')
  if (session.state.players[playerId]?.cp < 1) throw new Error('You need 1 CP to replace an active Secondary.')
  const replacementCardId = state.deckCardIds[0]
  if (!replacementCardId) throw new Error('The Secondary deck is exhausted.')
  return dispatchBattleEvents(session, [
    { type: 'CP_SPENT', payload: { playerId, amount: 1 } },
    duelRulesetEvent(ACTION_MULLIGAN, { playerId, cardId, replacementCardId }),
  ], { actorPlayerId: playerId })
}

export function redrawDuelSecondary(session: BattleSession, playerId: string, cardId: string): BattleSession {
  const config = getDuelConfig(session).playerConfigs[playerId]
  const state = getDuelMissionState(session)[playerId]
  const card = DUEL_SECONDARY_CARDS.find((entry) => entry.id === cardId)
  if (!config || config.secondaryMode !== 'tactical' || !state || !card) throw new Error('That Tactical Secondary cannot be redrawn.')
  if (!state.activeCardIds.includes(cardId)) throw new Error('That Secondary is not active.')
  if (card.on_draw == null) throw new Error('This Secondary has no When Drawn replacement rule.')
  const replacementCardId = state.deckCardIds[0]
  if (!replacementCardId) throw new Error('The Secondary deck is exhausted.')
  return dispatchBattleEvents(session, [
    duelRulesetEvent(ACTION_REDRAW, { playerId, cardId, replacementCardId }),
  ], { actorPlayerId: playerId })
}

export function totalDuelPrimary(session: BattleSession, playerId: string): number {
  return Object.values(getDuelMissionState(session)[playerId]?.primaryByRound ?? {}).reduce((sum, value) => sum + value, 0)
}

export function totalDuelSecondary(session: BattleSession, playerId: string): number {
  return Object.values(getDuelMissionState(session)[playerId]?.secondaryByRound ?? {}).reduce((sum, value) => sum + value, 0)
}
