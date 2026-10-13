import { battleUnit, buildBattleChronicle, rulesetData, type ChronicleEntry, type UnitReference } from './chronicle'
import type { BattleSession } from './types'

export type UnitPerformance = UnitReference & {
  startingPoints: number
  startingModels: number
  startingWounds?: number
  modelsDestroyed: number
  enemyPointsDestroyed: number
  kills: number
  destroyedEnemies: Array<UnitReference & { round: number }>
  damageDealt: number | null
  damagePartial: boolean
  modelsLost: number
  remainingModels: number
  remainingWounds?: number
  survived: boolean
  destructionRound?: number
  completedMissionActions: number
  missionVp: number | null
  combatRoi: number | null
}
export type ArmyPerformance = {
  playerId: string
  startingPoints: number
  enemyPointsDestroyed: number
  ownPointsLost: number
  kills: number
  playerOnlyPoints: number
}
export type UnitAward = {
  title: 'Executioner' | 'Objective Hero' | 'Last Stand'
  rule: string
  winners: UnitReference[]
}
export type BattlePerformance = {
  units: UnitPerformance[]
  armies: ArmyPerformance[]
  awards: UnitAward[]
  unattributedPoints: number
  partial: boolean
}

type Credit = { count: number; attackerPlayerId?: string; attackerUnitId?: string }
type MissionCredit = { unit: UnitReference; completed: boolean }
export const performanceKey = (playerId: string, unitId: string): string => JSON.stringify([playerId, unitId])
const valuePerModel = (unit: UnitPerformance): number => unit.startingModels > 0 ? unit.startingPoints / unit.startingModels : 0

/**
 * Net casualty value uses equal cost per starting model. Restoration/correction
 * removes the latest outstanding credits across rounds, including unknown ones.
 * Kills use the last hit, and are removed when that target becomes alive again.
 * Damage is only explicit single-model wound decreases; whole-unit KO infers none.
 */
export function buildUnitPerformance(session: BattleSession, chronicle = buildBattleChronicle(session)): BattlePerformance {
  const units = session.setup.players.flatMap((player): UnitPerformance[] => {
    const army = player.armyId ? session.setup.armies[player.armyId] : undefined
    return (army?.units ?? []).map((unit) => ({
      ...battleUnit(session, player.id, unit.id), startingPoints: unit.points, startingModels: unit.startingModels, startingWounds: unit.stats?.wounds,
      modelsDestroyed: 0, enemyPointsDestroyed: 0, kills: 0, destroyedEnemies: [], damageDealt: null, damagePartial: true,
      modelsLost: 0, remainingModels: unit.startingModels, remainingWounds: unit.startingModels === 1 ? unit.stats?.wounds : undefined,
      survived: true, completedMissionActions: 0, missionVp: null, combatRoi: null,
    }))
  })
  const byKey = new Map(units.map((unit) => [performanceKey(unit.playerId, unit.unitId), unit]))
  const credits = new Map<string, Credit[]>()
  const wounds = new Map<string, Credit[]>()
  const kills = new Map<string, { attackerPlayerId?: string; attackerUnitId?: string; round: number }>()
  const missions = new Map<string, MissionCredit>()
  const starts: Array<{ id: string; playerId: string; cardId: string; turnKey: string; target: string; unit: UnitReference }> = []
  const scoredMissionEvents = new Set<string>()
  const correctedScores = new Set<string>()

  function retract(batches: Credit[], requested: number): void {
    let remaining = requested
    for (let index = batches.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const batch = batches[index]
      const restored = Math.min(batch.count, remaining)
      batch.count -= restored
      remaining -= restored
    }
  }

  function resolveMissionUnit(playerId: string, value: string): UnitReference | undefined {
    const exact = byKey.get(performanceKey(playerId, value))
    if (exact) return exact
    const matches = units.filter((unit) => unit.playerId === playerId && unit.name === value)
    return matches.length === 1 ? matches[0] : undefined
  }

  for (const entry of chronicle) {
    const event = entry.event
    const change = entry.unitChange
    if (change) {
      const key = performanceKey(change.target.playerId, change.target.unitId)
      const target = byKey.get(key)
      if (target) {
        const attackerPlayerId = !change.correction && change.attackerPlayerId !== target.playerId
          && session.state.players[change.attackerPlayerId ?? ''] ? change.attackerPlayerId : undefined
        const attackerUnitId = attackerPlayerId && change.attacker && byKey.has(performanceKey(attackerPlayerId, change.attacker.unitId))
          ? change.attacker.unitId : undefined
        const lost = change.modelsBefore - change.modelsAfter
        const batches = credits.get(key) ?? []
        if (lost > 0) batches.push({ count: lost, attackerPlayerId, attackerUnitId })
        else if (lost < 0) retract(batches, -lost)
        credits.set(key, batches)
        if (!change.destroyedAfter) kills.delete(key)
        else if (!change.destroyedBefore) kills.set(key, { attackerPlayerId, attackerUnitId, round: entry.round })

        const damageBatches = wounds.get(key) ?? []
        if (target.startingModels === 1 && typeof change.woundsBefore === 'number' && typeof change.woundsAfter === 'number') {
          const damage = change.woundsBefore - change.woundsAfter
          if (event.type === 'UNIT_WOUNDS_CHANGED' && damage > 0) damageBatches.push({ count: damage, attackerPlayerId, attackerUnitId })
          // A host correction fixes a mistaken wound entry; healing is real history.
          if (change.correction && damage < 0) retract(damageBatches, -damage)
        }
        wounds.set(key, damageBatches)
        target.remainingModels = change.modelsAfter
        target.remainingWounds = target.startingModels === 1 ? change.woundsAfter : undefined
        target.modelsLost = Math.max(0, target.startingModels - change.modelsAfter)
        target.survived = !change.destroyedAfter
        if (!change.destroyedAfter) target.destructionRound = undefined
        else if (!change.destroyedBefore) target.destructionRound = entry.round
      }
    }

    if (entry.missionAction) {
      const action = entry.missionAction
      if (event.type === 'MISSION_ACTION_STARTED') missions.set(action.id, { unit: battleUnit(session, action.playerId, action.unitId), completed: false })
      if (event.type === 'MISSION_ACTION_COMPLETED') missions.set(action.id, { unit: battleUnit(session, action.playerId, action.unitId), completed: true })
      if (event.type === 'MISSION_ACTION_CANCELLED' || event.type === 'MISSION_ACTION_FAILED') missions.set(action.id, { unit: battleUnit(session, action.playerId, action.unitId), completed: false })
    }

    if (event.type === 'STATE_CORRECTED' && event.payload.correction.kind === 'SCORE') correctedScores.add(event.payload.correction.playerId)
    if (event.type !== 'RULESET_EVENT') continue
    const data = rulesetData(event)
    if (event.payload.action === 'SECONDARY_OFFICIAL_ACTION_STARTED' && typeof data.playerId === 'string'
      && typeof data.unit === 'string' && typeof data.cardId === 'string' && typeof data.turnKey === 'string') {
      const unit = resolveMissionUnit(data.playerId, data.unit)
      if (!unit) continue
      starts.push({ id: event.id, playerId: data.playerId, unit, cardId: data.cardId, turnKey: data.turnKey, target: typeof data.target === 'string' ? data.target : '' })
      // Plunder explicitly completes immediately; Cleanse needs a later confirmation.
      missions.set(event.id, { unit, completed: data.cardId === 'OFFICIAL_PLUNDER' })
    }
    if ((event.payload.action === 'SECONDARY_COMPLETED' || event.payload.action === 'SECONDARY_FIXED_SCORED')
      && typeof data.pointsAwarded === 'number' && data.pointsAwarded > 0 && typeof data.playerId === 'string') {
      const confirmation = data.confirmation && typeof data.confirmation === 'object' ? data.confirmation as Record<string, unknown> : {}
      const objectiveIds = Array.isArray(confirmation.completedCleanseObjectiveIds) ? confirmation.completedCleanseObjectiveIds : []
      const matching = starts.filter((start) => start.playerId === data.playerId && start.cardId === data.cardId && start.turnKey === data.turnKey
        && (start.cardId === 'OFFICIAL_PLUNDER' || objectiveIds.includes(start.target)))
      for (const start of matching) missions.set(start.id, { unit: start.unit, completed: true })
      // Never split a shared award between multiple units by guessing.
      if (matching.length === 1 && !scoredMissionEvents.has(event.id)) {
        scoredMissionEvents.add(event.id)
        const performer = byKey.get(performanceKey(matching[0].playerId, matching[0].unit.unitId))!
        performer.missionVp = (performer.missionVp ?? 0) + data.pointsAwarded
      }
    }
  }

  const armies = session.setup.players.map((player): ArmyPerformance => ({
    playerId: player.id, startingPoints: units.filter((unit) => unit.playerId === player.id).reduce((sum, unit) => sum + unit.startingPoints, 0),
    enemyPointsDestroyed: 0, ownPointsLost: 0, kills: 0, playerOnlyPoints: 0,
  }))
  const armyById = new Map(armies.map((army) => [army.playerId, army]))
  let unattributedPoints = 0
  for (const [key, batches] of credits) {
    const target = byKey.get(key)!
    for (const batch of batches) {
      if (batch.count <= 0) continue
      const points = valuePerModel(target) * batch.count
      const army = armyById.get(batch.attackerPlayerId ?? '')
      if (!army) { unattributedPoints += points; continue }
      army.enemyPointsDestroyed += points
      const performer = byKey.get(performanceKey(army.playerId, batch.attackerUnitId ?? ''))
      if (!performer) { army.playerOnlyPoints += points; continue }
      performer.modelsDestroyed += batch.count
      performer.enemyPointsDestroyed += points
    }
  }
  for (const [key, kill] of kills) {
    const army = armyById.get(kill.attackerPlayerId ?? '')
    if (army) army.kills += 1
    const performer = byKey.get(performanceKey(kill.attackerPlayerId ?? '', kill.attackerUnitId ?? ''))
    if (performer) {
      performer.kills += 1
      const target = byKey.get(key)!
      performer.destroyedEnemies.push({ playerId: target.playerId, unitId: target.unitId, name: target.name, round: kill.round })
    }
  }
  for (const batches of wounds.values()) for (const batch of batches) {
    const performer = byKey.get(performanceKey(batch.attackerPlayerId ?? '', batch.attackerUnitId ?? ''))
    if (performer && batch.count > 0) performer.damageDealt = (performer.damageDealt ?? 0) + batch.count
  }
  for (const mission of missions.values()) {
    const performer = byKey.get(performanceKey(mission.unit.playerId, mission.unit.unitId))
    if (performer && mission.completed) performer.completedMissionActions += 1
  }
  for (const unit of units) {
    unit.combatRoi = unit.startingPoints > 0 ? unit.enemyPointsDestroyed / unit.startingPoints * 100 : null
    if (correctedScores.has(unit.playerId)) unit.missionVp = null
    armyById.get(unit.playerId)!.ownPointsLost += unit.modelsLost * valuePerModel(unit)
  }
  return {
    units, armies, awards: session.state.status === 'completed' ? unitAwards(units) : [], unattributedPoints,
    partial: unattributedPoints > 0 || armies.some((army) => army.playerOnlyPoints > 0),
  }
}

function unitAwards(units: UnitPerformance[]): UnitAward[] {
  const awards: UnitAward[] = []
  function award(title: UnitAward['title'], rule: string, eligible: UnitPerformance[], value: (unit: UnitPerformance) => number): void {
    const maximum = Math.max(0, ...eligible.map(value))
    if (maximum <= 0) return
    awards.push({ title, rule, winners: eligible.filter((unit) => Math.abs(value(unit) - maximum) < 1e-8)
      .map(({ playerId, unitId, name }) => ({ playerId, unitId, name })) })
  }
  award('Executioner', 'Most net enemy model points destroyed; tied units share the award.', units, (unit) => unit.enemyPointsDestroyed)
  award('Objective Hero', 'Most explicitly completed Mission Actions; tied units share the award.', units, (unit) => unit.completedMissionActions)
  award('Last Stand', 'Survived with model/wound losses and recorded combat contribution; most net enemy points, ties shared.',
    units.filter((unit) => unit.survived && (unit.modelsLost > 0 || (unit.startingModels === 1 && typeof unit.remainingWounds === 'number'
      && unit.remainingWounds < (unit.startingWounds ?? unit.remainingWounds)))), (unit) => unit.enemyPointsDestroyed)
  return awards
}
