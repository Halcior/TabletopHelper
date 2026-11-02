import type { BattleCorrection, BattleEventInput, BattleSession } from './types'
import { rehydrateBattleSession } from './engine'
import { readCombatState } from './combatState'
import { doublesScorekeeperId } from './doubles'

export type QuickUndoPlan = { safe: true; input: Extract<BattleEventInput, { type: 'STATE_CORRECTED' }>; label: string }
  | { safe: false; reason: string }

/** Only the latest isolated action is invertible. Grouped scoring, flow and
 * casualty consequences require the existing explicit correction form. */
export function planQuickUndo(session: BattleSession, eventId = session.state.events.at(-1)?.id): QuickUndoPlan {
  const last = session.state.events.at(-1)
  if (!last || last.id !== eventId || session.state.status !== 'active') return { safe: false, reason: 'Later events depend on this state. Review an explicit correction.' }
  if (!last.undoable || session.state.events.filter(event => event.actionId === last.actionId).length !== 1) return { safe: false, reason: 'This action has linked consequences. Review scoring and state explicitly.' }
  const before = rehydrateBattleSession({ ...session, state: { ...session.state, events: session.state.events.slice(0, -1) }, redoActions: [] })
  let correction: BattleCorrection
  switch (last.type) {
    case 'CP_GAINED': case 'CP_SPENT':
      correction = { kind: 'CP', playerId: last.payload.playerId, value: before.state.players[doublesScorekeeperId(session.setup, last.payload.playerId)].cp }; break
    case 'SCORE_ADJUSTED':
      correction = { kind: 'SCORE', playerId: last.payload.playerId, category: last.payload.category, value: before.state.players[doublesScorekeeperId(session.setup, last.payload.playerId)].score[last.payload.category] }; break
    case 'OBJECTIVE_CONTROL_CHANGED':
      correction = { kind: 'OBJECTIVE_CONTROL', objectiveId: last.payload.objectiveId, controllerPlayerId: before.state.objectives[last.payload.objectiveId].controllerPlayerId }; break
    case 'UNIT_COMBAT_RESOLVED': case 'UNIT_MODEL_DESTROYED': case 'UNIT_MODEL_RESTORED': case 'UNIT_WOUNDS_CHANGED': case 'UNIT_DESTROYED': {
      const player = before.state.players[last.payload.playerId]
      const definition = player.armyId && session.setup.armies[player.armyId]?.units.find(unit => unit.id === last.payload.unitId)
      const profiles = definition && readCombatState(definition, player.units[last.payload.unitId])
      if (!profiles) return { safe: false, reason: 'Historical model allocation is unknown. Confirm profiles in the correction form.' }
      correction = { kind: 'UNIT_COMBAT', playerId: last.payload.playerId, unitId: last.payload.unitId, value: structuredClone(profiles) }; break
    }
    default: return { safe: false, reason: 'This action needs an explicit correction. Battle Clock and turn history cannot be reversed here.' }
  }
  return { safe: true, label: 'Undo last action', input: { type: 'STATE_CORRECTED', payload: {
    correction, reason: 'Undo last isolated action', quickUndo: { expectedLastEventId: last.id, actionId: last.actionId },
  } } }
}
