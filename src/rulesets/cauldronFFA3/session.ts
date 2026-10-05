import {
  createBattleSession,
  dispatchBattleEvents,
  getPhaseTransitionEvents,
} from '../../domain/battle/engine'
import type { BattleSession } from '../../domain/battle/types'
import {
  CAULDRON_BATTLE_ROUNDS,
  CAULDRON_DUEL_PLAYER_COUNT,
  CAULDRON_PLAYER_COUNT,
  CAULDRON_PRIMARY_CAP,
  CAULDRON_RULESET_ID,
  CAULDRON_SECONDARY_CAP,
  CAULDRON_TOTAL_CAP,
  OFFICIAL_DUEL_OBJECTIVES,
  OFFICIAL_FFA_OBJECTIVES,
  OPERATIONAL_PLAN_IDS,
  cauldronObjectivesForPlayerCount,
} from './constants'
import { cauldronEvent } from './events'
import { officialPendingChoices, officialPendingReviewPlayers } from './officialSecondary'
import { isOfficialPrimary, OFFICIAL_PRIMARY_MISSIONS } from './officialPrimary'
import { FFA_PRIMARY_BALANCE_VERSION } from './officialPrimaryBalance'
import { DISPOSITIONS, getDuelConditions, getDuelPrimaryCommit, isDuelPrimary } from './duelPrimary'
import { getPrimaryTurnCommit } from './primary'
import { addSnapshotEvents, captureRoundSnapshot, captureTurnSnapshot } from './snapshots'
import {
  addSecondaryRefillEvents,
  createEndTurnSecondaryEvents,
  createSecondaryInitializationEvents,
  getSecondaryState,
} from './secondary'
import type { CauldronConfig, CauldronGameInput, DeploymentZone, TurnPosition } from './types'

function validateCauldronInput(input: CauldronGameInput): void {
  const playerCount = input.players.length
  if (playerCount !== CAULDRON_DUEL_PLAYER_COUNT && playerCount !== CAULDRON_PLAYER_COUNT) {
    throw new Error('Cauldron requires either two players (Duel) or three players (FFA 3).')
  }
  const armyIds = new Set(input.armies.map((army) => army.id))
  const playerIds = input.players.map((player) => player.id)
  if (new Set(playerIds).size !== playerCount) throw new Error('Cauldron player IDs must be unique.')
  for (const player of input.players) {
    if (!armyIds.has(player.armyId)) throw new Error(`${player.name} has no saved army assigned.`)
    if (!OPERATIONAL_PLAN_IDS.includes(player.operationalPlanId)) throw new Error(`${player.name} has an invalid Operational Plan.`)
    if (input.primaryDeck === 'chapter-approved-ffa' && (!player.officialPrimaryId || !OFFICIAL_PRIMARY_MISSIONS[player.officialPrimaryId])) {
      throw new Error(`Choose an 11th edition Primary for ${player.name}.`)
    }
    if (input.primaryDeck === 'chapter-approved-duel' && (!player.forceDisposition || !DISPOSITIONS.includes(player.forceDisposition))) {
      throw new Error(`Choose a Force Disposition for ${player.name}.`)
    }
  }
  if (input.primaryDeck === 'chapter-approved-ffa') {
    if (playerCount !== 3) throw new Error('The 11th edition Primary FFA adaptation requires three players.')
    if (input.players.some((player) => player.officialPrimaryId === 'gather-intel') && input.objectiveLayout !== 'expanded-7' && input.secondaryDeck !== 'chapter-approved') {
      throw new Error('Gather Intel needs the 7-objective layout with CENTER.')
    }
  }
  if (input.primaryDeck === 'chapter-approved-duel' && (playerCount !== 2 || input.secondaryDeck !== 'chapter-approved')) {
    throw new Error('The 11th edition duel requires two players and Chapter Approved Secondaries.')
  }
  const zones = input.players.map((player) => player.deploymentZone)
  const turns = input.players.map((player) => player.turnPosition)
  if (new Set(zones).size !== playerCount) throw new Error('Every Cauldron player needs a unique deployment zone.')
  if (new Set(turns).size !== playerCount) throw new Error('Every Cauldron player needs a unique turn position.')
  if (playerCount === 2) {
    if (zones.some((zone) => zone !== 'A' && zone !== 'B')) throw new Error('Cauldron Duel uses deployment zones A and B.')
    if (turns.some((turn) => turn !== 1 && turn !== 2)) throw new Error('Cauldron Duel uses turn positions 1 and 2.')
  }
}

export function createCauldronGame(input: CauldronGameInput): BattleSession {
  validateCauldronInput(input)
  const playerCount = input.players.length as 2 | 3
  const mode = input.mode ?? (playerCount === 2 ? 'duel' : 'ffa3')
  const objectiveLayout = playerCount === CAULDRON_DUEL_PLAYER_COUNT
    ? 'classic-6'
    : input.secondaryDeck === 'chapter-approved' ? 'expanded-7' : input.objectiveLayout ?? 'classic-6'
  const config: CauldronConfig = {
    version: 1,
    mode,
    playerCount,
    objectiveLayout,
    primaryDeck: input.primaryDeck ?? 'cauldron',
    officialPrimaryBalance: input.primaryDeck === 'chapter-approved-ffa'
      ? input.officialPrimaryBalance ?? FFA_PRIMARY_BALANCE_VERSION : undefined,
    secondaryDeck: input.secondaryDeck ?? 'cauldron',
    officialSecondaryStrategy: input.officialSecondaryStrategy ?? 'tactical',
    officialSecondaryStrategies: input.officialSecondaryStrategies,
    officialLayout: input.officialLayout,
    fixedSecondarySelections: input.fixedSecondarySelections,
    battleRounds: CAULDRON_BATTLE_ROUNDS,
    primaryCap: CAULDRON_PRIMARY_CAP,
    secondaryCap: CAULDRON_SECONDARY_CAP,
    totalCap: input.primaryDeck === 'chapter-approved-duel' ? 100 : CAULDRON_TOTAL_CAP,
    playerConfigs: Object.fromEntries(input.players.map((player) => [player.id, {
      deploymentZone: player.deploymentZone,
      turnPosition: player.turnPosition,
      initialOperationalPlanId: player.operationalPlanId,
      officialPrimaryId: player.officialPrimaryId,
      forceDisposition: player.forceDisposition,
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
  // Hotfix 2.1.1: this order is fixed for all five Battle Rounds. No later initiative reroll exists.
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
    objectives: input.primaryDeck === 'chapter-approved-duel' ? OFFICIAL_DUEL_OBJECTIVES
      : playerCount === 3 && input.secondaryDeck === 'chapter-approved' ? OFFICIAL_FFA_OBJECTIVES
      : cauldronObjectivesForPlayerCount(playerCount, objectiveLayout),
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
  if (officialPendingChoices(session, session.state.activePlayerId).length > 0) {
    throw new Error('Save the when-drawn Secondary choices before leaving your Command phase: selected objective, Beacon unit or guarding units.')
  }
  if (isCauldronEndOfRound(session)) {
    throw new Error('Review the final turn and resolve end-of-round Wyniszczenie before ending the Battle Round.')
  }
  const secondaryState = getSecondaryState(session)[session.state.activePlayerId]
  if (secondaryState?.pendingEliminationChoice) {
    throw new Error('Resolve the pending Secondary scoring choice before continuing.')
  }
  let secondaryEvents: ReturnType<typeof createEndTurnSecondaryEvents> = []
  if (isDuelPrimary(session) && session.state.phase === 'COMMAND' && session.state.round >= 2 && session.state.round < 5) {
    if (!getDuelPrimaryCommit(session, session.state.activePlayerId, 'command')) throw new Error('Review your Command-phase Primary before continuing.')
  }
  if (session.state.phase === 'END_TURN') {
    if (officialPendingReviewPlayers(session).length > 0) throw new Error('Wait until each commander has reviewed eligible Chapter Approved cards for this turn.')
    if (Object.values(session.state.missionActions).some((action) => (
      action.playerId === session.state.activePlayerId && action.status === 'ACTIVE'
    ))) throw new Error('Resolve active Mission Actions before ending the turn.')
    if (isDuelPrimary(session)) {
      for (const playerId of session.state.turnOrder) {
        if ((playerId === session.state.activePlayerId || getDuelConditions(session, playerId, 'turn').some((condition) => condition.window === 'either'))
          && !getDuelPrimaryCommit(session, playerId, 'turn')) throw new Error('Review each eligible 11th edition Primary at the end of this turn.')
      }
    } else if (!getPrimaryTurnCommit(session, session.state.activePlayerId, session.state.round)) {
      throw new Error('Resolve this player’s end-turn Primary before ending the turn.')
    }
    secondaryEvents = createEndTurnSecondaryEvents(session, session.state.activePlayerId)
  }
  const transitions = getPhaseTransitionEvents(session)
  const withSnapshots = addSnapshotEvents(session, transitions)
  const commandSnapshot = isOfficialPrimary(session) && session.state.phase === 'COMMAND'
    ? [cauldronEvent('PRIMARY_11TH_COMMAND_SNAPSHOT', captureTurnSnapshot(session, session.state.activePlayerId, session.state.round))]
    : []
  const events = [...secondaryEvents, ...commandSnapshot, ...addSecondaryRefillEvents(session, withSnapshots)]
  return transitions.length === 0
    ? session
    : dispatchBattleEvents(session, events, {
      actorPlayerId: session.state.activePlayerId,
    })
}


export function randomDeploymentZones(playerCount: 2 | 3 = 3): DeploymentZone[] {
  return shuffle(playerCount === 2 ? ['A', 'B'] : ['A', 'B', 'C'])
}

export function randomTurnPositions(playerCount: 2 | 3 = 3): TurnPosition[] {
  return shuffle(playerCount === 2 ? [1, 2] : [1, 2, 3])
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
