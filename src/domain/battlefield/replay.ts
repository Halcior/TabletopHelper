import { visitBattleHistory } from '../battle/engine'
import { describeBattleEvent } from '../battle/eventLog'
import type { BattlePhase, BattleSession, GameState } from '../battle/types'
import { totalScore } from '../battle/selectors'
import { defaultBattlefieldGeometry } from './layouts'
import type { BattlefieldGeometry } from './types'

export type BattlefieldReplayFrame = {
  index: number
  eventId?: string
  round: number
  phase: BattlePhase
  activePlayerId: string
  controllers: Record<string, string | null>
  scores: Record<string, number>
  geometry: BattlefieldGeometry
  description: string
}

/** Every unique event has its own step; no whole-round snapshot assumption. */
export function buildBattlefieldReplay(
  session: BattleSession,
): BattlefieldReplayFrame[] {
  const frames: BattlefieldReplayFrame[] = []
  const capture = (
    state: Readonly<GameState>,
    description: string,
    eventId?: string,
  ) => {
    frames.push({
      index: frames.length,
      eventId,
      round: state.round,
      phase: state.phase,
      activePlayerId: state.activePlayerId,
      controllers: Object.fromEntries(
        Object.values(state.objectives).map((objective) => [
          objective.id,
          objective.controllerPlayerId,
        ]),
      ),
      scores: Object.fromEntries(
        Object.values(state.players).map((player) => [
          player.id,
          totalScore(player),
        ]),
      ),
      geometry: state.battlefield ?? defaultBattlefieldGeometry(session.setup),
      description,
    })
  }
  visitBattleHistory(session, {
    before(_event, state) {
      if (frames.length === 0)
        capture(state, 'Initial battlefield · no recorded events yet')
    },
    after(event, state) {
      capture(state, describeBattleEvent(event, session.setup), event.id)
    },
  })
  if (frames.length === 0)
    capture(session.state, 'Saved state · no event history available')
  return frames
}
