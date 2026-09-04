import type { ObjectiveDefinition } from '../../domain/battle/types'
import type { OperationalPlanId } from './types'

export const CAULDRON_RULESET_ID = 'cauldron-ffa-3'
export const CAULDRON_RULESET_VERSION = '2.1.1'
export const CAULDRON_PLAYER_COUNT = 3
export const CAULDRON_BATTLE_ROUNDS = 5
export const CAULDRON_PRIMARY_CAP = 45
export const CAULDRON_PRIMARY_ROUND_CAP = 15
export const CAULDRON_SECONDARY_CAP = 45
export const CAULDRON_SECONDARY_ROUND_CAP = 10
export const CAULDRON_TOTAL_CAP = 90
export const CAULDRON_PLAN_VP = 5 as const

export const CAULDRON_OBJECTIVES: ObjectiveDefinition[] = [
  { id: 'A-HOME', name: 'A-HOME', type: 'home' },
  { id: 'B-HOME', name: 'B-HOME', type: 'home' },
  { id: 'C-HOME', name: 'C-HOME', type: 'home' },
  { id: 'N1', name: 'N1', type: 'neutral' },
  { id: 'N2', name: 'N2', type: 'neutral' },
  { id: 'N3', name: 'N3', type: 'neutral' },
]

export const OPERATIONAL_PLAN_IDS: OperationalPlanId[] = [
  'WYNISZCZENIE',
  'DECYDUJACE_NATARCIE',
  'TWIERDZA',
  'ZWIAD_OPERACYJNY',
  'SABOTAZ',
]

export const OPERATIONAL_PLAN_DEFINITIONS: Record<OperationalPlanId, {
  name: string
  description: string
}> = {
  WYNISZCZENIE: {
    name: 'Wyniszczenie',
    description: 'Destroy at least 10% of the current Rival’s starting army value during this Battle Round. Checked at the end of the Battle Round.',
  },
  DECYDUJACE_NATARCIE: {
    name: 'Decydujące Natarcie',
    description: 'At the start of your turn mark an objective controlled by the current Rival. If they control none, mark the neutral objective closest to their deployment zone. Control the marked objective at the end of your turn.',
  },
  TWIERDZA: {
    name: 'Twierdza',
    description: 'At the start of your turn mark a neutral objective you control. At the end of your turn control your HOME and the marked objective, with no enemy unit in range of either objective.',
  },
  ZWIAD_OPERACYJNY: {
    name: 'Zwiad Operacyjny',
    description: 'At the end of your turn have qualifying OC>0 units in at least four sectors, with at least three units outside your deployment zone. One unit counts for one sector.',
  },
  SABOTAZ: {
    name: 'Sabotaż',
    description: 'Complete a Mission Action on a neutral objective you did not control at the start of your turn.',
  },
}
