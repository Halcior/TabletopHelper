import { advancePhase, createBattleSession, dispatchBattleEvents } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import {
  createDuelObjectives,
  DUEL_BATTLE_READY_VP,
  DUEL_BATTLE_ROUNDS,
  DUEL_DEFAULT_OBJECTIVE_COUNT,
  DUEL_MAX_OBJECTIVES,
  DUEL_MIN_OBJECTIVES,
  DUEL_PLAYER_COUNT,
  DUEL_RULESET_ID,
} from './constants'
import { DUEL_FIXED_SECONDARY_CARDS } from './missionData'
import { createDuelCommandDrawEvents, createDuelMissionInitializationEvents } from './missions'
import type {
  DuelConfig,
  DuelGameInput,
  DuelLayoutVariant,
  DuelPlayerMissionConfig,
  DuelTurnPosition,
} from './types'

function defaultMissionConfig(): DuelPlayerMissionConfig {
  return {
    forceDispositionId: 'take-and-hold',
    secondaryMode: 'tactical',
    fixedSecondaryIds: [],
    battleReady: true,
  }
}

function validateDuelInput(input: DuelGameInput): void {
  if (input.players.length !== DUEL_PLAYER_COUNT) throw new Error('Duel 1v1 requires exactly two players.')
  const playerIds = input.players.map((player) => player.id)
  if (new Set(playerIds).size !== DUEL_PLAYER_COUNT) throw new Error('Duel player IDs must be unique.')

  const armyIds = new Set(input.armies.map((army) => army.id))
  for (const player of input.players) {
    if (!armyIds.has(player.armyId)) throw new Error(`${player.name} has no saved army assigned.`)
  }

  const positions = input.players.map((player) => player.turnPosition)
  if (new Set(positions).size !== DUEL_PLAYER_COUNT || !positions.every((position) => position === 1 || position === 2)) {
    throw new Error('Duel turn positions 1 and 2 must each be assigned once.')
  }

  const objectiveCount = Math.floor(input.objectiveCount ?? DUEL_DEFAULT_OBJECTIVE_COUNT)
  if (objectiveCount < DUEL_MIN_OBJECTIVES || objectiveCount > DUEL_MAX_OBJECTIVES) {
    throw new Error(`Duel objective count must be between ${DUEL_MIN_OBJECTIVES} and ${DUEL_MAX_OBJECTIVES}.`)
  }

  const fixedIds = new Set(DUEL_FIXED_SECONDARY_CARDS.map((card) => card.id))
  for (const player of input.players) {
    const config = input.missionConfigs?.[player.id] ?? defaultMissionConfig()
    if (config.secondaryMode === 'fixed') {
      if (config.fixedSecondaryIds.length !== 2 || new Set(config.fixedSecondaryIds).size !== 2) {
        throw new Error(`${player.name} must select exactly two different Fixed Secondaries.`)
      }
      if (config.fixedSecondaryIds.some((id) => !fixedIds.has(id))) {
        throw new Error(`${player.name} selected a Secondary that is not available as Fixed in 11th Edition.`)
      }
    }
  }

  if (input.attackerPlayerId && !playerIds.includes(input.attackerPlayerId)) throw new Error('The Duel attacker must be one of the two players.')
}

export function createDuelGame(input: DuelGameInput): BattleSession {
  validateDuelInput(input)
  const objectiveCount = Math.floor(input.objectiveCount ?? DUEL_DEFAULT_OBJECTIVE_COUNT)
  const turnOrder = [...input.players]
    .sort((left, right) => left.turnPosition - right.turnPosition)
    .map((player) => player.id)
  const attackerPlayerId = input.attackerPlayerId ?? turnOrder[0]
  const layoutVariant: DuelLayoutVariant = input.layoutVariant ?? 'A'
  const playerConfigs = Object.fromEntries(input.players.map((player) => [
    player.id,
    input.missionConfigs?.[player.id] ?? defaultMissionConfig(),
  ]))
  const config: DuelConfig = {
    version: 2,
    objectiveCount,
    attackerPlayerId,
    layoutVariant,
    playerConfigs,
  }
  const armies = [...new Map(input.armies.map((army) => [army.id, army])).values()]

  const base = createBattleSession({
    gameId: input.gameId,
    createdAt: input.createdAt,
    rulesetId: DUEL_RULESET_ID,
    players: input.players.map((player) => ({
      id: player.id,
      name: player.name,
      armyId: player.armyId,
      faction: input.armies.find((army) => army.id === player.armyId)?.faction,
      turnPosition: player.turnPosition,
    })),
    armies,
    turnOrder,
    objectives: createDuelObjectives(objectiveCount),
    maxRounds: DUEL_BATTLE_ROUNDS,
    guidanceLevel: input.guidanceLevel,
    rulesetConfig: config,
  })

  const missionEvents = createDuelMissionInitializationEvents(base)
  const battleReadyEvents = input.players.flatMap((player) => (
    playerConfigs[player.id].battleReady
      ? [{ type: 'SCORE_ADJUSTED', payload: { playerId: player.id, category: 'adjustment', delta: DUEL_BATTLE_READY_VP } } as const]
      : []
  ))
  return dispatchBattleEvents(base, [...missionEvents, ...battleReadyEvents], {
    actionId: `duel-11e-setup-${base.setup.gameId}`,
    actorPlayerId: base.state.activePlayerId,
    undoable: false,
    timestamp: base.setup.createdAt,
  })
}

export function advanceDuelPhase(session: BattleSession): BattleSession {
  const beforePlayer = session.state.activePlayerId
  const beforeRound = session.state.round
  const advanced = advancePhase(session)
  if (advanced === session || advanced.state.status !== 'active') return advanced
  const enteredNewCommand = advanced.state.phase === 'COMMAND'
    && (advanced.state.activePlayerId !== beforePlayer || advanced.state.round !== beforeRound)
  if (!enteredNewCommand) return advanced
  const drawEvents = createDuelCommandDrawEvents(advanced)
  return drawEvents.length > 0
    ? dispatchBattleEvents(advanced, drawEvents, { actorPlayerId: advanced.state.activePlayerId })
    : advanced
}

export function getDuelOpponentPlayerId(session: BattleSession, playerId: string): string {
  if (session.setup.rulesetId !== DUEL_RULESET_ID) throw new Error('This battle is not Duel 1v1.')
  const opponent = session.state.turnOrder.find((candidate) => candidate !== playerId)
  if (!opponent) throw new Error(`Player ${playerId} has no Duel opponent.`)
  return opponent
}

export function randomDuelTurnPositions(random: () => number = Math.random): DuelTurnPosition[] {
  return random() < 0.5 ? [1, 2] : [2, 1]
}
