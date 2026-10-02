import type { BattleSession, ObjectiveState } from '../../domain/battle/types'
import { CAULDRON_PRIMARY_CAP, CAULDRON_PRIMARY_ROUND_CAP } from './constants'
import { getCauldronEventData } from './events'
import { getCurrentRivalPlayerId } from './rivalRotation'
import { getCauldronConfig } from './sessionConfig'
import { getCauldronTurnStartSnapshot } from './snapshots'
import type {
  CauldronTurnSnapshot, OfficialPrimaryAction, OfficialPrimaryConfirmation, OfficialPrimaryId, OfficialPrimaryReview, PrimaryCondition,
} from './types'

export const OFFICIAL_PRIMARY_MISSIONS: Record<OfficialPrimaryId, { name: string; description: string; url: string; rules: string[] }> = {
  'battlefield-dominance': {
    name: 'Battlefield Dominance', description: 'Hold objectives and your HOME; lead your current Rival in rounds 1–2.',
    url: 'https://gdmissions.app/11th/primary-missions/take-and-hold/battlefield-dominance',
    rules: ['Rounds 1–2: 2 VP at turn end if you control more objectives than your current Rival.', 'From round 2: 3 VP per controlled objective at the Command check. Add 2 VP per non-home objective if you control your HOME.'],
  },
  meatgrinder: {
    name: 'Meatgrinder', description: 'Destroy current Rival units, hold non-home objectives and seize the Rival HOME.',
    url: 'https://gdmissions.app/11th/primary-missions/purge-the-foe/meatgrinder',
    rules: ['Every round: 3 VP at turn end if any current Rival unit was destroyed.', 'From round 2: 4 VP for a non-home objective at Command; 5 VP if current Rival units destroyed this turn exceed your losses caused by that Rival since your previous turn; 5 VP for controlling the current Rival HOME at turn end.'],
  },
  'gather-intel': {
    name: 'Gather Intel', description: 'Hold CENTER and complete Extract Intelligence actions to place operation markers.',
    url: 'https://gdmissions.app/11th/primary-missions/reconnaissance/gather-intel',
    rules: ['Round 1: 6 VP for controlling CENTER at turn end.', 'From round 2: 4 VP for a non-home objective at Command; 7 VP per completed Extract Intelligence action on a distinct controlled non-home objective.', 'At battle end: 5 VP for three operation markers, plus 5 VP if one is at your round 5 Rival HOME.'],
  },
  sabotage: {
    name: 'Sabotage', description: 'Complete Sabotage actions on controlled objectives; score more in current Rival territory.',
    url: 'https://gdmissions.app/11th/primary-missions/priority-assets/sabotage',
    rules: ['Every round: 3 VP per completed Sabotage action on a distinct controlled non-home objective. Add 2 VP if that objective lies in your current Rival territory.', 'From round 2: 4 VP for controlling a non-home objective at the Command check.'],
  },
  outmanoeuvre: {
    name: 'Outmanoeuvre', description: 'Hold non-home objectives and seize the current Rival HOME.',
    url: 'https://gdmissions.app/11th/primary-missions/disruption/outmanoeuvre',
    rules: ['Every round: 10 VP for controlling your current Rival HOME at turn end.', 'Non-home objectives: 4 VP each at the end of round 1; 5 VP each at Command in rounds 2–3; 6 VP each at turn end in rounds 4–5.'],
  },
}

export const OFFICIAL_PRIMARY_IDS = Object.keys(OFFICIAL_PRIMARY_MISSIONS) as OfficialPrimaryId[]

export function isOfficialPrimary(session: BattleSession): boolean {
  return getCauldronConfig(session).primaryDeck === 'chapter-approved-ffa'
}

export function getOfficialPrimaryId(session: BattleSession, playerId: string): OfficialPrimaryId {
  const id = getCauldronConfig(session).playerConfigs[playerId]?.officialPrimaryId
  if (!id || !OFFICIAL_PRIMARY_MISSIONS[id]) throw new Error(`No 11th edition Primary selected for ${playerId}.`)
  return id
}

export function getOfficialPrimaryRival(session: BattleSession, playerId: string, round = session.state.round) {
  const rivalPlayerId = getCurrentRivalPlayerId(session, playerId, round)
  const rivalZone = getCauldronConfig(session).playerConfigs[rivalPlayerId].deploymentZone
  return {
    playerId: rivalPlayerId,
    name: session.state.players[rivalPlayerId]?.name ?? rivalPlayerId,
    homeObjectiveId: `${rivalZone}-HOME`,
  }
}

type MarkerEvent = { playerId: string; objectiveIds: string[]; round: number }

export function getOfficialPrimaryMarkers(session: BattleSession, playerId: string): string[] {
  return [...new Set(getCauldronEventData<MarkerEvent>(session, 'PRIMARY_11TH_MARKERS_PLACED')
    .filter((entry) => entry.playerId === playerId).flatMap((entry) => entry.objectiveIds))]
}

function ownHome(objective: ObjectiveState, ownZone?: string): boolean {
  return objective.type === 'home' && objective.id === `${ownZone}-HOME`
}

export function officialPrimaryActionTargets(session: BattleSession, playerId: string): ObjectiveState[] {
  const ownZone = getCauldronConfig(session).playerConfigs[playerId]?.deploymentZone
  const marked = new Set(getOfficialPrimaryMarkers(session, playerId))
  const gather = getOfficialPrimaryId(session, playerId) === 'gather-intel'
  return Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === playerId
    && !ownHome(objective, ownZone) && (!gather || !marked.has(objective.id)))
}

function checkedActions(
  session: BattleSession,
  playerId: string,
  missionId: OfficialPrimaryId,
  round: number,
  actions: OfficialPrimaryAction[],
  strict: boolean,
): OfficialPrimaryAction[] {
  if (actions.length === 0) return []
  if (missionId !== 'gather-intel' && missionId !== 'sabotage') throw new Error('This Primary has no Objective Action.')
  if (missionId === 'gather-intel' && round < 2) throw new Error('Extract Intelligence starts in round 2.')
  const targets = new Set(officialPrimaryActionTargets(session, playerId).map((objective) => objective.id))
  const targetIds = actions.map((action) => action.objectiveId)
  const unitNames = actions.map((action) => action.unitName.trim().toLocaleLowerCase())
  const validTargets = targetIds.every((id) => targets.has(id)) && new Set(targetIds).size === actions.length
  const validUnits = unitNames.every(Boolean) && new Set(unitNames).size === actions.length
  if (strict && !validTargets) throw new Error('Each completed Primary action needs a different controlled non-home objective without an existing marker.')
  if (strict && !validUnits) throw new Error('Enter a different acting unit for each completed Primary action.')
  if (!validTargets || !validUnits) return []
  return actions
}

export function evaluateOfficialPrimary(
  session: BattleSession,
  playerId: string,
  round = session.state.round,
  confirmation: OfficialPrimaryConfirmation = {},
  strict = false,
): { review: OfficialPrimaryReview; roundPrimary: number; capped: boolean } {
  const missionId = getOfficialPrimaryId(session, playerId)
  const missionName = OFFICIAL_PRIMARY_MISSIONS[missionId].name
  const conditions: PrimaryCondition[] = []
  const rival = getOfficialPrimaryRival(session, playerId, round)
  // Keep older unscoped confirmations readable; new inputs bind physical checks to
  // this round's Rival so a stale confirmation cannot award points after rotation.
  const wrongRival = confirmation.rivalPlayerId !== undefined && confirmation.rivalPlayerId !== rival.playerId
  if (wrongRival && strict) throw new Error(`Confirm Primary against the current Rival, ${rival.name}, for round ${round}.`)
  const rivalConfirmation = wrongRival ? {} : confirmation
  const ownZone = getCauldronConfig(session).playerConfigs[playerId]?.deploymentZone
  const current = Object.values(session.state.objectives)
  // The Command check is recorded when leaving Command. Round 5 uses turn-end
  // control instead. The turn-start snapshot is a fallback for old/incomplete logs.
  const snapshot = round === 5 ? undefined : (
    getCauldronEventData<CauldronTurnSnapshot>(session, 'PRIMARY_11TH_COMMAND_SNAPSHOT')
      .find((entry) => entry.playerId === playerId && entry.round === round)
      ?? getCauldronTurnStartSnapshot(session, playerId, round)
  )
  const commandOwner = (objective: ObjectiveState) => snapshot
    ? snapshot.objectiveStates[objective.id]?.controllerPlayerId : objective.controllerPlayerId
  const own = current.filter((objective) => objective.controllerPlayerId === playerId)
  const commandOwn = current.filter((objective) => commandOwner(objective) === playerId)
  const ownNonHome = own.filter((objective) => !ownHome(objective, ownZone))
  const commandNonHome = commandOwn.filter((objective) => !ownHome(objective, ownZone))
  const rivalHome = own.some((objective) => objective.type === 'home' && objective.id === rival.homeObjectiveId)
  const leadsRival = own.length > current.filter((objective) => objective.controllerPlayerId === rival.playerId).length
  const add = (label: string, vp: number, completed = vp > 0) => conditions.push({ label, vp: completed ? vp : 0, completed })
  const actions = checkedActions(session, playerId, missionId, round, rivalConfirmation.actions ?? [], strict)
  let operationMarkerObjectiveIds: string[] = []

  if (missionId === 'battlefield-dominance') {
    if (round <= 2) add(`More objectives than current Rival (${rival.name}) · end of turn`, 2, leadsRival)
    if (round >= 2) {
      add('Objectives controlled · Command phase' + (round === 5 ? ' / final turn' : ''), commandOwn.length * 3)
      add('Non-home objectives while your HOME is controlled · cumulative',
        commandNonHome.length * 2, commandOwn.some((objective) => ownHome(objective, ownZone)))
    }
  } else if (missionId === 'meatgrinder') {
    const kills = rivalConfirmation.enemyUnitsDestroyedThisTurn ?? 0
    const losses = rivalConfirmation.friendlyUnitsDestroyedSinceLastTurn ?? 0
    if (![kills, losses].every((count) => Number.isSafeInteger(count) && count >= 0)) throw new Error('Unit counts must be whole non-negative numbers.')
    add(`One or more current Rival (${rival.name}) units destroyed this turn`, 3, kills > 0)
    if (round >= 2) {
      add('Control a non-home objective · Command phase', 4, commandNonHome.length > 0)
      add('Current Rival units destroyed this turn > own units lost to that Rival since your previous turn', 5, kills > losses)
      add(`Control current Rival HOME (${rival.homeObjectiveId}) · end of turn`, 5, rivalHome)
    }
  } else if (missionId === 'gather-intel') {
    if (round === 1) add('Control CENTER · first round end of turn', 6,
      own.some((objective) => objective.id === 'CENTER'))
    if (round >= 2) {
      add('Control a non-home objective · Command phase', 4, commandNonHome.length > 0)
      for (const action of actions) add(`Extract Intelligence · ${action.objectiveId} (${action.unitName.trim()})`, 7)
      operationMarkerObjectiveIds = actions.map((action) => action.objectiveId)
    }
    if (round === 5) {
      const markers = new Set([...getOfficialPrimaryMarkers(session, playerId), ...operationMarkerObjectiveIds])
      add('Three operation markers · end of battle', 5, markers.size >= 3)
      add(`Marker at round 5 Rival HOME (${rival.homeObjectiveId}) · end of battle`, 5,
        markers.has(rival.homeObjectiveId))
    }
  } else if (missionId === 'sabotage') {
    for (const action of actions) {
      add(`Sabotage · ${action.objectiveId} (${action.unitName.trim()})`, 3)
      const objective = session.state.objectives[action.objectiveId]
      const inRivalTerritory = objective.id === rival.homeObjectiveId
        || (objective.type !== 'home' && action.enemyTerritory)
      if (inRivalTerritory) add(`Current Rival territory (${rival.name}) · ${action.objectiveId} · cumulative`, 2)
    }
    if (round >= 2) add('Control a non-home objective · Command phase', 4, commandNonHome.length > 0)
  } else if (missionId === 'outmanoeuvre') {
    add(`Control current Rival HOME (${rival.homeObjectiveId}) · end of turn`, 10, rivalHome)
    if (round === 1) add('Non-home objectives · first round end of turn', ownNonHome.length * 4)
    else if (round <= 3) add('Non-home objectives · Command phase', commandNonHome.length * 5)
    else add('Non-home objectives · end of turn', ownNonHome.length * 6)
  }

  const raw = round >= 1 && round <= 5 ? conditions.reduce((sum, condition) => sum + condition.vp, 0) : 0
  const remainingRound = CAULDRON_PRIMARY_ROUND_CAP
  const remainingGame = Math.max(0, CAULDRON_PRIMARY_CAP - (session.state.players[playerId]?.score.primary ?? 0))
  const roundPrimary = Math.min(raw, remainingRound, remainingGame)
  return {
    review: { missionId, missionName, rivalPlayerId: rival.playerId, conditions, operationMarkerObjectiveIds },
    roundPrimary, capped: roundPrimary < raw,
  }
}
