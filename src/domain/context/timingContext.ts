import type { BattleEvent, BattleSession } from '../battle/types'
import type { ReactionContext, TimingTrigger } from '../stratagems/types'

export type CurrentTimingCheckpoint = {
  triggers: TimingTrigger[]
  context: ReactionContext
  sourceEventId?: string
}

function currentPhaseBoundaryIndex(session: BattleSession): number {
  for (let index = session.state.events.length - 1; index >= 0; index -= 1) {
    const event = session.state.events[index]
    if (event.type === 'PHASE_CHANGED' && event.payload.phase === session.state.phase) return index
    if (
      session.state.phase === 'COMMAND'
      && event.type === 'TURN_STARTED'
      && event.payload.playerId === session.state.activePlayerId
    ) return index
  }
  return -1
}

function actionGroups(events: readonly BattleEvent[]): BattleEvent[][] {
  const groups: BattleEvent[][] = []
  for (const event of events) {
    const current = groups.at(-1)
    if (current?.[0]?.actionId === event.actionId) current.push(event)
    else groups.push([event])
  }
  return groups
}

function uniqueTriggers(values: TimingTrigger[]): TimingTrigger[] {
  return [...new Set(values)]
}

function targetUnitContext(session: BattleSession, playerId: string, unitId: string): ReactionContext {
  const armyId = session.state.players[playerId]?.armyId
  const unit = armyId ? session.setup.armies[armyId]?.units.find((candidate) => candidate.id === unitId) : undefined
  return {
    targetPlayerId: playerId,
    targetUnitId: unitId,
    triggerSubjectPlayerId: playerId,
    triggerSubjectUnitId: unitId,
    targetKeywords: unit ? [...unit.categories, ...unit.keywords] : undefined,
  }
}

function casualtyCheckpoint(session: BattleSession, event: BattleEvent): CurrentTimingCheckpoint | null {
  if (
    event.type !== 'UNIT_MODEL_DESTROYED'
    && event.type !== 'UNIT_WOUNDS_CHANGED'
    && event.type !== 'UNIT_DESTROYED'
  ) return null

  const ownerId = event.payload.playerId
  const unitId = event.payload.unitId
  const unit = session.state.players[ownerId]?.units[unitId]
  const destroyedNow = event.type === 'UNIT_DESTROYED'
    || (event.type === 'UNIT_WOUNDS_CHANGED' && event.payload.woundsRemaining <= 0)
    || Boolean(unit?.destroyed)
  const triggers: TimingTrigger[] = []
  if (event.type === 'UNIT_MODEL_DESTROYED' || event.type === 'UNIT_DESTROYED' || destroyedNow) {
    triggers.push('MODEL_DESTROYED')
  }
  if (destroyedNow) triggers.push('UNIT_DESTROYED')
  if (triggers.length === 0) return null

  const destroyedByPlayerId = 'destroyedByPlayerId' in event.payload
    ? event.payload.destroyedByPlayerId
    : undefined
  return {
    triggers: uniqueTriggers(triggers),
    sourceEventId: event.id,
    context: {
      ...targetUnitContext(session, ownerId, unitId),
      eventId: event.id,
      actingPlayerId: destroyedByPlayerId ?? event.actorPlayerId,
    },
  }
}

function checkpointFromEvent(session: BattleSession, event: BattleEvent): CurrentTimingCheckpoint | null {
  const casualty = casualtyCheckpoint(session, event)
  if (casualty) return casualty

  if (event.type === 'OBJECTIVE_CONTROL_CHANGED') {
    return {
      triggers: ['OBJECTIVE_CONTROL_CHANGED'],
      sourceEventId: event.id,
      context: {
        eventId: event.id,
        objectiveId: event.payload.objectiveId,
        actingPlayerId: event.actorPlayerId,
        targetPlayerId: event.payload.controllerPlayerId ?? undefined,
      },
    }
  }

  if (event.type === 'BATTLESHOCK_TEST_RESOLVED') {
    return {
      triggers: [
        'BATTLESHOCK_RESOLVED',
        event.payload.passed ? 'BATTLESHOCK_PASSED' : 'BATTLESHOCK_FAILED',
      ],
      sourceEventId: event.id,
      context: {
        ...targetUnitContext(session, event.payload.playerId, event.payload.unitId),
        eventId: event.id,
        actingPlayerId: event.actorPlayerId ?? event.payload.playerId,
        battleShockPassed: event.payload.passed,
      },
    }
  }

  // UNIT_BATTLESHOCK_CHANGED is a state override, not proof that a test was
  // rolled. In particular, clearing Battle-shock can simply be phase expiry.
  return null
}

function preservesPreviousTiming(group: readonly BattleEvent[], session: BattleSession): boolean {
  if (group.every((event) => !event.undoable)) return true
  if (
    session.state.phase === 'COMMAND'
    && group.every((event) => (
      event.type === 'CP_GAINED'
      && event.payload.playerId === session.state.activePlayerId
    ))
  ) return true
  return group.every((event) => (
    event.type === 'CP_SPENT'
    || event.type === 'STRATAGEM_USED'
    || event.type === 'ABILITY_USED'
  ))
}

/**
 * Returns the latest timing moment the app can prove from recorded state.
 * Phase start is known immediately after a phase/turn transition. Later exact
 * checkpoints are only exposed when a persisted physical-state event proves
 * them; otherwise callers must not claim a Stratagem is available "now".
 */
export function selectCurrentTimingCheckpoint(session: BattleSession): CurrentTimingCheckpoint | null {
  const boundaryIndex = currentPhaseBoundaryIndex(session)
  if (boundaryIndex < 0) return null
  const boundary = session.state.events[boundaryIndex]
  const later = session.state.events.slice(boundaryIndex + 1)
    .filter((event) => event.actionId !== boundary.actionId)
  const groups = actionGroups(later)

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index]
    for (let eventIndex = group.length - 1; eventIndex >= 0; eventIndex -= 1) {
      const checkpoint = checkpointFromEvent(session, group[eventIndex])
      if (checkpoint) return checkpoint
    }
    if (preservesPreviousTiming(group, session)) continue
    return null
  }

  return {
    triggers: ['PHASE_START'],
    sourceEventId: boundary.id,
    context: {
      eventId: boundary.id,
      actingPlayerId: session.state.activePlayerId,
    },
  }
}
