import type { RulesManifest } from '../../features/companion/data'
import { doublesScorekeeperId } from './doubles'
import type { BattleEvent, BattleSession, BattleSetup, GameState } from './types'

export type CompanionUse = {
  operationId: string; playerId: string; stratagemId: string; name: string
  baseCost: number | null; cost: number; datasetId: string; targetUnitId?: string
  round: number; phase: string; activePlayerId: string
}
export type CompanionState = {
  rules: Record<string, RulesManifest>
  uses: Record<string, CompanionUse & { status: 'used' | 'reverted' | 'rejected'; reason?: string }>
}
export type CompanionEvent =
  | { type: 'COMPANION_RULES_SELECTED'; payload: { playerId: string; manifest: RulesManifest } }
  | { type: 'COMPANION_STRATAGEM_RECORDED'; payload: CompanionUse }
  | { type: 'COMPANION_STRATAGEM_REVERTED'; payload: { playerId: string; operationId: string } }

export function companionUseError(session: BattleSession, use: CompanionUse): string | null {
  if (session.state.status !== 'active') return 'Battle is not active.'
  if (!use.operationId || !use.name || !use.stratagemId || !use.datasetId) return 'Incomplete stratagem record.'
  if (!Number.isSafeInteger(use.cost) || use.cost < 0) return 'Cost must be a non-negative integer.'
  const player = session.state.players[use.playerId]
  if (!player) return 'Player not found.'
  if (use.targetUnitId && !player.units[use.targetUnitId]) return 'Select a unit belonging to this player.'
  const pool = session.state.players[doublesScorekeeperId(session.setup, use.playerId)]
  if (!pool || pool.cp < use.cost) return 'Not enough CP.'
  return null
}

/** One event changes the existing CP pool and its audit record together. */
export function applyCompanionEvent(state: GameState, setup: BattleSetup, event: BattleEvent): boolean {
  if (!event.type.startsWith('COMPANION_')) return false
  const companion = state.companion ??= { rules: {}, uses: {} }
  if (event.type === 'COMPANION_RULES_SELECTED') {
    if (state.players[event.payload.playerId]) companion.rules[event.payload.playerId] = event.payload.manifest
  } else if (event.type === 'COMPANION_STRATAGEM_RECORDED') {
    const use = event.payload
    if (companion.uses[use.operationId]) return true
    const error = companionUseError({ setup, state, redoActions: [] }, use)
    companion.uses[use.operationId] = { ...use, status: error ? 'rejected' : 'used', reason: error ?? undefined }
    if (!error) state.players[doublesScorekeeperId(setup, use.playerId)].cp -= use.cost
  } else if (event.type === 'COMPANION_STRATAGEM_REVERTED') {
    const use = companion.uses[event.payload.operationId]
    if (use?.status === 'used' && use.playerId === event.payload.playerId) {
      state.players[doublesScorekeeperId(setup, use.playerId)].cp += use.cost
      use.status = 'reverted'
    }
  }
  return true
}
