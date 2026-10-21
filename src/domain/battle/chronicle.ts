import { totalCombatWounds } from './combatState'
import { doublesScorekeeperId } from './doubles'
import { visitBattleHistory } from './engine'
import { describeBattleEvent } from './eventLog'
import type { BattleEvent, BattlePhase, BattleSession, GameState, MissionActionState } from './types'

export type ChronicleCategory = 'kills' | 'combat' | 'objectives' | 'vp' | 'actions' | 'stratagems' | 'flow' | 'other'
export type UnitReference = { playerId: string; unitId: string; name: string }
export type UnitChange = {
  target: UnitReference
  attacker?: UnitReference
  attackerPlayerId?: string
  modelsBefore: number
  modelsAfter: number
  woundsBefore?: number
  woundsAfter?: number
  totalWoundsBefore?: number
  totalWoundsAfter?: number
  currentModelWoundsAfter?: number
  effectiveWoundsLost?: number
  woundsHealed?: number
  destroyedBefore: boolean
  destroyedAfter: boolean
  correction: boolean
}
export type ChronicleEntry = {
  id: string
  event: BattleEvent
  round: number
  phase: BattlePhase
  turnPlayerId: string
  playerIds: string[]
  category: ChronicleCategory
  highlight: boolean
  description: string
  note?: string
  unitChange?: UnitChange
  missionAction?: MissionActionState
  missionWasActive?: boolean
  scoreDelta?: number
  scorePlayerId?: string
  objectiveId?: string
  objectiveName?: string
  objectiveControllerPlayerId?: string | null
}

export function battleUnit(session: BattleSession, playerId: string, unitId: string): UnitReference {
  const armyId = session.setup.players.find((player) => player.id === playerId)?.armyId
  const definition = armyId ? session.setup.armies[armyId]?.units.find((unit) => unit.id === unitId) : undefined
  return { playerId, unitId, name: definition?.name ?? unitId }
}

export function rulesetData(event: BattleEvent): Record<string, unknown> {
  return event.type === 'RULESET_EVENT' && event.payload.data && typeof event.payload.data === 'object'
    ? event.payload.data as Record<string, unknown> : {}
}

function label(value: string): string {
  return value.replace(/^OFFICIAL_/, '').replaceAll('_', ' ').toLowerCase().replace(/^./, (first) => first.toUpperCase())
}

function scoreLabel(event: BattleEvent, sources: Map<string, string>): string {
  return sources.get(event.actionId) ?? (event.type === 'SCORE_ADJUSTED' ? label(event.payload.category) : 'Score')
}

/** Derived timeline, never a second persisted event log. Event order supplies timing. */
export function buildBattleChronicle(session: BattleSession): ChronicleEntry[] {
  const entries: ChronicleEntry[] = []
  const sources = new Map<string, string>()
  for (const event of session.state.events) {
    if (event.type !== 'RULESET_EVENT') continue
    const data = rulesetData(event)
    if (typeof data.cardId === 'string' && /SCORED|COMPLETED/.test(event.payload.action)) sources.set(event.actionId, label(data.cardId))
    if (/PRIMARY.*COMMITTED|DUEL.*COMMITTED/.test(event.payload.action)) sources.set(event.actionId, 'Primary')
  }
  let pending: ChronicleEntry
  let objectiveBefore: string | null | undefined
  let scoreBefore = 0
  let scoreCategory: keyof GameState['players'][string]['score'] | undefined

  visitBattleHistory(session, {
    before(event, state) {
      pending = {
        id: event.id, event, round: state.round, phase: state.phase, turnPlayerId: state.activePlayerId,
        playerIds: event.actorPlayerId ? [event.actorPlayerId] : [], category: 'other', highlight: false,
        description: describeBattleEvent(event, session.setup),
      }
      objectiveBefore = undefined
      scoreCategory = undefined
      let target: { playerId: string; unitId: string } | undefined
      if ('playerId' in event.payload && typeof event.payload.playerId === 'string') pending.playerIds.push(event.payload.playerId)
      if ('unitId' in event.payload && 'playerId' in event.payload && typeof event.payload.unitId === 'string' && typeof event.payload.playerId === 'string') target = { playerId: event.payload.playerId, unitId: event.payload.unitId }
      if (event.type === 'STATE_CORRECTED') {
        const correction = event.payload.correction
        pending.note = event.payload.reason
        if ('playerId' in correction) pending.playerIds.push(correction.playerId)
        if ('unitId' in correction) target = correction
        if (correction.kind === 'OBJECTIVE_CONTROL' || correction.kind === 'OBJECTIVE_OC') pending.objectiveId = correction.objectiveId
        if (correction.kind === 'SCORE') {
          pending.scorePlayerId = doublesScorekeeperId(session.setup, correction.playerId)
          scoreCategory = correction.category
        }
      }
      if (event.type === 'UNIT_COMBAT_RESOLVED' || event.type === 'UNIT_DESTROYED' || event.type === 'UNIT_MODEL_DESTROYED' || event.type === 'UNIT_WOUNDS_CHANGED') {
        pending.note = event.payload.note
        if (event.payload.destroyedByPlayerId) pending.playerIds.push(event.payload.destroyedByPlayerId)
      }
      if (target) {
        const unit = state.players[target.playerId]?.units[target.unitId]
        if (unit) {
          const attribution = event.type === 'UNIT_COMBAT_RESOLVED' || event.type === 'UNIT_DESTROYED' || event.type === 'UNIT_MODEL_DESTROYED' || event.type === 'UNIT_WOUNDS_CHANGED' ? event.payload : undefined
          const attackerPlayerId = attribution?.destroyedByPlayerId ?? undefined
          const armyId = state.players[target.playerId].armyId
          const definition = armyId ? session.setup.armies[armyId]?.units.find((candidate) => candidate.id === target!.unitId) : undefined
          pending.unitChange = {
            target: battleUnit(session, target.playerId, target.unitId),
            attacker: attackerPlayerId && attribution?.attackerUnitId ? battleUnit(session, attackerPlayerId, attribution.attackerUnitId) : undefined,
            attackerPlayerId, modelsBefore: unit.modelsAlive, modelsAfter: unit.modelsAlive,
            woundsBefore: unit.woundsRemaining, woundsAfter: unit.woundsRemaining,
            totalWoundsBefore: definition ? totalCombatWounds(definition, unit) : undefined,
            destroyedBefore: unit.destroyed, destroyedAfter: unit.destroyed, correction: event.type === 'STATE_CORRECTED',
          }
        }
      }
      if ('objectiveId' in event.payload) pending.objectiveId = event.payload.objectiveId
      if (pending.objectiveId) objectiveBefore = state.objectives[pending.objectiveId]?.controllerPlayerId
      if (event.type === 'SCORE_ADJUSTED') {
        pending.scorePlayerId = doublesScorekeeperId(session.setup, event.payload.playerId)
        scoreCategory = event.payload.category
      }
      if (scoreCategory && pending.scorePlayerId) scoreBefore = state.players[pending.scorePlayerId].score[scoreCategory]
      if (event.type === 'MISSION_ACTION_STARTED') pending.missionAction = { ...event.payload.action }
      if (event.type === 'MISSION_ACTION_COMPLETED' || event.type === 'MISSION_ACTION_FAILED' || event.type === 'MISSION_ACTION_CANCELLED') {
        const action = state.missionActions[event.payload.actionId]
        if (action) {
          pending.missionAction = { ...action }
          pending.missionWasActive = action.status === 'ACTIVE'
          pending.playerIds.push(action.playerId)
          pending.description = `${battleUnit(session, action.playerId, action.unitId).name}: ${action.name} ${event.type === 'MISSION_ACTION_COMPLETED' ? 'completed' : event.type === 'MISSION_ACTION_FAILED' ? 'failed' : 'cancelled'}`
          if ('reason' in event.payload && event.payload.reason) pending.note = event.payload.reason
        }
      }
    },
    after(event, state) {
      if (event.type === 'ROUND_STARTED' || event.type === 'TURN_STARTED' || event.type === 'PHASE_CHANGED') {
        pending.round = state.round
        pending.phase = state.phase
        pending.turnPlayerId = state.activePlayerId
      }
      const change = pending.unitChange
      if (change) {
        const unit = state.players[change.target.playerId].units[change.target.unitId]
        change.modelsAfter = unit.modelsAlive
        change.woundsAfter = unit.woundsRemaining
        change.destroyedAfter = unit.destroyed
        change.currentModelWoundsAfter = unit.currentModelWounds ?? unit.woundsRemaining
        const armyId = state.players[change.target.playerId].armyId
        const definition = armyId ? session.setup.armies[armyId]?.units.find((candidate) => candidate.id === change.target.unitId) : undefined
        change.totalWoundsAfter = definition ? totalCombatWounds(definition, unit) : undefined
        if (event.type === 'UNIT_COMBAT_RESOLVED' && change.totalWoundsBefore !== undefined && change.totalWoundsAfter !== undefined) {
          if (event.payload.kind === 'damage' && event.payload.allocations.every((allocation) => allocation.wounds !== undefined)) change.effectiveWoundsLost = Math.max(0, change.totalWoundsBefore - change.totalWoundsAfter)
          if (event.payload.kind === 'heal') change.woundsHealed = Math.max(0, change.totalWoundsAfter - change.totalWoundsBefore)
        }
        if (event.type === 'UNIT_WOUNDS_CHANGED' && definition?.startingModels === 1 && change.woundsBefore !== undefined && change.woundsAfter !== undefined) {
          change.effectiveWoundsLost = Math.max(0, change.woundsBefore - change.woundsAfter)
          change.woundsHealed = Math.max(0, change.woundsAfter - change.woundsBefore)
        }
        const lost = Math.max(0, change.modelsBefore - change.modelsAfter)
        const killed = !change.destroyedBefore && change.destroyedAfter
        const combat = ['UNIT_COMBAT_RESOLVED', 'UNIT_DESTROYED', 'UNIT_MODEL_DESTROYED', 'UNIT_MODEL_RESTORED', 'UNIT_WOUNDS_CHANGED'].includes(event.type)
        if (combat) {
          pending.category = lost > 0 || killed ? 'kills' : 'combat'
          // A partial casualty is still a battle event worth showing. Legacy model-loss
           // events previously appeared only in Full History/Kills until the last model died.
           pending.highlight = lost > 0 || killed || change.modelsAfter > change.modelsBefore || (change.destroyedBefore && !change.destroyedAfter)
          const playerName = change.attackerPlayerId ? state.players[change.attackerPlayerId]?.name ?? change.attackerPlayerId : 'Unknown / environment'
          const source = change.attacker ? `${change.attacker.name} (${playerName})` : playerName
          const targetOwner = state.players[change.target.playerId]?.name ?? change.target.playerId
          if (killed) pending.description = `${source} → ${change.target.name} (${targetOwner}) destroyed`
          else if (lost > 0) pending.description = `${source} → ${change.target.name} (${targetOwner}): ${lost} model${lost === 1 ? '' : 's'} destroyed`
          else if (change.destroyedBefore && !change.destroyedAfter) pending.description = `${change.target.name} (${targetOwner}) restored to the battlefield`
        }
        if (combat && (event.type === 'UNIT_COMBAT_RESOLVED' || event.type === 'UNIT_WOUNDS_CHANGED' || event.type === 'UNIT_MODEL_RESTORED')) {
          const restored = Math.max(0, change.modelsAfter - change.modelsBefore)
          const source = change.attacker?.name ?? (change.attackerPlayerId ? state.players[change.attackerPlayerId]?.name : 'Unknown / environment')
          const effects = [change.effectiveWoundsLost ? `${change.effectiveWoundsLost} Wounds lost` : '', lost ? `${lost} model${lost === 1 ? '' : 's'} destroyed` : '', restored ? `${restored} model${restored === 1 ? '' : 's'} restored` : '', change.woundsHealed ? `${change.woundsHealed} Wounds healed` : ''].filter(Boolean)
          const healing = restored > 0 || Boolean(change.woundsHealed)
          const remaining = `${change.modelsAfter} model${change.modelsAfter === 1 ? '' : 's'} remaining${change.currentModelWoundsAfter !== undefined && !unit.destroyed ? ` · current model ${change.currentModelWoundsAfter} W` : ''}`
          pending.description = `${healing ? '' : `${source} → `}${change.target.name}: ${effects.join(' · ') || 'no change'} · ${remaining}${killed ? ' · unit destroyed' : change.destroyedBefore && !change.destroyedAfter ? ' · returned to battlefield' : ''}`
          pending.highlight = effects.length > 0
        }
        if (change.correction && (lost !== 0 || change.woundsBefore !== change.woundsAfter || change.totalWoundsBefore !== change.totalWoundsAfter || change.destroyedBefore !== change.destroyedAfter)) {
          pending.category = 'combat'
          pending.highlight = true
          pending.description = `Host correction · ${change.target.name}: ${change.modelsAfter} models${change.currentModelWoundsAfter === undefined ? '' : ` · current model ${change.currentModelWoundsAfter} W`}`
        }
      }
      if (pending.objectiveId) {
        const objective = state.objectives[pending.objectiveId]
        const controller = objective?.controllerPlayerId
        if (objectiveBefore !== controller) {
          pending.category = 'objectives'
          pending.highlight = true
          pending.objectiveName = objective.name
          pending.objectiveControllerPlayerId = controller
          if (controller) pending.playerIds.push(controller)
          if (objectiveBefore) pending.playerIds.push(objectiveBefore)
          pending.description = `${objective.name}: ${controller ? state.players[controller]?.name ?? controller : 'uncontrolled'}`
          if (event.type === 'STATE_CORRECTED') pending.description = `Host correction · ${pending.description}`
        } else if (pending.category === 'other') pending.category = 'objectives'
      }
      if (scoreCategory && pending.scorePlayerId) {
        pending.scoreDelta = state.players[pending.scorePlayerId].score[scoreCategory] - scoreBefore
        pending.category = 'vp'
        pending.highlight = pending.scoreDelta !== 0
        pending.description = `${state.players[pending.scorePlayerId].name}: ${scoreLabel(event, sources)} ${pending.scoreDelta >= 0 ? '+' : ''}${pending.scoreDelta} VP${event.type === 'STATE_CORRECTED' ? ' · host correction' : ''}`
      }
      if (event.type.startsWith('MISSION_ACTION_')) {
        pending.category = 'actions'
        pending.highlight = event.type !== 'MISSION_ACTION_STARTED'
      }
      if (event.type === 'STRATAGEM_USED') { pending.category = 'stratagems'; pending.highlight = true }
      if (/^(GAME_|ROUND_|TURN_|PHASE_)/.test(event.type)) {
        pending.category = 'flow'
        pending.highlight = event.type !== 'PHASE_CHANGED'
        if (pending.playerIds.length === 0) pending.playerIds.push(state.activePlayerId)
      }
      if (event.type === 'RULESET_EVENT') {
        const data = rulesetData(event)
        if (typeof data.playerId === 'string') pending.playerIds.push(data.playerId)
        if (event.payload.action === 'SECONDARY_OFFICIAL_ACTION_STARTED' && typeof data.unit === 'string' && typeof data.playerId === 'string') {
          pending.category = 'actions'
          pending.highlight = true
          const unit = battleUnit(session, data.playerId, data.unit)
          const objective = typeof data.target === 'string' ? state.objectives[data.target]?.name ?? data.target : ''
          pending.description = `${unit.name}: ${typeof data.cardId === 'string' ? label(data.cardId) : 'Mission Action'} started${objective ? ` · ${objective}` : ''}`
        }
      }
      pending.playerIds = [...new Set(pending.playerIds)]
      entries.push(pending)
    },
  })
  return entries
}
