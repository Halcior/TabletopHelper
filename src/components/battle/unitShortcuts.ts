import { doublesScorekeeperId, onSameDoublesForce } from '../../domain/battle/doubles'
import type { BattleSession } from '../../domain/battle/types'

export type BattleUnitSelection = { playerId: string; unitId: string; referenceOnly?: boolean }

export type BattleUnitShortcutProps = {
  onOpenDatasheet?: (selection: BattleUnitSelection) => void
  onOpenDamage?: (selection: BattleUnitSelection) => void
}

export function canQuickDamage(session: BattleSession, targetId: string, shared: boolean, viewerId?: string | null) {
  if (session.state.status !== 'active') return false
  if (!shared) return true
  if (!viewerId || !session.state.players[viewerId]) return false
  return targetId === viewerId || (doublesScorekeeperId(session.setup, viewerId) === session.state.activePlayerId
    && !onSameDoublesForce(session.setup, targetId, viewerId))
}
