import type { CombatProfileState, UnitDefinition, UnitState } from '../army/types'
import type { CombatResolution } from './types'

export type CombatProfile = { id: string; name: string; startingModels: number; woundsPerModel?: number }
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 10000

export function combatProfiles(unit: UnitDefinition): CombatProfile[] {
  const groups = unit.modelGroups
  const complete = groups.length > 0 && groups.reduce((sum, group) => sum + group.startingCount, 0) === unit.startingModels
  const hasGroupWounds = groups.some((group) => positive(group.stats?.wounds))
  if (complete && hasGroupWounds) {
    const values = groups.map((group) => positive(group.stats?.wounds) ? group.stats!.wounds : undefined)
    if (new Set(values).size > 1) return groups.map((group, index) => ({ id: `group-${index}`, name: group.name, startingModels: group.startingCount, woundsPerModel: values[index] }))
    return [{ id: 'unit', name: unit.name, startingModels: unit.startingModels, woundsPerModel: values[0] }]
  }
  return [{ id: 'unit', name: unit.name, startingModels: unit.startingModels, woundsPerModel: hasGroupWounds && !complete ? undefined : positive(unit.stats?.wounds) ? unit.stats!.wounds : undefined }]
}

/** Mixed-profile legacy casualties need a human allocation, never a guessed split. */
export function readCombatState(unit: UnitDefinition, state: UnitState): Record<string, CombatProfileState> | null {
  if (state.combatProfiles) return structuredClone(state.combatProfiles)
  const profiles = combatProfiles(unit)
  if (profiles.length > 1 && state.modelsAlive !== unit.startingModels && state.modelsAlive !== 0) return null
  return Object.fromEntries(profiles.map((profile) => {
    const alive = profiles.length === 1 ? state.modelsAlive : state.destroyed ? 0 : profile.startingModels
    const current = alive === 0 ? 0 : profiles.length === 1
      ? (unit.startingModels === 1 ? state.woundsRemaining : state.currentModelWounds) ?? profile.woundsPerModel
      : profile.woundsPerModel
    return [profile.id, { modelsAlive: alive, woundsPerModel: profile.woundsPerModel, currentModelWounds: current }]
  }))
}

export function totalCombatWounds(unit: UnitDefinition, state: UnitState): number | undefined {
  const groups = readCombatState(unit, state)
  if (!groups) return undefined
  let total = 0
  for (const group of Object.values(groups)) {
    if (group.modelsAlive === 0) continue
    if (!positive(group.woundsPerModel) || !positive(group.currentModelWounds)) return undefined
    total += (group.modelsAlive - 1) * group.woundsPerModel + group.currentModelWounds
  }
  return total
}

export function setCombatState(unit: UnitDefinition, state: UnitState, groups: Record<string, CombatProfileState>): void {
  const profiles = combatProfiles(unit)
  if (!groups || typeof groups !== 'object' || Object.keys(groups).length !== profiles.length) throw new Error('Confirm every model profile.')
  for (const profile of profiles) {
    const group = groups[profile.id]
    if (!group || !Number.isSafeInteger(group.modelsAlive) || group.modelsAlive < 0 || group.modelsAlive > profile.startingModels) throw new Error('Invalid surviving model count.')
    if (group.woundsPerModel !== undefined && !positive(group.woundsPerModel)) throw new Error('Invalid Wounds per model.')
    if (profile.woundsPerModel !== undefined && group.woundsPerModel !== profile.woundsPerModel) throw new Error('Wounds must match the imported profile.')
    if (group.modelsAlive === 0) group.currentModelWounds = 0
    else if (group.woundsPerModel !== undefined && (!positive(group.currentModelWounds) || group.currentModelWounds > group.woundsPerModel)) throw new Error('Current Wounds must be between 1 and the profile maximum.')
    else if (group.woundsPerModel === undefined && group.currentModelWounds !== undefined) throw new Error('Confirm maximum Wounds first.')
  }
  state.combatProfiles = structuredClone(groups)
  state.modelsAlive = Object.values(groups).reduce((sum, group) => sum + group.modelsAlive, 0)
  state.destroyed = state.modelsAlive === 0
  const only = profiles.length === 1 ? groups[profiles[0].id] : undefined
  state.currentModelWounds = state.destroyed ? 0 : unit.startingModels > 1 ? only?.currentModelWounds : undefined
  state.woundsRemaining = state.destroyed ? 0 : unit.startingModels === 1 ? only?.currentModelWounds : undefined
}

export function resolveCombat(unit: UnitDefinition, current: UnitState, input: CombatResolution): UnitState {
  if (!['damage', 'heal', 'restore'].includes(input.kind) || !Array.isArray(input.allocations) || input.allocations.length === 0 || input.allocations.length > 100) throw new Error('Choose a combat operation and model profile.')
  const state = structuredClone(current)
  const groups = readCombatState(unit, state)
  if (!groups) throw new Error('Confirm the surviving model profiles using a correction before recording combat.')
  const profiles = combatProfiles(unit)
  for (const allocation of input.allocations) {
    const group = groups[allocation.profileId]
    const profile = profiles.find((candidate) => candidate.id === allocation.profileId)
    if (!group || !profile) throw new Error('Choose the model profile receiving this change.')
    const byWounds = allocation.wounds !== undefined
    const amount = byWounds ? allocation.wounds : allocation.models
    if (!positive(amount) || (byWounds && allocation.models !== undefined)) throw new Error('Enter positive, whole effective Wounds OR models, not both.')
    if (input.kind === 'heal' && !byWounds) throw new Error('Healing requires Wounds.')
    if (input.kind === 'restore' && byWounds) throw new Error('Restoration requires a model count.')
    if (byWounds && !positive(group.woundsPerModel)) throw new Error('Confirm Wounds per model before applying Wounds.')
    if (input.kind === 'restore') {
      if (current.destroyed && input.allowDestroyed !== true) throw new Error('Explicitly confirm returning a destroyed unit to the battlefield.')
      const restored = Math.min(amount, profile.startingModels - group.modelsAlive)
      if (restored > 0 && group.modelsAlive === 0) group.currentModelWounds = group.woundsPerModel
      group.modelsAlive += restored
    } else if (input.kind === 'heal') {
      // Healing a dead unit is a no-op, including after a concurrent final casualty.
      if (group.modelsAlive > 0) group.currentModelWounds = Math.min(group.woundsPerModel!, group.currentModelWounds! + amount)
    } else if (byWounds) {
      const before = group.modelsAlive === 0 ? 0 : (group.modelsAlive - 1) * group.woundsPerModel! + group.currentModelWounds!
      const remaining = Math.max(0, before - amount)
      group.modelsAlive = Math.ceil(remaining / group.woundsPerModel!)
      group.currentModelWounds = remaining === 0 ? 0 : ((remaining - 1) % group.woundsPerModel!) + 1
    } else {
      const lost = Math.min(group.modelsAlive, amount)
      group.modelsAlive -= lost
      if (lost > 0) group.currentModelWounds = group.modelsAlive === 0 ? 0 : group.woundsPerModel
    }
  }
  setCombatState(unit, state, groups)
  return state
}

export function combatStatus(unit: UnitDefinition, state: UnitState): string {
  if (state.destroyed) return 'Destroyed'
  if (state.battleShocked) return 'Battle-shocked'
  const groups = readCombatState(unit, state)
  const wounded = groups && Object.values(groups).some((group) => group.modelsAlive > 0 && group.currentModelWounds !== undefined && group.currentModelWounds < (group.woundsPerModel ?? 0))
  const single = groups ? Object.values(groups)[0] : undefined
  const belowHalf = unit.startingModels > 1 ? state.modelsAlive * 2 < unit.startingModels
    : single?.currentModelWounds !== undefined && single.woundsPerModel !== undefined && single.currentModelWounds * 2 < single.woundsPerModel
  if (belowHalf && (unit.leaderOfUnitId || unit.ledByUnitIds.length > 0)) return 'Damaged · confirm attached strength'
  return belowHalf ? 'Below Half Strength' : state.modelsAlive < unit.startingModels || wounded ? 'Damaged' : 'Full Strength'
}
