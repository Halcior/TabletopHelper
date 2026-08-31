import type { ObjectiveDefinition } from '../../domain/battle/types'
import type { OperationalPlanId } from './types'

export const CAULDRON_RULESET_ID = 'cauldron-ffa-3'
export const CAULDRON_PLAYER_COUNT = 3
export const CAULDRON_BATTLE_ROUNDS = 5
export const CAULDRON_PRIMARY_CAP = 45
export const CAULDRON_SECONDARY_CAP = 45
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
    description: 'Destroy at least 10% of the current Rival’s starting army value during this Battle Round.',
  },
  DECYDUJACE_NATARCIE: {
    name: 'Decydujące Natarcie',
    description: 'Control an objective that the current Rival controlled at the start of this Battle Round.',
  },
  TWIERDZA: {
    name: 'Twierdza',
    description: 'Control your HOME and a neutral objective you controlled at the start of this Battle Round.',
  },
  ZWIAD_OPERACYJNY: {
    name: 'Zwiad Operacyjny',
    description: 'Have qualifying OC>0 units in at least three sectors, with at least two outside your deployment zone.',
  },
  SABOTAZ: {
    name: 'Sabotaż',
    description: 'Complete the qualifying Mission Action on a neutral objective.',
  },
}
