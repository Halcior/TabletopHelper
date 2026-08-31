import type { BattleEventInput, BattleSession, ObjectiveState } from '../../domain/battle/types'
import { cauldronEvent, getCauldronEventData } from './events'
import { getRivalMapping } from './rivalRotation'
import type { CauldronRoundSnapshot, CauldronTurnSnapshot } from './types'

function objectiveStates(session: BattleSession): CauldronRoundSnapshot['objectiveStates'] {
  return Object.fromEntries(Object.values(session.state.objectives).map((objective: ObjectiveState) => [objective.id, {
    controllerPlayerId: objective.controllerPlayerId,
    playerOC: { ...objective.playerOC },
  }]))
}

export function captureRoundSnapshot(session: BattleSession, round: number): CauldronRoundSnapshot {
  return {
    round,
    objectiveStates: objectiveStates(session),
    rivalPlayerIds: getRivalMapping(session, round),
  }
}

export function captureTurnSnapshot(session: BattleSession, playerId: string, round: number): CauldronTurnSnapshot {
  return { round, playerId, objectiveStates: objectiveStates(session) }
}

export function getCauldronRoundStartSnapshot(session: BattleSession, round: number): CauldronRoundSnapshot | undefined {
  return getCauldronEventData<CauldronRoundSnapshot>(session, 'ROUND_SNAPSHOT_CAPTURED')
    .find((snapshot) => snapshot.round === round)
}

export function getCauldronTurnStartSnapshot(
  session: BattleSession,
  playerId: string,
  round: number,
): CauldronTurnSnapshot | undefined {
  return getCauldronEventData<CauldronTurnSnapshot>(session, 'TURN_SNAPSHOT_CAPTURED')
    .find((snapshot) => snapshot.round === round && snapshot.playerId === playerId)
}

export function addSnapshotEvents(session: BattleSession, transitions: BattleEventInput[]): BattleEventInput[] {
  const augmented: BattleEventInput[] = []
  let round = session.state.round
  for (const transition of transitions) {
    augmented.push(transition)
    if (transition.type === 'ROUND_STARTED') {
      round = transition.payload.round
      augmented.push(cauldronEvent('ROUND_SNAPSHOT_CAPTURED', captureRoundSnapshot(session, round)))
    }
    if (transition.type === 'TURN_STARTED') {
      augmented.push(cauldronEvent(
        'TURN_SNAPSHOT_CAPTURED',
        captureTurnSnapshot(session, transition.payload.playerId, round),
      ))
    }
  }
  return augmented
}
