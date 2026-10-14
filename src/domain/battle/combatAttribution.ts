import type { BattleEventInput, BattleSetup } from './types'

export function combatAttributionError(setup: BattleSetup, event: BattleEventInput): string | undefined {
  if (event.type !== 'UNIT_COMBAT_RESOLVED' && event.type !== 'UNIT_DESTROYED' && event.type !== 'UNIT_MODEL_DESTROYED' && event.type !== 'UNIT_WOUNDS_CHANGED') return
  if (event.type === 'UNIT_COMBAT_RESOLVED' && event.payload.kind !== 'damage' && (event.payload.attackerUnitId || event.payload.destroyedByPlayerId)) return 'Healing and restoration cannot credit an attacker.'
  const { attackerUnitId, destroyedByPlayerId, playerId, note } = event.payload
  if (note !== undefined && (typeof note !== 'string' || note.length > 240)) return 'Combat notes must be at most 240 characters.'
  if (attackerUnitId == null) return
  if (typeof attackerUnitId !== 'string' || !destroyedByPlayerId || destroyedByPlayerId === playerId) {
    return 'Choose an enemy attacking player before assigning an attacking unit.'
  }
  const player = setup.players.find((candidate) => candidate.id === destroyedByPlayerId)
  const army = player?.armyId ? setup.armies[player.armyId] : undefined
  if (!army?.units.some((unit) => unit.id === attackerUnitId)) return 'The attacking unit must belong to the attributed player.'
}
