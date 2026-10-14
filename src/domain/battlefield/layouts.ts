import officialData from './officialLayouts.json'
import type { BattleSetup } from '../battle/types'
import type {
  BattlefieldGeometry,
  BoardPoint,
  BoardPresentation,
  OfficialBoardDefinition,
} from './types'

export const OFFICIAL_BOARD_SOURCE = officialData.source
const OFFICIAL = officialData.layouts as Record<string, OfficialBoardDefinition>
const DISPOSITION_ORDER = [
  'take-and-hold',
  'purge-the-foe',
  'disruption',
  'reconnaissance',
  'priority-assets',
]

function configOf(setup: BattleSetup): {
  primaryDeck?: string
  officialLayout?: number
  playerConfigs?: Record<string, { forceDisposition?: string }>
} {
  return setup.rulesetConfig && typeof setup.rulesetConfig === 'object'
    ? setup.rulesetConfig
    : {}
}

export function isOfficialBoard(setup: BattleSetup): boolean {
  return (
    (setup.players.length === 2 || Boolean(setup.doubles)) &&
    configOf(setup).primaryDeck === 'chapter-approved-duel'
  )
}

export function officialBoardDefinition(
  setup: BattleSetup,
): OfficialBoardDefinition | undefined {
  if (!isOfficialBoard(setup)) return
  const config = configOf(setup)
  const pair = setup.players.filter((player) => setup.turnOrder.includes(player.id)).map(
    (player) => config.playerConfigs?.[player.id]?.forceDisposition ?? '',
  )
  if (pair.some((value) => !DISPOSITION_ORDER.includes(value))) return
  pair.sort(
    (a, b) => DISPOSITION_ORDER.indexOf(a) - DISPOSITION_ORDER.indexOf(b),
  )
  const variant = 'ABC'[(config.officialLayout ?? 1) - 1]
  return OFFICIAL[[...pair, variant].join('|')]
}

export function defaultBattlefieldGeometry(
  setup: BattleSetup,
  attackerHomeZone: 'A' | 'B' = setup.battlefieldAttackerHomeZone ?? 'A',
): BattlefieldGeometry {
  const official = officialBoardDefinition(setup)
  const positions: BattlefieldGeometry['positions'] = Object.fromEntries(
    setup.objectives.map((objective) => [objective.id, null]),
  )
  if (official) {
    const assign = (id: string, point: BoardPoint | undefined) => {
      if (Object.hasOwn(positions, id))
        positions[id] = point ? { ...point } : null
    }
    assign(`${attackerHomeZone}-HOME`, official.objectives.homeAttacker[0])
    assign(
      `${attackerHomeZone === 'A' ? 'B' : 'A'}-HOME`,
      official.objectives.homeDefender[0],
    )
    official.objectives.central.forEach((point, index) =>
      assign(`CENTER-${index + 1}`, point),
    )
    official.objectives.expansion.forEach((point, index) =>
      assign(`EXPANSION-${index + 1}`, point),
    )
    return {
      version: 1,
      widthCm: official.widthCm,
      heightCm: official.heightCm,
      positions,
      locked: true,
      attackerHomeZone,
    }
  }
  const ffa = setup.players.length === 3
  const defaults: Record<string, BoardPoint> = ffa
    ? {
        'A-HOME': { x: 0.16, y: 0.15 },
        'B-HOME': { x: 0.84, y: 0.15 },
        'C-HOME': { x: 0.5, y: 0.86 },
        'AB-NEUTRAL': { x: 0.5, y: 0.18 },
        'AC-NEUTRAL': { x: 0.24, y: 0.61 },
        'BC-NEUTRAL': { x: 0.76, y: 0.61 },
        CENTER: { x: 0.5, y: 0.5 },
        N1: { x: 0.5, y: 0.18 },
        N2: { x: 0.24, y: 0.61 },
        N3: { x: 0.76, y: 0.61 },
      }
    : {
        'A-HOME': { x: 0.15, y: 0.5 },
        'B-HOME': { x: 0.85, y: 0.5 },
        N1: { x: 0.5, y: 0.2 },
        N2: { x: 0.5, y: 0.5 },
        N3: { x: 0.5, y: 0.8 },
        'CENTER-1': { x: 0.5, y: 0.35 },
        'CENTER-2': { x: 0.5, y: 0.65 },
        'EXPANSION-1': { x: 0.35, y: 0.2 },
        'EXPANSION-2': { x: 0.65, y: 0.8 },
      }
  setup.objectives.forEach((objective, index) => {
    positions[objective.id] = defaults[objective.id] ?? {
      x: (index + 1) / (setup.objectives.length + 1),
      y: 0.5,
    }
  })
  return {
    version: 1,
    widthCm: ffa ? 180 : 152.4,
    heightCm: ffa ? 120 : 111.76,
    positions,
    locked: true,
    attackerHomeZone,
  }
}

export function battlefieldPresentation(
  setup: BattleSetup,
  geometry: BattlefieldGeometry,
): BoardPresentation {
  const official = officialBoardDefinition(setup)
  if (official)
    return {
      title: `${setup.doubles ? 'Official Doubles' : 'Official Duel'} · Layout ${official.variant}`,
      official: true,
      sourcePage: official.page,
      sourceUrl: OFFICIAL_BOARD_SOURCE.url,
      sourceVersion: OFFICIAL_BOARD_SOURCE.version,
      deploymentAreas: [
        {
          zone: geometry.attackerHomeZone,
          path: official.deploymentPaths.attacker,
        },
        {
          zone: geometry.attackerHomeZone === 'A' ? 'B' : 'A',
          path: official.deploymentPaths.defender,
        },
      ],
      territoryPaths: official.territoryPaths,
      unplacedIds: Object.keys(geometry.positions).filter(
        (id) => geometry.positions[id] === null,
      ),
    }
  const ffa = setup.players.length === 3
  return {
    title: isOfficialBoard(setup)
      ? 'Official geometry unavailable · schematic'
      : ffa
        ? 'FFA 3 · custom schematic'
        : 'Cauldron Duel · schematic',
    official: false,
    // These are editable presentation templates, never official deployment or Territory rules.
    deploymentAreas: ffa
      ? [
          { zone: 'A', path: 'M 0 0 L .34 0 L .34 .25 L 0 .25 Z' },
          { zone: 'B', path: 'M .66 0 L 1 0 L 1 .25 L .66 .25 Z' },
          { zone: 'C', path: 'M .33 .75 L .67 .75 L .67 1 L .33 1 Z' },
        ]
      : [
          { zone: 'A', path: 'M 0 0 L .25 0 L .25 1 L 0 1 Z' },
          { zone: 'B', path: 'M .75 0 L 1 0 L 1 1 L .75 1 Z' },
        ],
    territoryPaths: [],
    unplacedIds: [],
  }
}

export function displayBoardPoint(
  point: BoardPoint,
  rotated: boolean,
): BoardPoint {
  return rotated ? { x: 1 - point.x, y: 1 - point.y } : point
}

export function validateBattlefieldGeometry(
  setup: BattleSetup,
  value: unknown,
): asserts value is BattlefieldGeometry {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid battlefield geometry.')
  const geometry = value as BattlefieldGeometry
  if (
    geometry.version !== 1 ||
    typeof geometry.locked !== 'boolean' ||
    !['A', 'B'].includes(geometry.attackerHomeZone)
  )
    throw new Error('Unsupported battlefield geometry format.')
  if (
    ![geometry.widthCm, geometry.heightCm].every(
      (size) =>
        typeof size === 'number' &&
        Number.isFinite(size) &&
        size >= 60 &&
        size <= 400,
    )
  )
    throw new Error('Battlefield dimensions must be between 60 and 400 cm.')
  if (
    !geometry.positions ||
    typeof geometry.positions !== 'object' ||
    Array.isArray(geometry.positions)
  )
    throw new Error('Objective positions are missing.')
  const ids = setup.objectives.map((objective) => objective.id)
  if (
    Object.keys(geometry.positions).length !== ids.length ||
    ids.some((id) => !Object.hasOwn(geometry.positions, id))
  )
    throw new Error(
      'Geometry must preserve the battle objective IDs and count.',
    )
  for (const point of Object.values(geometry.positions)) {
    if (point === null) continue
    if (
      !point ||
      typeof point !== 'object' ||
      ![point.x, point.y].every(
        (value) =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 1,
      )
    )
      throw new Error(
        'Objective coordinates must be normalized between 0 and 1.',
      )
  }
  const official = officialBoardDefinition(setup)
  if (official) {
    const expected = defaultBattlefieldGeometry(
      setup,
      geometry.attackerHomeZone,
    )
    if (
      !geometry.locked ||
      geometry.widthCm !== expected.widthCm ||
      geometry.heightCm !== expected.heightCm ||
      ids.some((id) => {
        const point = geometry.positions[id],
          other = expected.positions[id]
        return point === null || other === null
          ? point !== other
          : point.x !== other.x || point.y !== other.y
      })
    )
      throw new Error(
        'Official geometry is fixed; only Attacker/Defender HOME mapping can change.',
      )
  } else if (Object.values(geometry.positions).some((point) => point === null))
    throw new Error('A custom schematic must place every saved objective.')
}
