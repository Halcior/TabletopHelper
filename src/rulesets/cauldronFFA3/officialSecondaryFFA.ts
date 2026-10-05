import type { UnitDefinition } from '../../domain/army/types'
import type { BattleSession } from '../../domain/battle/types'
import { getUnitDefinition } from '../../domain/battle/missionActions'
import { getCauldronEventData } from './events'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { getSecondaryState, isOfficialSecondary } from './secondary'
import { secondaryStrategyFor } from './sessionConfig'
import type { OfficialSecondaryConfirmation, OfficialSecondaryId } from './secondaryTypes'

export function isOfficialFfa(session: BattleSession): boolean {
  return isOfficialSecondary(session) && session.setup.players.length === 3
}

export function getOfficialSecondaryRival(session: BattleSession, playerId: string, cardId: OfficialSecondaryId): string {
  return getSecondaryState(session)[playerId]?.active.find((card) => card.cardId === cardId)?.secondaryRivalPlayerId
    ?? getCurrentRivalPlayerId(session, playerId)
}

export function officialPlayerUnits(session: BattleSession, playerId: string): UnitDefinition[] {
  const armyId = session.setup.players.find((player) => player.id === playerId)?.armyId
  return armyId ? session.setup.armies[armyId]?.units ?? [] : []
}

export function officialHomeId(session: BattleSession, playerId: string): string {
  return `${session.setup.players.find((player) => player.id === playerId)?.deploymentZone}-HOME`
}

export function officialPairwiseNeutral(session: BattleSession, playerId: string, rivalId: string): string | undefined {
  const pair = [playerId, rivalId].map((id) => session.setup.players.find((player) => player.id === id)?.deploymentZone).sort().join('')
  const named = `${pair}-NEUTRAL`
  // Keep the objective IDs in existing saves; display the pairwise names alongside them.
  const legacy = ({ AB: 'N1', AC: 'N2', BC: 'N3' } as Record<string, string>)[pair]
  return session.state.objectives[named] ? named : session.state.objectives[legacy] ? legacy : undefined
}

export function officialTemptingTargets(session: BattleSession, playerId: string): string[] {
  const rivalId = getOfficialSecondaryRival(session, playerId, 'OFFICIAL_A_TEMPTING_TARGET')
  if (!isOfficialFfa(session)) return session.setup.objectives.filter((objective) => objective.type === 'neutral').map((objective) => objective.id)
  return [officialPairwiseNeutral(session, playerId, rivalId), session.state.objectives.CENTER ? 'CENTER' : undefined]
    .filter((id): id is string => Boolean(id))
}

export function officialNmlObjectives(session: BattleSession): string[] {
  return session.setup.objectives.filter((objective) => objective.type === 'neutral').map((objective) => objective.id)
}

export function officialHasTrait(unit: UnitDefinition, trait: string): boolean {
  return [...unit.categories, ...unit.keywords].some((value) => value.toUpperCase() === trait)
}

export type OfficialKill = {
  eventId: string
  killerPlayerId?: string
  targetPlayerId: string
  unitId: string
  round: number
  turnPlayerId: string
  modelsDestroyed: number
  unitDestroyed: boolean
}

/** Replay only model counts: partial kills count for model cards, the last model for unit cards. */
export function officialKillLedger(session: BattleSession): OfficialKill[] {
  const alive = new Map<string, number>()
  for (const player of session.setup.players) {
    for (const unit of officialPlayerUnits(session, player.id)) alive.set(`${player.id}:${unit.id}`, unit.startingModels)
  }
  const kills: OfficialKill[] = []
  let round = 1
  let turnPlayerId = session.setup.turnOrder[0]
  for (const event of session.state.events) {
    if (event.type === 'ROUND_STARTED') round = event.payload.round
    if (event.type === 'TURN_STARTED') turnPlayerId = event.payload.playerId
    if (event.type === 'STATE_CORRECTED') {
      const change = event.payload.correction
      if (change.kind === 'UNIT_MODELS') {
        const definition = getUnitDefinition(session, change.playerId, change.unitId)
        alive.set(`${change.playerId}:${change.unitId}`, Math.max(0, Math.min(definition?.startingModels ?? change.value, Math.floor(change.value))))
      }
      if (change.kind === 'UNIT_WOUNDS' && getUnitDefinition(session, change.playerId, change.unitId)?.startingModels === 1) {
        alive.set(`${change.playerId}:${change.unitId}`, change.value > 0 ? 1 : 0)
      }
      continue
    }
    if (event.type === 'UNIT_MODEL_RESTORED') {
      const key = `${event.payload.playerId}:${event.payload.unitId}`
      const maximum = getUnitDefinition(session, event.payload.playerId, event.payload.unitId)?.startingModels ?? 0
      alive.set(key, Math.min(maximum, (alive.get(key) ?? 0) + Math.max(1, event.payload.amount)))
      continue
    }
    if (event.type !== 'UNIT_DESTROYED' && event.type !== 'UNIT_MODEL_DESTROYED' && event.type !== 'UNIT_WOUNDS_CHANGED') continue
    const key = `${event.payload.playerId}:${event.payload.unitId}`
    const before = alive.get(key) ?? 0
    let lost = 0
    if (event.type === 'UNIT_DESTROYED') lost = before
    if (event.type === 'UNIT_MODEL_DESTROYED') lost = Math.min(before, Math.max(1, event.payload.amount))
    if (event.type === 'UNIT_WOUNDS_CHANGED') {
      if (getUnitDefinition(session, event.payload.playerId, event.payload.unitId)?.startingModels !== 1) continue
      if (event.payload.woundsRemaining > 0) { alive.set(key, 1); continue }
      lost = before
    }
    alive.set(key, before - lost)
    if (lost > 0) kills.push({
      eventId: event.id, killerPlayerId: event.payload.destroyedByPlayerId ?? undefined,
      targetPlayerId: event.payload.playerId, unitId: event.payload.unitId,
      round, turnPlayerId, modelsDestroyed: lost, unitDestroyed: before - lost === 0,
    })
  }
  return kills
}

export function officialRivalKills(session: BattleSession, playerId: string, cardId: OfficialSecondaryId, thisTurn = true): OfficialKill[] {
  const rivalId = getOfficialSecondaryRival(session, playerId, cardId)
  return officialKillLedger(session).filter((kill) => kill.killerPlayerId === playerId && kill.targetPlayerId === rivalId
    && (!thisTurn || (kill.round === session.state.round && kill.turnPlayerId === session.state.activePlayerId)))
}

export function officialFfaAwards(session: BattleSession, playerId: string, cardId: OfficialSecondaryId, input: OfficialSecondaryConfirmation): number[] {
  const card = getSecondaryState(session)[playerId]?.active.find((entry) => entry.cardId === cardId)
  if (!card) return []
  const rivalId = getOfficialSecondaryRival(session, playerId, cardId)
  if (input.secondaryRivalPlayerId && input.secondaryRivalPlayerId !== rivalId) return []
  const enemies = session.setup.players.filter((player) => player.id !== playerId)
  const specific = card.cardSpecificState
  const fixed = secondaryStrategyFor(session, playerId) === 'fixed'
  const controlled = (id?: string) => Boolean(id && session.state.objectives[id]?.controllerPlayerId === playerId)
  const awards = (points: number) => points > 0 ? [Math.min(fixed ? 20 : 5, points)] : []
  const kills = () => officialRivalKills(session, playerId, cardId)
  switch (cardId) {
    case 'OFFICIAL_A_GRIEVOUS_BLOW': {
      const count = kills().filter((kill) => kill.unitDestroyed && (getUnitDefinition(session, rivalId, kill.unitId)?.startingModels ?? 0) >= 13).length
      return awards(fixed ? count * 4 : count ? 5 : 0)
    }
    case 'OFFICIAL_BRING_IT_DOWN': {
      const count = kills().reduce((total, kill) => total + ((getUnitDefinition(session, rivalId, kill.unitId)?.stats?.wounds ?? 0) >= 10 ? kill.modelsDestroyed : 0), 0)
      return awards(fixed ? count * 4 : count ? 5 : 0)
    }
    case 'OFFICIAL_ASSASSINATION': {
      const characters = officialPlayerUnits(session, rivalId).filter((unit) => officialHasTrait(unit, 'CHARACTER'))
      const characterKills = kills().filter((kill) => characters.some((unit) => unit.id === kill.unitId))
      if (fixed) return awards(characterKills.reduce((total, kill) => total + kill.modelsDestroyed * (3 + ((getUnitDefinition(session, rivalId, kill.unitId)?.stats?.wounds ?? 0) >= 4 ? 1 : 0)), 0))
      const allKills = officialRivalKills(session, playerId, cardId, false)
      const allByOwner = characters.length > 0 && characters.every((unit) => session.state.players[rivalId].units[unit.id]?.destroyed
        && allKills.filter((kill) => kill.unitId === unit.id).reduce((count, kill) => count + kill.modelsDestroyed, 0) >= unit.startingModels)
      return characterKills.length || allByOwner ? [5] : []
    }
    case 'OFFICIAL_NO_PRISONERS': return awards(kills().filter((kill) => kill.unitDestroyed).length * 2)
    case 'OFFICIAL_OVERWHELMING_FORCE': return awards(kills().filter((kill) => kill.unitDestroyed && input.overwhelmingForceUnitIds?.includes(kill.unitId)).length * 3)
    case 'OFFICIAL_A_TEMPTING_TARGET': return controlled(specific?.officialTargetObjectiveId ?? specific?.lastConfirmation) ? [5] : []
    case 'OFFICIAL_FORWARD_POSITION': {
      return controlled(officialHomeId(session, rivalId)) || (controlled(officialPairwiseNeutral(session, playerId, rivalId)) && controlled('CENTER')) ? [5] : []
    }
    case 'OFFICIAL_SECURE_NO_MANS_LAND': return officialNmlObjectives(session).filter(controlled).length >= 2 ? [5] : []
    case 'OFFICIAL_BEACON': {
      const selected = specific?.officialTargetUnitId ?? officialPlayerUnits(session, playerId).find((unit) => unit.name === specific?.lastConfirmation)?.id
      const unit = selected ? session.state.players[playerId].units[selected] : undefined
      if (!unit || unit.destroyed || unit.inReserve) return []
      return input.unitWhollyOutsideOwnTerritory ? [5] : input.beaconOutsideOwnDeployment ? [3] : []
    }
    case 'OFFICIAL_BURDEN_OF_TRUST': {
      const count = Object.entries(specific?.officialGuardAssignments ?? {}).filter(([objectiveId, unitId]) => controlled(objectiveId)
        && !session.state.players[playerId].units[unitId]?.destroyed && !session.state.players[playerId].units[unitId]?.inReserve
        && input.guardingObjectiveIdsInRange?.includes(objectiveId)).length
      return awards(count * 2)
    }
    case 'OFFICIAL_CENTRE_GROUND': {
      if (!input.ownUnitWithin3OfCenter || !enemies.every((enemy) => input.enemyCenterDistanceByPlayer?.[enemy.id])) return []
      if (enemies.some((enemy) => input.enemyCenterDistanceByPlayer?.[enemy.id] === 'within-3')) return []
      return [enemies.every((enemy) => input.enemyCenterDistanceByPlayer?.[enemy.id] === 'outside-6') ? 5 : 3]
    }
    case 'OFFICIAL_DEFEND_STRONGHOLD': {
      if (!controlled(officialHomeId(session, playerId))) return []
      return [enemies.every((enemy) => input.enemyInOwnDeploymentByPlayer?.[enemy.id] === false) ? 5 : 3]
    }
    case 'OFFICIAL_DISPLAY_OF_MIGHT': {
      const counts = input.qualifyingNmlUnitsByPlayer
      if (!session.setup.players.every((player) => Number.isInteger(counts?.[player.id]) && counts![player.id] >= 0)) return []
      return counts![playerId] > Math.max(...enemies.map((enemy) => counts![enemy.id])) ? [session.state.activePlayerId === playerId ? 2 : 5] : []
    }
    case 'OFFICIAL_BEHIND_ENEMY_LINES': return awards(Math.max(0, Math.floor(input.behindEnemyLinesUnitCount ?? 0)) * 3)
    case 'OFFICIAL_OUTFLANK': return input.unitWhollyOutsideOwnTerritory && input.outflankUnitNearEdge ? [input.outflankOppositeEdges ? 5 : 3] : []
    case 'OFFICIAL_ENGAGE_ON_ALL_FRONTS': return input.qualifyingQuarterCount === 4 ? [fixed ? 4 : 5] : input.qualifyingQuarterCount === 3 ? [fixed ? 2 : 3] : []
    case 'OFFICIAL_CLEANSE': {
      const count = getCauldronEventData<{ playerId: string; cardId: string; turnKey: string; target: string; unit: string }>(session, 'SECONDARY_OFFICIAL_ACTION_STARTED')
        .filter((action) => action.playerId === playerId && action.cardId === cardId && action.turnKey === `${session.state.round}:${session.state.activePlayerId}`
          && controlled(action.target) && input.completedCleanseObjectiveIds?.includes(action.target)
          && !session.state.players[playerId].units[action.unit]?.destroyed && !session.state.players[playerId].units[action.unit]?.inReserve
          && !session.state.players[playerId].units[action.unit]?.battleShocked).length
      return count >= 2 ? [5] : count === 1 ? [2] : []
    }
    case 'OFFICIAL_PLUNDER': return getCauldronEventData<{ playerId: string; cardId: string; turnKey: string; terrainWhollyOutsideOwnTerritory?: boolean }>(session, 'SECONDARY_OFFICIAL_ACTION_STARTED')
      .some((action) => action.playerId === playerId && action.cardId === cardId && action.turnKey === `${session.state.round}:${session.state.activePlayerId}` && action.terrainWhollyOutsideOwnTerritory === true) ? [5] : []
  }
}
