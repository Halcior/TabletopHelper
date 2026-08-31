import type {
  Army,
  Detachment,
  Enhancement,
  ModelGroup,
  UnitDefinition,
  WargearItem,
  WeaponProfile,
} from '../../domain/army/types'
import { profileToAbility, profileToUnitStats, profileToWeapon } from './profileParsers'
import {
  parseNewRecruitRoster,
  type NewRecruitProfile,
  type NewRecruitRoster,
  type NewRecruitSelection,
} from './schema'

export type ImportWarningCode =
  | 'POINTS_MISMATCH'
  | 'POINTS_RECONCILED'
  | 'UNRESOLVED_ASSOCIATION'
  | 'MISSING_UNIT_PROFILE'
  | 'UNSUPPORTED_STRUCTURE'

export type ImportWarning = {
  code: ImportWarningCode
  message: string
  selectionId?: string
}

export type ImportResult = {
  army: Army
  warnings: ImportWarning[]
}

type PointBreakdown = {
  root: number
  descendants: number
  total: number
}

type UnitDraft = {
  selection: NewRecruitSelection
  unit: UnitDefinition
  points: PointBreakdown
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${suffix}`
}

function selectionName(selection: NewRecruitSelection): string {
  return selection.name === undefined ? 'Unnamed unit' : String(selection.name)
}

function pointCost(selection: Pick<NewRecruitSelection, 'costs'>): number {
  const cost = selection.costs?.find((candidate) => candidate.name?.toLowerCase() === 'pts')
  return cost?.value ?? 0
}

function rosterPoints(roster: NewRecruitRoster): number {
  const cost = roster.costs?.find((candidate) => candidate.name?.toLowerCase() === 'pts')
  return cost?.value ?? 0
}

function profileType(profile: NewRecruitProfile): string {
  return profile.typeName?.toLowerCase() ?? ''
}

function isLogicalUnit(selection: NewRecruitSelection): boolean {
  const type = selection.type?.toLowerCase()
  if (type === 'unit') return true
  return selection.profiles?.some((profile) => profileType(profile) === 'unit') ?? false
}

function visitSubtree(
  selection: NewRecruitSelection,
  visitor: (node: NewRecruitSelection) => void,
): void {
  visitor(selection)
  for (const child of selection.selections ?? []) visitSubtree(child, visitor)
}

function findFirstProfile(selection: NewRecruitSelection, typeName: string): NewRecruitProfile | undefined {
  const wanted = typeName.toLowerCase()
  let match: NewRecruitProfile | undefined
  visitSubtree(selection, (node) => {
    if (match) return
    match = node.profiles?.find((profile) => profileType(profile) === wanted)
  })
  return match
}

function collectLogicalUnits(roster: NewRecruitRoster): {
  logicalSelections: NewRecruitSelection[]
  selectionIndex: Map<string, NewRecruitSelection>
  logicalOwner: Map<NewRecruitSelection, NewRecruitSelection>
} {
  const logicalSelections: NewRecruitSelection[] = []
  const selectionIndex = new Map<string, NewRecruitSelection>()
  const logicalOwner = new Map<NewRecruitSelection, NewRecruitSelection>()

  function visit(selection: NewRecruitSelection, owner?: NewRecruitSelection): void {
    if (selection.id) selectionIndex.set(selection.id, selection)
    const nextOwner = owner ?? (isLogicalUnit(selection) ? selection : undefined)
    if (!owner && nextOwner) logicalSelections.push(selection)
    if (nextOwner) logicalOwner.set(selection, nextOwner)
    for (const child of selection.selections ?? []) visit(child, nextOwner)
  }

  for (const force of roster.forces ?? []) {
    for (const selection of force.selections ?? []) visit(selection)
  }

  return { logicalSelections, selectionIndex, logicalOwner }
}

function pointBreakdown(selection: NewRecruitSelection): PointBreakdown {
  const root = pointCost(selection)
  let descendants = 0
  for (const child of selection.selections ?? []) {
    visitSubtree(child, (node) => { descendants += pointCost(node) })
  }
  return { root, descendants, total: root + descendants }
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = key(item)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function weaponKey(weapon: WeaponProfile): string {
  return [
    weapon.type,
    weapon.name,
    weapon.range,
    weapon.attacks,
    weapon.skill,
    weapon.strength,
    weapon.ap,
    weapon.damage,
    weapon.keywords.join(','),
  ].join('|')
}

function profilesAndEquipment(selection: NewRecruitSelection): {
  rangedWeapons: WeaponProfile[]
  meleeWeapons: WeaponProfile[]
  abilities: UnitDefinition['abilities']
  enhancements: Enhancement[]
  wargear: WargearItem[]
} {
  const rangedWeapons: WeaponProfile[] = []
  const meleeWeapons: WeaponProfile[] = []
  const abilities: UnitDefinition['abilities'] = []
  const enhancements: Enhancement[] = []
  const wargear: WargearItem[] = []

  visitSubtree(selection, (node) => {
    const profiles = node.profiles ?? []
    const abilityProfiles = profiles.filter((profile) => profileType(profile).includes('abilit'))
    const rangedProfiles = profiles.filter((profile) => profileType(profile).includes('ranged'))
    const meleeProfiles = profiles.filter((profile) => profileType(profile).includes('melee'))

    for (const profile of abilityProfiles) abilities.push(profileToAbility(profile))
    for (const profile of rangedProfiles) rangedWeapons.push(profileToWeapon(profile, 'ranged'))
    for (const profile of meleeProfiles) meleeWeapons.push(profileToWeapon(profile, 'melee'))

    if (node === selection) return
    const points = pointCost(node)
    const name = selectionName(node)
    if (points > 0 && abilityProfiles.length > 0) {
      enhancements.push({
        name,
        points,
        description: profileToAbility(abilityProfiles[0]).description,
      })
    }
    if (rangedProfiles.length > 0 || meleeProfiles.length > 0) {
      wargear.push({ name, points })
    } else if (points > 0 && abilityProfiles.length === 0) {
      wargear.push({ name, points })
    }
  })

  return {
    rangedWeapons: uniqueBy(rangedWeapons, weaponKey),
    meleeWeapons: uniqueBy(meleeWeapons, weaponKey),
    abilities: uniqueBy(abilities, (ability) => `${ability.name}|${ability.description ?? ''}`),
    enhancements: uniqueBy(enhancements, (enhancement) => enhancement.name),
    wargear: uniqueBy(wargear, (item) => item.name),
  }
}

function modelEquipment(selection: NewRecruitSelection): string[] {
  const equipment: string[] = []
  visitSubtree(selection, (node) => {
    if (node === selection) return
    const isEquipment = node.profiles?.some((profile) => {
      const type = profileType(profile)
      return type.includes('ranged') || type.includes('melee')
    })
    if (isEquipment) equipment.push(selectionName(node))
  })
  return [...new Set(equipment)]
}

function nearestModelSelections(selection: NewRecruitSelection): NewRecruitSelection[] {
  const models: NewRecruitSelection[] = []
  function visit(node: NewRecruitSelection): void {
    for (const child of node.selections ?? []) {
      if (child.type?.toLowerCase() === 'model') models.push(child)
      else visit(child)
    }
  }
  visit(selection)
  return models
}

function modelGroups(selection: NewRecruitSelection, fallbackStats: UnitDefinition['stats']): ModelGroup[] {
  const models = nearestModelSelections(selection)
  const groupSelections = models.length > 0
    ? models
    : selection.type?.toLowerCase() === 'model'
      ? [selection]
      : []

  return groupSelections.map((model) => {
    const profile = findFirstProfile(model, 'unit')
    return {
      name: selectionName(model),
      startingCount: Math.max(1, model.number ?? 1),
      equipment: modelEquipment(model),
      stats: profile ? profileToUnitStats(profile) : fallbackStats,
    }
  })
}

function categoryNames(selection: NewRecruitSelection): string[] {
  return (selection.categories ?? [])
    .map((category) => category.name?.trim())
    .filter((name): name is string => Boolean(name))
}

function isWarlord(selection: NewRecruitSelection): boolean {
  let result = false
  visitSubtree(selection, (node) => {
    if (selectionName(node).toLowerCase() === 'warlord') result = true
    if (categoryNames(node).some((category) => category.toLowerCase() === 'warlord')) result = true
  })
  return result
}

function buildUnit(
  selection: NewRecruitSelection,
  roster: NewRecruitRoster,
  warnings: ImportWarning[],
): UnitDraft {
  const sourceId = selection.id
  const statsProfile = findFirstProfile(selection, 'unit')
  const stats = statsProfile ? profileToUnitStats(statsProfile) : undefined
  if (!statsProfile) {
    warnings.push({
      code: 'MISSING_UNIT_PROFILE',
      message: `${selectionName(selection)} has no Unit profile; battle stats are unavailable.`,
      selectionId: sourceId,
    })
  }

  const groups = modelGroups(selection, stats)
  const categories = categoryNames(selection)
  const extras = profilesAndEquipment(selection)
  const points = pointBreakdown(selection)
  const unit: UnitDefinition = {
    id: sourceId ? `nr-unit-${sourceId}` : createId('nr-unit'),
    sourceId,
    name: selectionName(selection),
    points: points.total,
    startingModels: groups.length
      ? groups.reduce((total, group) => total + group.startingCount, 0)
      : Math.max(1, selection.number ?? 1),
    modelGroups: groups,
    stats,
    categories,
    keywords: categories,
    rangedWeapons: extras.rangedWeapons,
    meleeWeapons: extras.meleeWeapons,
    abilities: extras.abilities,
    enhancements: extras.enhancements,
    wargear: extras.wargear,
    isWarlord: isWarlord(selection),
    leaderOfUnitId: null,
    ledByUnitIds: [],
    sourceMetadata: {
      importer: 'new-recruit',
      nrRosterId: roster.id,
      nrSelectionId: sourceId,
    },
  }
  return { selection, unit, points }
}

function reconcilePoints(drafts: UnitDraft[], expectedTotal: number, warnings: ImportWarning[]): void {
  const importedTotal = drafts.reduce((total, draft) => total + draft.unit.points, 0)
  if (!expectedTotal || importedTotal === expectedTotal) return

  const scale = 100
  const target = Math.round(expectedTotal * scale)
  let possibilities = new Map<number, number[]>([[0, []]])
  for (const draft of drafts) {
    const candidates = [...new Set([
      draft.points.total,
      draft.points.root,
      Math.max(draft.points.root, draft.points.descendants),
    ])]
    const next = new Map<number, number[]>()
    for (const [subtotal, choices] of possibilities) {
      for (const candidate of candidates) {
        const sum = subtotal + Math.round(candidate * scale)
        if (sum <= target && !next.has(sum)) next.set(sum, [...choices, candidate])
      }
    }
    possibilities = next
  }

  const resolved = possibilities.get(target)
  if (resolved) {
    drafts.forEach((draft, index) => { draft.unit.points = resolved[index] })
    warnings.push({
      code: 'POINTS_RECONCILED',
      message: 'New Recruit used aggregated selection costs; unit costs were reconciled to the roster total.',
    })
    return
  }

  warnings.push({
    code: 'POINTS_MISMATCH',
    message: `Imported unit costs total ${importedTotal} pts, but the roster declares ${expectedTotal} pts.`,
  })
}

function resolveLeaderAssociations(
  drafts: UnitDraft[],
  selectionIndex: Map<string, NewRecruitSelection>,
  logicalOwner: Map<NewRecruitSelection, NewRecruitSelection>,
  warnings: ImportWarning[],
): void {
  const unitByLogicalSelection = new Map<NewRecruitSelection, UnitDefinition>(
    drafts.map((draft) => [draft.selection, draft.unit]),
  )
  const unitForSelectionId = (selectionId: string): UnitDefinition | undefined => {
    const selection = selectionIndex.get(selectionId)
    const owner = selection ? logicalOwner.get(selection) : undefined
    return owner ? unitByLogicalSelection.get(owner) : undefined
  }

  for (const [ownerId, selection] of selectionIndex) {
    for (const association of selection.associations ?? []) {
      if (!association.name?.toLowerCase().includes('lead')) continue
      const fromId = association.from ?? (association.to ? ownerId : undefined)
      const toId = association.to ?? (association.from ? ownerId : undefined)
      const leader = fromId ? unitForSelectionId(fromId) : undefined
      const bodyguard = toId ? unitForSelectionId(toId) : undefined
      if (!leader || !bodyguard || leader.id === bodyguard.id) {
        warnings.push({
          code: 'UNRESOLVED_ASSOCIATION',
          message: `Could not resolve Leading association ${fromId ?? '?'} -> ${toId ?? '?'}.`,
          selectionId: ownerId,
        })
        continue
      }
      leader.leaderOfUnitId = bodyguard.id
      if (!bodyguard.ledByUnitIds.includes(leader.id)) bodyguard.ledByUnitIds.push(leader.id)
    }
  }
}

function findSelection(roster: NewRecruitRoster, name: string): NewRecruitSelection | undefined {
  let match: NewRecruitSelection | undefined
  for (const force of roster.forces ?? []) {
    for (const root of force.selections ?? []) {
      visitSubtree(root, (selection) => {
        if (!match && selectionName(selection).toLowerCase() === name.toLowerCase()) match = selection
      })
    }
  }
  return match
}

function detachments(roster: NewRecruitRoster): Detachment[] {
  const container = findSelection(roster, 'Detachments')
  return (container?.selections ?? []).map((selection) => ({
    id: selection.id ? `nr-detachment-${selection.id}` : createId('nr-detachment'),
    name: selectionName(selection),
  }))
}

function factionName(roster: NewRecruitRoster): string {
  const catalogue = roster.forces?.[0]?.catalogueName
  if (!catalogue) return 'Unknown faction'
  return catalogue.split(' - ').at(-1)?.trim() || catalogue
}

export const NewRecruitImporter = {
  import(raw: unknown): ImportResult {
    const roster = parseNewRecruitRoster(raw)
    const warnings: ImportWarning[] = []
    const { logicalSelections, selectionIndex, logicalOwner } = collectLogicalUnits(roster)
    if (logicalSelections.length === 0) {
      throw new Error('Invalid New Recruit roster: no logical units were found.')
    }

    const drafts = logicalSelections.map((selection) => buildUnit(selection, roster, warnings))
    const declaredPoints = rosterPoints(roster)
    reconcilePoints(drafts, declaredPoints, warnings)
    resolveLeaderAssociations(drafts, selectionIndex, logicalOwner, warnings)
    const units = drafts.map((draft) => draft.unit)
    const pointsLimitSelection = findSelection(roster, 'Points limit')

    const army: Army = {
      id: roster.id ? `nr-army-${roster.id}` : createId('nr-army'),
      name: roster.name === undefined ? 'Imported army' : String(roster.name),
      faction: factionName(roster),
      totalPoints: declaredPoints || units.reduce((total, unit) => total + unit.points, 0),
      pointsLimit: pointsLimitSelection?.number,
      detachments: detachments(roster),
      units,
    }

    return { army, warnings }
  },
}

export default NewRecruitImporter
