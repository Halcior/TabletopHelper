import type { Army, UnitDefinition } from '../../domain/army/types'
import { normalizeName, type Row, type RulesBundle } from './data'

export function factionIds(bundle: RulesBundle, faction: string): string[] {
  return (bundle.tables['Factions.csv'] ?? []).filter(row => normalizeName(row.name) === normalizeName(faction)).map(row => row.id)
}
export function matchSheet(bundle: RulesBundle, army: Army, unit: UnitDefinition, confirmedId?: string) {
  const sheets = bundle.tables['Datasheets.csv'] ?? []
  const confirmed = confirmedId && sheets.find(row => row.id === confirmedId)
  if (confirmed) return { sheet: confirmed, status: 'confirmed' as const, candidates: [confirmed] }
  // sourceId/nrSelectionId belong to New Recruit's namespace, NOT Wahapedia.
  const factions = factionIds(bundle, army.faction)
  const candidates = sheets.filter(row => (!factions.length || factions.includes(row.faction_id)) && normalizeName(row.name) === normalizeName(unit.name))
  return { sheet: factions.length && candidates.length === 1 ? candidates[0] : undefined,
    status: factions.length && candidates.length === 1 ? 'exact' as const : candidates.length ? 'ambiguous' as const : 'missing' as const, candidates }
}
export function selectedWeapon(unit: UnitDefinition, weapon: Row): boolean {
  const names = [...unit.modelGroups.flatMap(group => group.equipment), ...unit.wargear.map(item => item.name),
    ...unit.rangedWeapons.map(item => item.name), ...unit.meleeWeapons.map(item => item.name)].map(normalizeName)
  // A variant suffix is intentionally not guessed from a partial name.
  return names.includes(normalizeName(weapon.name))
}
export function armyStratagems(bundle: RulesBundle, army: Army): Row[] {
  const factions = factionIds(bundle, army.faction)
  const detachments = new Set(army.detachments.map(row => normalizeName(row.name)))
  return (bundle.tables['Stratagems.csv'] ?? []).filter(row => {
    // Blank faction also occurs in Boarding Actions: it is not proof of Core.
    if (!row.faction_id) return /core/i.test(row.type)
    if (!factions.includes(row.faction_id)) return false
    if (/boarding|combat patrol/i.test(row.type)) return false
    return !row.detachment || detachments.has(normalizeName(row.detachment))
  })
}
export function phaseVisible(row: Row, phase: string): boolean {
  // Unknown timing always stays visible; no inference from prose.
  if (!phase || !row.phase || /any/i.test(row.phase)) return true
  if (!/command|movement|shooting|charge|fight|end.*turn/i.test(row.phase)) return true
  return normalizeName(row.phase).includes(phase.toLowerCase().replace('_', ' '))
}
