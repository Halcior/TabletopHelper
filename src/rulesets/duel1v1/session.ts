import { createBattleSession } from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import {
  createDuelObjectives,
  DUEL_BATTLE_ROUNDS,
  DUEL_DEFAULT_OBJECTIVE_COUNT,
  DUEL_MAX_OBJECTIVES,
  DUEL_MIN_OBJECTIVES,
  DUEL_PLAYER_COUNT,
  DUEL_RULESET_ID,
} from './constants'
import type { DuelConfig, DuelGameInput, DuelTurnPosition } from './types'

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
}

export function createDuelGame(input: DuelGameInput): BattleSession {
  validateDuelInput(input)
  const objectiveCount = Math.floor(input.objectiveCount ?? DUEL_DEFAULT_OBJECTIVE_COUNT)
  const config: DuelConfig = { version: 1, objectiveCount }
  const turnOrder = [...input.players]
    .sort((left, right) => left.turnPosition - right.turnPosition)
    .map((player) => player.id)
  const armies = [...new Map(input.armies.map((army) => [army.id, army])).values()]

  return createBattleSession({
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
