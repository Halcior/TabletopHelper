import type { BattleEvent, BattleEventInput, GameState } from '../battle/types'
import type { BoardPoint } from './types'

export type UnitMapStatus = 'unplaced' | 'battlefield' | 'reserves' | 'destroyed'
export type UnitMapEntry = {
  playerId: string
  unitId: string
  status: UnitMapStatus
  position: BoardPoint | null
  lastPosition: BoardPoint | null
  /** Last accepted map or life-cycle event. Per-unit compare-and-set survives offline retries. */
  revision: string
}
export type UnitTrackingState = { enabled: boolean; units: Record<string, UnitMapEntry> }
export type UnitMapChange = {
  playerId: string
  unitId: string
  status: Exclude<UnitMapStatus, 'destroyed'>
  position: BoardPoint | null
  expectedRevision: string | null
}
export type SpatialCombat = {
  attacker?: { playerId: string; unitId: string; position: BoardPoint | null }
  target: { playerId: string; unitId: string; position: BoardPoint | null }
  modelsLost: number
  eliminated: boolean
}

// JSON tuple avoids collisions even when IDs contain punctuation or armies share unit IDs.
export const unitMapKey = (playerId: string, unitId: string) => JSON.stringify([playerId, unitId])
export const mapEntry = (state: Readonly<GameState>, playerId: string, unitId: string) => state.unitTracking?.units[unitMapKey(playerId, unitId)]
export function knownUnitPosition(state: Readonly<GameState>, playerId: string, unitId: string): BoardPoint | null {
  const entry = mapEntry(state, playerId, unitId)
  return state.unitTracking?.enabled && entry?.status === 'battlefield' && entry.position ? { ...entry.position } : null
}
export function validateUnitMapChange(state: Readonly<GameState>, payload: UnitMapChange) {
  if (!state.players[payload.playerId]?.units[payload.unitId]) throw new Error('Unknown battlefield unit.')
  if (!['unplaced', 'battlefield', 'reserves'].includes(payload.status)) throw new Error('Invalid unit map status.')
  if (payload.expectedRevision !== null && typeof payload.expectedRevision !== 'string') throw new Error('Missing unit map revision.')
  const point = payload.position
  if (payload.status === 'battlefield') {
    if (!point || ![point.x, point.y].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error('Unit coordinates must be between 0 and 1.')
  } else if (point !== null) throw new Error('Off-board units cannot have a current position.')
}

/** Called by the canonical engine only; never a second history or clock command. */
export function applyUnitMapEvent(state: GameState, event: BattleEvent): boolean {
  if (event.type === 'UNIT_TRACKING_CHANGED') {
    if (typeof event.payload.enabled !== 'boolean') throw new Error('Invalid tracking setting.')
    state.unitTracking ??= { enabled: false, units: {} }
    state.unitTracking.enabled = event.payload.enabled
    if (!event.payload.enabled) for (const entry of Object.values(state.unitTracking.units)) {
      if (entry.status === 'destroyed') continue
      entry.lastPosition = entry.position ? { ...entry.position } : entry.lastPosition
      entry.position = null
      entry.status = 'unplaced'
      entry.revision = event.id
    }
    return true
  }
  if (event.type !== 'UNIT_MAP_CHANGED') return false
  validateUnitMapChange(state, event.payload)
  const { playerId, unitId, status, position, expectedRevision } = event.payload
  const key = unitMapKey(playerId, unitId)
  const previous = state.unitTracking?.units[key]
  // First canonical write wins a conflict. An offline ancestor can never overwrite it.
  if (!state.unitTracking?.enabled || state.players[playerId].units[unitId].destroyed || expectedRevision !== (previous?.revision ?? null)) return true
  state.unitTracking.units[key] = {
    playerId, unitId, status, position: position ? { ...position } : null,
    lastPosition: position ? { ...position } : previous?.lastPosition ?? null, revision: event.id,
  }
  return true
}

/** Destruction/restoration follows actual combat/corrections without emitting duplicate events. */
export function reconcileUnitMapLifecycle(state: GameState, event: BattleEvent) {
  if (!state.unitTracking || event.type === 'UNIT_MAP_CHANGED' || event.type === 'UNIT_TRACKING_CHANGED') return
  const payload = event.type === 'STATE_CORRECTED' ? event.payload.correction : event.payload
  if (!('playerId' in payload) || !('unitId' in payload) || typeof payload.playerId !== 'string' || typeof payload.unitId !== 'string') return
  const unit = state.players[payload.playerId]?.units[payload.unitId]
  const entry = mapEntry(state, payload.playerId, payload.unitId)
  if (!unit || !entry) return
  if (unit.destroyed && entry.status !== 'destroyed') {
    entry.lastPosition = entry.position ? { ...entry.position } : entry.lastPosition
    entry.position = null
    entry.status = 'destroyed'
    entry.revision = event.id
  } else if (!unit.destroyed && entry.status === 'destroyed') {
    entry.status = 'unplaced'
    entry.position = null
    entry.revision = event.id
  }
}

export function unitMapChangeInput(state: Readonly<GameState>, playerId: string, unitId: string, status: UnitMapChange['status'], position: BoardPoint | null): BattleEventInput {
  return { type: 'UNIT_MAP_CHANGED', payload: { playerId, unitId, status, position, expectedRevision: mapEntry(state, playerId, unitId)?.revision ?? null } }
}

/** Snapshot only positions known BEFORE this combat; no backfilling from the live state. */
export function spatialCombatBefore(state: Readonly<GameState>, event: BattleEvent): SpatialCombat | undefined {
  if (!['UNIT_COMBAT_RESOLVED', 'UNIT_MODEL_DESTROYED', 'UNIT_WOUNDS_CHANGED', 'UNIT_DESTROYED'].includes(event.type)) return
  if (!('unitId' in event.payload) || !('playerId' in event.payload)) return
  if (event.type === 'UNIT_COMBAT_RESOLVED' && event.payload.kind !== 'damage') return
  const payload = event.payload
  const attackerPlayerId = 'destroyedByPlayerId' in payload ? payload.destroyedByPlayerId : undefined
  const attackerUnitId = 'attackerUnitId' in payload ? payload.attackerUnitId : undefined
  return {
    target: { playerId: payload.playerId, unitId: payload.unitId, position: knownUnitPosition(state, payload.playerId, payload.unitId) },
    attacker: attackerPlayerId && attackerUnitId ? { playerId: attackerPlayerId, unitId: attackerUnitId, position: knownUnitPosition(state, attackerPlayerId, attackerUnitId) } : undefined,
    modelsLost: 0, eliminated: false,
  }
}
