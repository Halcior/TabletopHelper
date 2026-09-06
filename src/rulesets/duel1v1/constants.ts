import type { ObjectiveDefinition } from '../../domain/battle/types'

export const DUEL_RULESET_ID = 'duel-1v1'
export const DUEL_RULESET_VERSION = '2.0.0-11e'
export const DUEL_PLAYER_COUNT = 2
export const DUEL_BATTLE_ROUNDS = 5
export const DUEL_DEFAULT_OBJECTIVE_COUNT = 5
export const DUEL_MIN_OBJECTIVES = 3
export const DUEL_MAX_OBJECTIVES = 8
export const DUEL_PRIMARY_ROUND_CAP = 15
export const DUEL_PRIMARY_GAME_CAP = 45
export const DUEL_SECONDARY_ROUND_CAP = 15
export const DUEL_SECONDARY_GAME_CAP = 45
export const DUEL_FIXED_CARD_GAME_CAP = 20
export const DUEL_TACTICAL_CARD_CAP = 5
export const DUEL_BATTLE_READY_VP = 10

export function createDuelObjectives(count = DUEL_DEFAULT_OBJECTIVE_COUNT): ObjectiveDefinition[] {
  const normalized = Math.max(DUEL_MIN_OBJECTIVES, Math.min(DUEL_MAX_OBJECTIVES, Math.floor(count)))
  return Array.from({ length: normalized }, (_, index) => {
    if (index === 0) return { id: 'OBJ-1', name: 'Home Objective A', type: 'home' as const }
    if (index === 1) return { id: 'OBJ-2', name: 'Home Objective B', type: 'home' as const }
    return {
      id: `OBJ-${index + 1}`,
      name: `No Man's Land Objective ${index - 1}`,
      type: 'neutral' as const,
    }
  })
}
