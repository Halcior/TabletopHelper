import { mapEntry, spatialCombatBefore, type SpatialCombat, type UnitTrackingState } from './unitTracking'
import type { UnitState } from '../army/types'
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
  unitTracking?: UnitTrackingState
  units: Record<string, Record<string, Pick<UnitState, 'modelsAlive' | 'destroyed' | 'battleShocked'>>>
  combat?: SpatialCombat
}

/** Every unique event has its own step; no whole-round snapshot assumption. */
export function buildBattlefieldReplay(
  session: BattleSession,
): BattlefieldReplayFrame[] {
  const frames: BattlefieldReplayFrame[] = []
  let combat: SpatialCombat | undefined
  let modelsBefore = 0
  let destroyedBefore = false
  let eventDescription = ''
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
      unitTracking: state.unitTracking ? structuredClone(state.unitTracking) : undefined,
      units: Object.fromEntries(Object.values(state.players).map(player => [player.id, Object.fromEntries(Object.entries(player.units).map(([id, unit]) => [id, { modelsAlive: unit.modelsAlive, destroyed: unit.destroyed, battleShocked: unit.battleShocked }]))])),
      combat,
    })
  }
  visitBattleHistory(session, {
    before(event, state) {
      combat = undefined
      if (frames.length === 0)
        capture(state, 'Initial battlefield · no recorded events yet')
      eventDescription = describeBattleEvent(event, session.setup)
      if (event.type === 'UNIT_MAP_CHANGED') {
        const previous = mapEntry(state, event.payload.playerId, event.payload.unitId)
        if (!state.unitTracking?.enabled || event.payload.expectedRevision !== (previous?.revision ?? null) || state.players[event.payload.playerId]?.units[event.payload.unitId]?.destroyed) eventDescription += ' · stale change ignored'
        else if (event.payload.status === 'battlefield' && previous?.status === 'reserves') eventDescription += ' · deployed from Reserves'
      }
      combat = spatialCombatBefore(state, event)
      if (combat) {
        const unit = state.players[combat.target.playerId]?.units[combat.target.unitId]
        modelsBefore = unit?.modelsAlive ?? 0
        destroyedBefore = unit?.destroyed ?? false
      }
    },
    after(event, state) {
      if (combat) {
        const unit = state.players[combat.target.playerId]?.units[combat.target.unitId]
        combat.modelsLost = Math.max(0, modelsBefore - (unit?.modelsAlive ?? 0))
        combat.eliminated = !destroyedBefore && Boolean(unit?.destroyed)
      }
      capture(state, eventDescription, event.id)
    },
  })
  if (frames.length === 0)
    capture(session.state, 'Saved state · no event history available')
  return frames
}
