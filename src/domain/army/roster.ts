import { z } from 'zod'
import type { Army, UnitDefinition } from './types'
import { createPortableUuid } from '../../multiplayer/uuid'

const text = z.string().max(100_000)
const count = z.number().int().min(0).max(100_000)
const stats = z.object({
  movement: text.optional(),
  toughness: count.optional(),
  save: text.optional(),
  wounds: count.optional(),
  leadership: text.optional(),
  objectiveControl: count.optional(),
  invulnerableSave: text.nullable().optional(),
})
const weapon = z.object({
  name: text,
  type: z.enum(['ranged', 'melee']),
  range: text.optional(),
  attacks: text.optional(),
  skill: text.optional(),
  strength: text.optional(),
  ap: text.optional(),
  damage: text.optional(),
  keywords: z.array(text),
})
const unit = z.object({
  id: text.min(1),
  sourceId: text.optional(),
  name: text.min(1),
  points: count,
  startingModels: count.min(1),
  modelGroups: z.array(
    z.object({
      name: text,
      startingCount: count,
      equipment: z.array(text),
      stats: stats.optional(),
    }),
  ),
  stats: stats.optional(),
  categories: z.array(text),
  keywords: z.array(text),
  rangedWeapons: z.array(weapon),
  meleeWeapons: z.array(weapon),
  abilities: z.array(z.object({ name: text, description: text.optional() })),
  enhancements: z.array(
    z.object({ name: text, points: count, description: text.optional() }),
  ),
  wargear: z.array(z.object({ name: text, points: count })),
  isWarlord: z.boolean(),
  leaderOfUnitId: text.nullable(),
  ledByUnitIds: z.array(text),
  sourceMetadata: z
    .object({
      importer: text,
      nrRosterId: text.optional(),
      nrSelectionId: text.optional(),
    })
    .optional(),
  editor: z
    .object({
      customPoints: z.boolean().optional(),
      changedModels: z.boolean().optional(),
    })
    .optional(),
})
export const armySchema = z.object({
  id: text.min(1),
  name: text.trim().min(1).max(250),
  faction: text.min(1),
  totalPoints: count,
  pointsLimit: count.optional(),
  detachments: z.array(z.object({ id: text.min(1), name: text.min(1) })),
  units: z.array(unit).max(2000),
  localMediaId: text.optional(),
  library: z
    .object({
      source: z.enum(['new-recruit', 'local-edit', 'homebrew']),
      createdAt: text,
      updatedAt: text,
      variantOf: text.optional(),
    })
    .optional(),
})

export function validateArmy(raw: unknown): Army {
  const army = armySchema.parse(raw)
  const ids = new Set(army.units.map((u) => u.id))
  if (ids.size !== army.units.length)
    throw new Error('Duplicate unit IDs in roster.')
  if (
    army.units.some(
      (u) =>
        u.leaderOfUnitId &&
        (!ids.has(u.leaderOfUnitId) || u.leaderOfUnitId === u.id),
    )
  )
    throw new Error('Invalid Leader reference in roster.')
  for (const u of army.units) {
    const visited = new Set([u.id])
    let target = u.leaderOfUnitId
    while (target) {
      if (visited.has(target))
        throw new Error('Leader assignments cannot form a cycle.')
      visited.add(target)
      target =
        army.units.find((unit) => unit.id === target)?.leaderOfUnitId ?? null
    }
  }
  if (army.units.filter((u) => u.isWarlord).length > 1)
    throw new Error('Choose only one Warlord.')
  return army
}

export function normalizeRoster(
  input: Army,
  source?: NonNullable<Army['library']>['source'],
): Army {
  const army = structuredClone(input)
  const now = new Date().toISOString()
  army.library = {
    source: source ?? army.library?.source ?? 'new-recruit',
    createdAt: army.library?.createdAt ?? now,
    updatedAt: now,
    variantOf: army.library?.variantOf,
  }
  const ids = new Set(army.units.map((u) => u.id))
  for (const u of army.units) {
    if (u.leaderOfUnitId === u.id || !ids.has(u.leaderOfUnitId ?? ''))
      u.leaderOfUnitId = null
    u.ledByUnitIds = []
  }
  for (const u of army.units)
    if (u.leaderOfUnitId)
      army.units.find((t) => t.id === u.leaderOfUnitId)!.ledByUnitIds.push(u.id)
  army.totalPoints = army.units.reduce((sum, u) => sum + u.points, 0)
  return validateArmy(army)
}

export function copyRoster(input: Army, name = `${input.name} — copy`): Army {
  const army = structuredClone(input)
  army.id = createPortableUuid()
  delete army.localMediaId
  army.name = name.slice(0, 250)
  const ids = new Map(army.units.map((u) => [u.id, createPortableUuid()]))
  army.units = army.units.map((u) => ({
    ...u,
    id: ids.get(u.id)!,
    leaderOfUnitId: u.leaderOfUnitId
      ? (ids.get(u.leaderOfUnitId) ?? null)
      : null,
    ledByUnitIds: [],
  }))
  army.library = {
    source: input.library?.source === 'homebrew' ? 'homebrew' : 'local-edit',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    variantOf: input.id,
  }
  return normalizeRoster(army)
}

export function copyUnit(unit: UnitDefinition): UnitDefinition {
  return {
    ...structuredClone(unit),
    id: createPortableUuid(),
    sourceId: undefined,
    sourceMetadata: unit.sourceMetadata
      ? { ...unit.sourceMetadata, nrSelectionId: undefined }
      : undefined,
    isWarlord: false,
    leaderOfUnitId: null,
    ledByUnitIds: [],
  }
}

export function rosterWarnings(army: Army): string[] {
  const warnings = [
    'List legality, points and Leader eligibility are not fully validated. Check your current rules and New Recruit.',
  ]
  if (army.pointsLimit && army.totalPoints > army.pointsLimit)
    warnings.push(
      `Over the points limit by ${army.totalPoints - army.pointsLimit} pts.`,
    )
  if (!army.units.some((u) => u.isWarlord))
    warnings.push('No Warlord selected.')
  if (army.units.some((u) => u.editor?.changedModels))
    warnings.push(
      'Model counts changed manually. Costs, equipment and profile legality need checking; costs were not estimated.',
    )
  if (army.units.some((u) => u.editor?.customPoints))
    warnings.push('Includes custom unit points.')
  return warnings
}

export function exportRosters(armies: Army[]): string {
  return JSON.stringify(
    {
      format: 'tabletophelper-armies',
      version: 1,
      exportedAt: new Date().toISOString(),
      armies: armies.map(({ localMediaId: _localMediaId, ...army }) => army),
    },
    null,
    2,
  )
}
export function importRosters(raw: unknown): Army[] | null {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('format' in raw) ||
    raw.format !== 'tabletophelper-armies'
  )
    return null
  const data = z
    .object({
      format: z.literal('tabletophelper-armies'),
      version: z.literal(1),
      armies: z.array(z.unknown()).max(2000),
    })
    .parse(raw)
  return data.armies.map(validateArmy)
}
