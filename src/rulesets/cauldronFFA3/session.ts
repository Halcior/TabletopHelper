import {
  createBattleSession,
  dispatchBattleEvents,
  getPhaseTransitionEvents,
} from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import {
  CAULDRON_BATTLE_ROUNDS,
  CAULDRON_OBJECTIVES,
  CAULDRON_PLAYER_COUNT,
  CAULDRON_PRIMARY_CAP,
  CAULDRON_RULESET_ID,
  CAULDRON_SECONDARY_CAP,
  CAULDRON_TOTAL_CAP,
  OPERATIONAL_PLAN_IDS,
} from './constants'
import { cauldronEvent } from './events'
import { addSnapshotEvents, captureRoundSnapshot, captureTurnSnapshot } from './snapshots'
import {
  addSecondaryRefillEvents,
  createEndTurnSecondaryEvents,
  createSecondaryInitializationEvents,
  getSecondaryState,
} from './secondary'
import type { CauldronConfig, CauldronGameInput, DeploymentZone, TurnPosition } from './types'

function validateCauldronInput(input: CauldronGameInput): void {
  if (input.players.length !== CAULDRON_PLAYER_COUNT) throw new Error('Cauldron FFA 3 requires exactly three players.')
  const armyIds = new Set(input.armies.map((army) => army.id))
  const playerIds = input.players.map((player) => player.id)
  if (new Set(playerIds).size !== CAULDRON_PLAYER_COUNT) throw new Error('Cauldron player IDs must be unique.')
  for (const player of input.players) {
    if (!armyIds.has(player.armyId)) throw new Error(`${player.name} has no saved army assigned.`)
    if (!OPERATIONAL_PLAN_IDS.includes(player.operationalPlanId)) throw new Error(`${player.name} has an invalid Operational Plan.`)
  }
  const zones = input.players.map((player) => player.deploymentZone)
  const turns = input.players.map((player) => player.turnPosition)
  if (new Set(zones).size !== CAULDRON_PLAYER_COUNT) throw new Error('Deployment zones A, B, and C must each be assigned once.')
  if (new Set(turns).size !== CAULDRON_PLAYER_COUNT) throw new Error('Turn positions 1, 2, and 3 must each be assigned once.')
}

export function createCauldronGame(input: CauldronGameInput): BattleSession {
  validateCauldronInput(input)
  const config: CauldronConfig = {
    version: 1,
    battleRounds: CAULDRON_BATTLE_ROUNDS,
    primaryCap: CAULDRON_PRIMARY_CAP,
    secondaryCap: CAULDRON_SECONDARY_CAP,
    totalCap: CAULDRON_TOTAL_CAP,
    playerConfigs: Object.fromEntries(input.players.map((player) => [player.id, {
      deploymentZone: player.deploymentZone,
      turnPosition: player.turnPosition,
      initialOperationalPlanId: player.operationalPlanId,
    }])),
  }
  const players = input.players.map((player) => ({
    id: player.id,
    name: player.name,
    armyId: player.armyId,
    faction: input.armies.find((army) => army.id === player.armyId)?.faction,
    deploymentZone: player.deploymentZone,
    turnPosition: player.turnPosition,
  }))
  const turnOrder = [...input.players]
    .sort((left, right) => left.turnPosition - right.turnPosition)
    .map((player) => player.id)
  let session = createBattleSession({
    gameId: input.gameId,
    createdAt: input.createdAt,
    rulesetId: CAULDRON_RULESET_ID,
    players,
    armies: [...new Map(input.armies.map((army) => [army.id, army])).values()],
    turnOrder,
    objectives: CAULDRON_OBJECTIVES,
    maxRounds: CAULDRON_BATTLE_ROUNDS,
    guidanceLevel: input.guidanceLevel,
    rulesetConfig: config,
  })
  session = dispatchBattleEvents(session, [
    cauldronEvent('ROUND_SNAPSHOT_CAPTURED', captureRoundSnapshot(session, 1)),
    cauldronEvent('TURN_SNAPSHOT_CAPTURED', captureTurnSnapshot(session, turnOrder[0], 1)),
    ...createSecondaryInitializationEvents(session, input.secondaryDeckOrders),
  ], { undoable: false, timestamp: session.setup.createdAt })
  return session
}

export function isCauldronEndOfRound(session: BattleSession): boolean {
  return session.state.phase === 'END_TURN'
    && session.state.activePlayerId === session.state.turnOrder.at(-1)
}

export function advanceCauldronPhase(session: BattleSession): BattleSession {
  if (isCauldronEndOfRound(session)) throw new Error('Review and confirm Cauldron Primary before ending the Battle Round.')
  const secondaryState = getSecondaryState(session)[session.state.activePlayerId]
  if (secondaryState?.pendingEliminationChoice) {
    throw new Error('Resolve the pending Secondary scoring choice before continuing.')
  }
  let secondaryEvents: ReturnType<typeof createEndTurnSecondaryEvents> = []
  if (session.state.phase === 'END_TURN') {
    if (Object.values(session.state.missionActions).some((action) => (
      action.playerId === session.state.activePlayerId && action.status === 'ACTIVE'
    ))) throw new Error('Resolve active Mission Actions before ending the turn.')
    secondaryEvents = createEndTurnSecondaryEvents(session, session.state.activePlayerId)
  }
  const transitions = getPhaseTransitionEvents(session)
  const withSnapshots = addSnapshotEvents(session, transitions)
  const events = [...secondaryEvents, ...addSecondaryRefillEvents(session, withSnapshots)]
  return transitions.length === 0
    ? session
    : dispatchBattleEvents(session, events, {
      actorPlayerId: session.state.activePlayerId,
    })
}

export function randomDeploymentZones(): DeploymentZone[] {
  return shuffle(['A', 'B', 'C'])
}

export function randomTurnPositions(): TurnPosition[] {
  return shuffle([1, 2, 3])
}

function shuffle<T>(values: T[]): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const current = result[index]
    result[index] = result[randomIndex]
    result[randomIndex] = current
  }
  return result
}
