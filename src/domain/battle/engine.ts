import { z } from 'zod'
import type { UnitDefinition, UnitState } from '../army/types'
import { isReactionWindowBlocking, withReactionResponse } from '../stratagems/reactionEngine'
import {
  createEmptyTimingState,
  recordUsage,
  resetBattleRoundUsage,
  resetPhaseUsage,
  resetTurnUsage,
} from '../stratagems/usage'
import { resolveObjectiveController } from './objectives'
import {
  BATTLE_PHASES,
  type BattleEvent,
  type BattleEventInput,
  type BattleSession,
  type BattleSetup,
  type GameState,
  type ObjectiveControlSnapshot,
  type PlayerSetup,
} from './types'

export type CreateBattleInput = {
  gameId?: string
  rulesetId: string
  players: PlayerSetup[]
  armies?: BattleSetup['armies'][string][]
  turnOrder?: string[]
  objectives?: BattleSetup['objectives']
  maxRounds?: number
  guidanceLevel?: BattleSetup['guidanceLevel']
  rulesetConfig?: unknown
  createdAt?: string
}

type EventOptions = {
  actionId?: string
  actorPlayerId?: string
  timestamp?: string
  undoable?: boolean
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${suffix}`
}

function score(): GameState['players'][string]['score'] {
  return { primary: 0, secondary: 0, plan: 0, adjustment: 0 }
}

function initialUnitState(unit: UnitDefinition): UnitState {
  return {
    unitId: unit.id,
    modelsAlive: unit.startingModels,
    woundsRemaining: unit.startingModels === 1 ? unit.stats?.wounds : undefined,
    currentModelWounds: unit.startingModels > 1 ? unit.stats?.wounds : undefined,
    destroyed: false,
    battleShocked: false,
    inReserve: false,
    oncePerBattleAbilities: {},
  }
}

function validateSetup(input: CreateBattleInput): BattleSetup {
  if (input.players.length === 0) throw new Error('A battle requires at least one player.')
  const playerIds = input.players.map((player) => player.id)
  if (new Set(playerIds).size !== playerIds.length) throw new Error('Player IDs must be unique.')
  const turnOrder = input.turnOrder ?? playerIds
  if (turnOrder.length !== playerIds.length || turnOrder.some((id) => !playerIds.includes(id))) {
    throw new Error('Turn order must contain every player exactly once.')
  }
  if (new Set(turnOrder).size !== turnOrder.length) throw new Error('Turn order cannot contain duplicates.')
  const objectives = input.objectives ?? []
  if (new Set(objectives.map((objective) => objective.id)).size !== objectives.length) {
    throw new Error('Objective IDs must be unique.')
  }

  const armies = Object.fromEntries((input.armies ?? []).map((army) => [army.id, army]))
  for (const player of input.players) {
    if (player.armyId && !armies[player.armyId]) {
      throw new Error(`Player ${player.name} references unknown army ${player.armyId}.`)
    }
  }

  return {
    gameId: input.gameId ?? createId('battle'),
    rulesetId: input.rulesetId,
    players: input.players,
    armies,
    turnOrder,
    objectives,
    maxRounds: Math.max(1, Math.floor(input.maxRounds ?? 5)),
    guidanceLevel: input.guidanceLevel ?? 'guided',
    rulesetConfig: input.rulesetConfig,
    createdAt: input.createdAt ?? new Date().toISOString(),
  }
}

function baseState(setup: BattleSetup): GameState {
  const activePlayerId = setup.turnOrder[0]
  const players = Object.fromEntries(setup.players.map((player) => [player.id, {
    id: player.id,
    name: player.name,
    faction: player.faction ?? (player.armyId ? setup.armies[player.armyId]?.faction : undefined),
    armyId: player.armyId,
    deploymentZone: player.deploymentZone,
    turnPosition: player.turnPosition,
    cp: Math.max(0, player.startingCp ?? 0),
    score: score(),
    units: Object.fromEntries((player.armyId ? setup.armies[player.armyId]?.units ?? [] : []).map((unit) => [unit.id, initialUnitState(unit)])),
  }]))
  const objectives = Object.fromEntries(setup.objectives.map((objective) => [objective.id, {
    ...objective,
    playerOC: Object.fromEntries(setup.players.map((player) => [player.id, 0])),
    controllerPlayerId: null,
  }]))
  return {
    gameId: setup.gameId,
    rulesetId: setup.rulesetId,
    status: 'active',
    round: 1,
    activePlayerId,
    phase: 'COMMAND',
    turnOrder: [...setup.turnOrder],
    maxRounds: setup.maxRounds,
    players,
    objectives,
    snapshots: { roundStart: [], turnStart: [] },
    timing: createEmptyTimingState(),
    missionActions: {},
    events: [],
    createdAt: setup.createdAt,
    updatedAt: setup.createdAt,
  }
}

function objectiveSnapshot(state: GameState, timestamp: string, playerId?: string): ObjectiveControlSnapshot {
  return {
    round: state.round,
    playerId,
    objectiveControllers: Object.fromEntries(
      Object.values(state.objectives).map((objective) => [objective.id, objective.controllerPlayerId]),
    ),
    objectiveStates: Object.fromEntries(
      Object.values(state.objectives).map((objective) => [objective.id, {
        controllerPlayerId: objective.controllerPlayerId,
        playerOC: { ...objective.playerOC },
      }]),
    ),
    capturedAt: timestamp,
  }
}

function requirePlayer(state: GameState, playerId: string) {
  const player = state.players[playerId]
  if (!player) throw new Error(`Unknown player: ${playerId}`)
  return player
}

function requireUnit(state: GameState, playerId: string, unitId: string): UnitState {
  const unit = requirePlayer(state, playerId).units[unitId]
  if (!unit) throw new Error(`Unknown unit ${unitId} for player ${playerId}`)
  return unit
}

function requireObjective(state: GameState, objectiveId: string) {
  const objective = state.objectives[objectiveId]
  if (!objective) throw new Error(`Unknown objective: ${objectiveId}`)
  return objective
}

function unitDefinition(setup: BattleSetup, playerId: string, unitId: string): UnitDefinition | undefined {
  const armyId = setup.players.find((player) => player.id === playerId)?.armyId
  return armyId ? setup.armies[armyId]?.units.find((unit) => unit.id === unitId) : undefined
}

function applyEvent(state: GameState, event: BattleEvent, setup: BattleSetup): void {
  state.updatedAt = event.timestamp
  switch (event.type) {
    case 'GAME_STARTED':
      state.status = 'active'
      return
    case 'GAME_ENDED':
      state.status = 'completed'
      return
    case 'GAME_ABANDONED':
      state.status = 'abandoned'
      return
    case 'ROUND_STARTED':
      state.round = event.payload.round
      state.timing.stratagemUsage = resetBattleRoundUsage(state.timing.stratagemUsage)
      state.snapshots.roundStart.push(objectiveSnapshot(state, event.timestamp))
      return
    case 'ROUND_ENDED':
      return
    case 'TURN_STARTED':
      requirePlayer(state, event.payload.playerId)
      state.activePlayerId = event.payload.playerId
      state.phase = 'COMMAND'
      state.timing.stratagemUsage = resetTurnUsage(state.timing.stratagemUsage)
      state.snapshots.turnStart.push(objectiveSnapshot(state, event.timestamp, event.payload.playerId))
      return
    case 'TURN_ENDED':
      return
    case 'PHASE_CHANGED':
      state.phase = event.payload.phase
      state.timing.stratagemUsage = resetPhaseUsage(state.timing.stratagemUsage)
      return
    case 'CP_GAINED': {
      const player = requirePlayer(state, event.payload.playerId)
      player.cp += Math.max(0, event.payload.amount)
      return
    }
    case 'CP_SPENT': {
      const player = requirePlayer(state, event.payload.playerId)
      player.cp = Math.max(0, player.cp - Math.max(0, event.payload.amount))
      return
    }
    case 'SCORE_ADJUSTED': {
      const player = requirePlayer(state, event.payload.playerId)
      player.score[event.payload.category] = Math.max(0, player.score[event.payload.category] + event.payload.delta)
      return
    }
    case 'STATE_CORRECTED': {
      const reason = event.payload.reason.trim()
      if (!reason) throw new Error('A correction requires a reason.')
      const correction = event.payload.correction
      switch (correction.kind) {
        case 'CP':
          requirePlayer(state, correction.playerId).cp = Math.max(0, Math.floor(correction.value))
          return
        case 'SCORE':
          requirePlayer(state, correction.playerId).score[correction.category] = Math.max(0, Math.floor(correction.value))
          return
        case 'UNIT_MODELS': {
          const unit = requireUnit(state, correction.playerId, correction.unitId)
          const definition = unitDefinition(setup, correction.playerId, correction.unitId)
          unit.modelsAlive = Math.max(0, Math.min(definition?.startingModels ?? correction.value, Math.floor(correction.value)))
          unit.destroyed = unit.modelsAlive === 0
          if (unit.destroyed) unit.woundsRemaining = 0
          if (!unit.destroyed && definition?.startingModels === 1 && unit.woundsRemaining === 0) {
            unit.woundsRemaining = definition.stats?.wounds
          }
          return
        }
        case 'UNIT_WOUNDS': {
          const unit = requireUnit(state, correction.playerId, correction.unitId)
          const definition = unitDefinition(setup, correction.playerId, correction.unitId)
          const maximum = definition?.stats?.wounds ?? Number.POSITIVE_INFINITY
          unit.woundsRemaining = Math.max(0, Math.min(maximum, Math.floor(correction.value)))
          unit.destroyed = unit.woundsRemaining === 0
          if (definition?.startingModels === 1) unit.modelsAlive = unit.destroyed ? 0 : 1
          return
        }
        case 'UNIT_BATTLESHOCK':
          requireUnit(state, correction.playerId, correction.unitId).battleShocked = correction.value
          return
        case 'OBJECTIVE_CONTROL':
          if (correction.controllerPlayerId !== null) requirePlayer(state, correction.controllerPlayerId)
          requireObjective(state, correction.objectiveId).controllerPlayerId = correction.controllerPlayerId
          return
        case 'OBJECTIVE_OC': {
          requirePlayer(state, correction.playerId)
          const objective = requireObjective(state, correction.objectiveId)
          objective.playerOC[correction.playerId] = Math.max(0, Math.floor(correction.value))
          objective.controllerPlayerId = resolveObjectiveController(objective.playerOC)
          return
        }
      }
    }
    case 'UNIT_MODEL_DESTROYED': {
      const unit = requireUnit(state, event.payload.playerId, event.payload.unitId)
      unit.modelsAlive = Math.max(0, unit.modelsAlive - Math.max(1, event.payload.amount))
      unit.destroyed = unit.modelsAlive === 0
      if (unit.destroyed) unit.woundsRemaining = 0
      return
    }
    case 'UNIT_MODEL_RESTORED': {
      const unit = requireUnit(state, event.payload.playerId, event.payload.unitId)
      const definition = unitDefinition(setup, event.payload.playerId, event.payload.unitId)
      unit.modelsAlive = Math.min(definition?.startingModels ?? unit.modelsAlive, unit.modelsAlive + Math.max(1, event.payload.amount))
      unit.destroyed = unit.modelsAlive === 0
      if (!unit.destroyed && definition?.startingModels === 1 && unit.woundsRemaining === 0) {
        unit.woundsRemaining = definition.stats?.wounds
      }
      return
    }
    case 'UNIT_WOUNDS_CHANGED': {
      const unit = requireUnit(state, event.payload.playerId, event.payload.unitId)
      const definition = unitDefinition(setup, event.payload.playerId, event.payload.unitId)
      const maximum = definition?.stats?.wounds ?? Number.POSITIVE_INFINITY
      unit.woundsRemaining = Math.max(0, Math.min(maximum, event.payload.woundsRemaining))
      unit.destroyed = unit.woundsRemaining === 0
      if (definition?.startingModels === 1) unit.modelsAlive = unit.destroyed ? 0 : 1
      return
    }
    case 'UNIT_DESTROYED': {
      const unit = requireUnit(state, event.payload.playerId, event.payload.unitId)
      unit.modelsAlive = 0
      unit.woundsRemaining = 0
      unit.destroyed = true
      return
    }
    case 'UNIT_BATTLESHOCK_CHANGED':
      requireUnit(state, event.payload.playerId, event.payload.unitId).battleShocked = event.payload.battleShocked
      return
    case 'BATTLESHOCK_TEST_RESOLVED':
      requireUnit(state, event.payload.playerId, event.payload.unitId).battleShocked = !event.payload.passed
      return
    case 'ABILITY_USED':
      requireUnit(state, event.payload.playerId, event.payload.unitId)
        .oncePerBattleAbilities[event.payload.abilityName] = event.payload.used
      return
    case 'OBJECTIVE_OC_CHANGED': {
      requirePlayer(state, event.payload.playerId)
      const objective = requireObjective(state, event.payload.objectiveId)
      objective.playerOC[event.payload.playerId] = Math.max(0, event.payload.oc)
      objective.controllerPlayerId = resolveObjectiveController(objective.playerOC)
      return
    }
    case 'OBJECTIVE_CONTROL_CHANGED': {
      if (event.payload.controllerPlayerId !== null) requirePlayer(state, event.payload.controllerPlayerId)
      requireObjective(state, event.payload.objectiveId).controllerPlayerId = event.payload.controllerPlayerId
      return
    }
    case 'MISSION_ACTION_STARTED': {
      const action = event.payload.action
      requirePlayer(state, action.playerId)
      requireUnit(state, action.playerId, action.unitId)
      if (state.missionActions[action.id]) throw new Error(`Mission Action already exists: ${action.id}`)
      state.missionActions[action.id] = structuredClone(action)
      return
    }
    case 'MISSION_ACTION_COMPLETED': {
      const action = state.missionActions[event.payload.actionId]
      if (!action) throw new Error(`Unknown Mission Action: ${event.payload.actionId}`)
      action.status = 'COMPLETED'
      action.endedRound = event.payload.endedRound
      action.endedTurn = event.payload.endedTurn
      return
    }
    case 'MISSION_ACTION_FAILED': {
      const action = state.missionActions[event.payload.actionId]
      if (!action) throw new Error(`Unknown Mission Action: ${event.payload.actionId}`)
      action.status = 'FAILED'
      action.endedRound = event.payload.endedRound
      action.endedTurn = event.payload.endedTurn
      action.failureReason = event.payload.reason
      return
    }
    case 'MISSION_ACTION_CANCELLED': {
      const action = state.missionActions[event.payload.actionId]
      if (!action) throw new Error(`Unknown Mission Action: ${event.payload.actionId}`)
      action.status = 'CANCELLED'
      action.endedRound = event.payload.endedRound
      action.endedTurn = event.payload.endedTurn
      action.failureReason = event.payload.reason
      return
    }
    case 'REACTION_WINDOW_OPENED':
    case 'REACTION_HOLD_REQUESTED':
    case 'REACTION_HOLD_REFINED':
      state.timing.reactionWindows[event.payload.window.id] = structuredClone(event.payload.window)
      state.timing.activeReactionWindowId = event.payload.window.id
      return
    case 'REACTION_PASSED': {
      const window = state.timing.reactionWindows[event.payload.reactionWindowId]
      if (!window) throw new Error(`Unknown reaction window: ${event.payload.reactionWindowId}`)
      state.timing.reactionWindows[window.id] = withReactionResponse(
        window,
        event.payload.playerId,
        'PASS',
        event.timestamp,
      )
      return
    }
    case 'STRATAGEM_USED': {
      requirePlayer(state, event.payload.playerId)
      state.timing.stratagemUsage = recordUsage(
        state.timing.stratagemUsage,
        event.payload.playerId,
        event.payload.stratagemId,
        state.round,
        state.activePlayerId,
        state.phase,
      )
      if (event.payload.reactionWindowId) {
        const window = state.timing.reactionWindows[event.payload.reactionWindowId]
        if (!window) throw new Error(`Unknown reaction window: ${event.payload.reactionWindowId}`)
        state.timing.reactionWindows[window.id] = withReactionResponse(
          window,
          event.payload.playerId,
          'USED_REACTION',
          event.timestamp,
          event.payload.stratagemId,
        )
      }
      return
    }
    case 'REACTION_WINDOW_RESOLVED': {
      const window = state.timing.reactionWindows[event.payload.reactionWindowId]
      if (!window) throw new Error(`Unknown reaction window: ${event.payload.reactionWindowId}`)
      window.status = 'RESOLVED'
      window.resolvedAt = event.timestamp
      if (state.timing.activeReactionWindowId === window.id) state.timing.activeReactionWindowId = null
      return
    }
    case 'REACTION_WINDOW_CANCELLED': {
      const window = state.timing.reactionWindows[event.payload.reactionWindowId]
      if (!window) throw new Error(`Unknown reaction window: ${event.payload.reactionWindowId}`)
      window.status = 'CANCELLED'
      window.resolvedAt = event.timestamp
      if (state.timing.activeReactionWindowId === window.id) state.timing.activeReactionWindowId = null
      return
    }
    case 'RULESET_EVENT':
      return
  }
}

function projectState(setup: BattleSetup, events: BattleEvent[]): GameState {
  const state = baseState(setup)
  for (const event of events) applyEvent(state, event, setup)
  state.events = [...events]
  return state
}

function materializeEvent(
  input: BattleEventInput,
  options: Required<Pick<EventOptions, 'actionId' | 'timestamp' | 'undoable'>> & Pick<EventOptions, 'actorPlayerId'>,
): BattleEvent {
  return {
    ...input,
    id: createId('event'),
    actionId: options.actionId,
    timestamp: options.timestamp,
    actorPlayerId: options.actorPlayerId,
    undoable: options.undoable,
  } as BattleEvent
}

export function dispatchBattleEvents(session: BattleSession, inputs: BattleEventInput[], options: EventOptions = {}): BattleSession {
  if (session.state.status !== 'active' && inputs.length > 0) {
    throw new Error(`The battle is ${session.state.status} and can no longer be changed.`)
  }
  const actionId = options.actionId ?? createId('action')
  const timestamp = options.timestamp ?? new Date().toISOString()
  const events = inputs.map((input) => materializeEvent(input, {
    actionId,
    timestamp,
    actorPlayerId: options.actorPlayerId,
    undoable: options.undoable ?? true,
  }))
  const history = [...session.state.events, ...events]
  return { setup: session.setup, state: projectState(session.setup, history), redoActions: [] }
}

export function createBattleSession(input: CreateBattleInput): BattleSession {
  const setup = validateSetup(input)
  const empty: BattleSession = { setup, state: baseState(setup), redoActions: [] }
  return dispatchBattleEvents(empty, [
    { type: 'GAME_STARTED', payload: {} },
    { type: 'ROUND_STARTED', payload: { round: 1 } },
    { type: 'TURN_STARTED', payload: { playerId: setup.turnOrder[0] } },
  ], { actionId: createId('setup'), timestamp: setup.createdAt, undoable: false })
}

export function dispatchBattleEvent(
  session: BattleSession,
  input: BattleEventInput,
  options: EventOptions = {},
): BattleSession {
  if (session.state.status !== 'active') {
    throw new Error(`The battle is ${session.state.status} and can no longer be changed.`)
  }
  return dispatchBattleEvents(session, [input], options)
}

export function completeBattle(session: BattleSession, timestamp?: string): BattleSession {
  if (session.state.status !== 'active') return session
  return dispatchBattleEvents(session, [
    { type: 'GAME_ENDED', payload: {} },
  ], {
    actorPlayerId: session.state.activePlayerId,
    timestamp,
  })
}

export function abandonBattle(session: BattleSession, timestamp?: string): BattleSession {
  if (session.state.status !== 'active') return session
  return dispatchBattleEvents(session, [
    { type: 'GAME_ABANDONED', payload: {} },
  ], {
    actorPlayerId: session.state.activePlayerId,
    timestamp,
  })
}

export function getPhaseTransitionEvents(session: BattleSession): BattleEventInput[] {
  if (session.state.status !== 'active') return []
  const activeWindow = session.state.timing.reactionWindows[session.state.timing.activeReactionWindowId ?? '']
  if (isReactionWindowBlocking(activeWindow)) return []
  const phaseIndex = BATTLE_PHASES.indexOf(session.state.phase)
  if (phaseIndex < BATTLE_PHASES.length - 1) {
    return [
      { type: 'PHASE_CHANGED', payload: { phase: BATTLE_PHASES[phaseIndex + 1] } },
    ]
  }

  const activeIndex = session.state.turnOrder.indexOf(session.state.activePlayerId)
  const inputs: BattleEventInput[] = [
    { type: 'TURN_ENDED', payload: { playerId: session.state.activePlayerId } },
  ]
  if (activeIndex < session.state.turnOrder.length - 1) {
    inputs.push({ type: 'TURN_STARTED', payload: { playerId: session.state.turnOrder[activeIndex + 1] } })
  } else {
    inputs.push({ type: 'ROUND_ENDED', payload: { round: session.state.round } })
    if (session.state.round >= session.state.maxRounds) {
      inputs.push({ type: 'GAME_ENDED', payload: {} })
    } else {
      inputs.push({ type: 'ROUND_STARTED', payload: { round: session.state.round + 1 } })
      inputs.push({ type: 'TURN_STARTED', payload: { playerId: session.state.turnOrder[0] } })
    }
  }
  return inputs
}

export function advancePhase(session: BattleSession, timestamp?: string): BattleSession {
  const inputs = getPhaseTransitionEvents(session)
  if (inputs.length === 0) return session
  return dispatchBattleEvents(session, inputs, { timestamp, actorPlayerId: session.state.activePlayerId })
}

export function undoLastAction(session: BattleSession): BattleSession {
  const last = [...session.state.events].reverse().find((event) => event.undoable)
  if (!last) return session
  const firstIndex = session.state.events.findIndex((event) => event.actionId === last.actionId)
  const retained = session.state.events.slice(0, firstIndex)
  const removed = session.state.events.slice(firstIndex).filter((event) => event.actionId === last.actionId)
  return {
    setup: session.setup,
    state: projectState(session.setup, retained),
    redoActions: [removed, ...session.redoActions],
  }
}

export function redoLastAction(session: BattleSession): BattleSession {
  const [action, ...remaining] = session.redoActions
  if (!action) return session
  const history = [...session.state.events, ...action]
  return {
    setup: session.setup,
    state: projectState(session.setup, history),
    redoActions: remaining,
  }
}

const StoredSessionSchema = z.object({
  setup: z.object({ gameId: z.string(), rulesetId: z.string(), players: z.array(z.unknown()) }).passthrough(),
  state: z.object({ gameId: z.string(), events: z.array(z.unknown()) }).passthrough(),
  redoActions: z.array(z.array(z.unknown())),
}).passthrough()

export function serializeBattleSession(session: BattleSession): string {
  return JSON.stringify(session)
}

/** Replays persisted events so sessions saved by older compatible builds gain new projected state. */
export function rehydrateBattleSession(session: BattleSession): BattleSession {
  return {
    setup: session.setup,
    state: projectState(session.setup, session.state.events as BattleEvent[]),
    redoActions: session.redoActions,
  }
}

export function deserializeBattleSession(serialized: string): BattleSession {
  const parsed: unknown = JSON.parse(serialized)
  const session = StoredSessionSchema.parse(parsed) as unknown as BattleSession
  return rehydrateBattleSession(session)
}
