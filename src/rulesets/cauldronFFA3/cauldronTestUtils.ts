import type { Army, UnitDefinition } from '../../domain/army/types'
import type { BattleSession } from '../../domain/battle/types'
import { createCauldronGame } from './session'
import type { OperationalPlanId } from './types'

function unit(id: string, name: string, points: number, startingModels: number, wounds: number): UnitDefinition {
  return {
    id,
    name,
    points,
    startingModels,
    modelGroups: [],
    stats: { wounds, objectiveControl: 2 },
    categories: [],
    keywords: [],
    rangedWeapons: [],
    meleeWeapons: [],
    abilities: [],
    enhancements: [],
    wargear: [],
    isWarlord: false,
    leaderOfUnitId: null,
    ledByUnitIds: [],
  }
}

export function testArmy(id: string, totalPoints = 1400): Army {
  return {
    id,
    name: `${id} roster`,
    faction: `${id} faction`,
    totalPoints,
    detachments: [],
    units: [
      unit('infantry', 'Four-model unit', 170, 4, 3),
      unit('tank', 'Single-model tank', 225, 1, 14),
      unit('remainder', 'Remainder', totalPoints - 395, 1, 10),
    ],
  }
}

export function testCauldronGame(options: {
  points?: [number, number, number]
  plans?: [OperationalPlanId, OperationalPlanId, OperationalPlanId]
} = {}): BattleSession {
  const points = options.points ?? [1400, 1400, 1400]
  const plans = options.plans ?? ['WYNISZCZENIE', 'WYNISZCZENIE', 'WYNISZCZENIE']
  const armies = [testArmy('army-a', points[0]), testArmy('army-b', points[1]), testArmy('army-c', points[2])]
  return createCauldronGame({
    gameId: 'cauldron-test',
    createdAt: '2026-08-31T10:00:00.000Z',
    guidanceLevel: 'guided',
    armies,
    players: [
      { id: 'p-a', name: 'Alpha', armyId: armies[0].id, deploymentZone: 'A', turnPosition: 1, operationalPlanId: plans[0] },
      { id: 'p-b', name: 'Bravo', armyId: armies[1].id, deploymentZone: 'B', turnPosition: 2, operationalPlanId: plans[1] },
      { id: 'p-c', name: 'Charlie', armyId: armies[2].id, deploymentZone: 'C', turnPosition: 3, operationalPlanId: plans[2] },
    ],
  })
}
