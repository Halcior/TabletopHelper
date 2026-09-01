import type { BattleEvent, BattleSession } from '../battle/types'
import { CAULDRON_RULESET_ID } from '../../rulesets/cauldronFFA3/constants'
import { evaluateOperationalPlan, getOperationalPlanState } from '../../rulesets/cauldronFFA3/operationalPlans'
import { CAULDRON_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'

type SecondaryCompletionData = {
  playerId?: string
  cardId?: SecondaryId
  pointsAwarded?: number
}

export type LatestBattleUpdate = {
  actionId: string
  title: string
  detail: string
  consequences: string[]
}

function unitName(session: BattleSession, playerId: string, unitId: string): string {
  const player = session.state.players[playerId]
  const army = player?.armyId ? session.setup.armies[player.armyId] : undefined
  return army?.units.find((unit) => unit.id === unitId)?.name ?? 'Unit'
}

function objectiveName(session: BattleSession, objectiveId: string): string {
  return session.state.objectives[objectiveId]?.name ?? objectiveId
}

function isMeaningfulPhysicalEvent(event: BattleEvent): boolean {
  return [
    'UNIT_MODEL_DESTROYED',
    'UNIT_MODEL_RESTORED',
    'UNIT_WOUNDS_CHANGED',
    'UNIT_DESTROYED',
    'OBJECTIVE_CONTROL_CHANGED',
    'MISSION_ACTION_STARTED',
    'MISSION_ACTION_COMPLETED',
    'MISSION_ACTION_FAILED',
    'STRATAGEM_USED',
  ].includes(event.type)
}

function describeCause(session: BattleSession, event: BattleEvent): { title: string; detail: string; scoringPlayerId?: string } | null {
  switch (event.type) {
    case 'UNIT_DESTROYED': {
      const name = unitName(session, event.payload.playerId, event.payload.unitId)
      return {
        title: `${name} destroyed`,
        detail: 'Army state updated.',
        scoringPlayerId: event.payload.destroyedByPlayerId ?? undefined,
      }
    }
    case 'UNIT_MODEL_DESTROYED': {
      const name = unitName(session, event.payload.playerId, event.payload.unitId)
      return {
        title: `${name} · casualty recorded`,
        detail: `${event.payload.amount} model${event.payload.amount === 1 ? '' : 's'} removed.`,
        scoringPlayerId: event.payload.destroyedByPlayerId ?? undefined,
      }
    }
    case 'UNIT_MODEL_RESTORED': {
      const name = unitName(session, event.payload.playerId, event.payload.unitId)
      return {
        title: `${name} · model restored`,
        detail: `${event.payload.amount} model${event.payload.amount === 1 ? '' : 's'} restored.`,
      }
    }
    case 'UNIT_WOUNDS_CHANGED': {
      const name = unitName(session, event.payload.playerId, event.payload.unitId)
      return {
        title: `${name} · ${event.payload.woundsRemaining} W remaining`,
        detail: 'Wounds updated.',
        scoringPlayerId: event.payload.destroyedByPlayerId ?? undefined,
      }
    }
    case 'OBJECTIVE_CONTROL_CHANGED': {
      const controller = event.payload.controllerPlayerId
        ? session.state.players[event.payload.controllerPlayerId]?.name ?? 'Unknown player'
        : 'Uncontrolled'
      return {
        title: `${objectiveName(session, event.payload.objectiveId)} → ${controller}`,
        detail: 'Objective control updated.',
        scoringPlayerId: event.payload.controllerPlayerId ?? undefined,
      }
    }
    case 'MISSION_ACTION_STARTED':
      return {
        title: `${event.payload.action.name} started`,
        detail: 'Mission Action is now active.',
        scoringPlayerId: event.payload.action.playerId,
      }
    case 'MISSION_ACTION_COMPLETED': {
      const action = session.state.missionActions[event.payload.actionId]
      return {
        title: `${action?.name ?? 'Mission Action'} completed`,
        detail: 'Mission Action result recorded.',
        scoringPlayerId: action?.playerId,
      }
    }
    case 'MISSION_ACTION_FAILED': {
      const action = session.state.missionActions[event.payload.actionId]
      return {
        title: `${action?.name ?? 'Mission Action'} failed`,
        detail: event.payload.reason,
        scoringPlayerId: action?.playerId,
      }
    }
    case 'STRATAGEM_USED':
      return {
        title: `${event.payload.stratagemName} used`,
        detail: `${event.payload.cpCost} CP spent.`,
        scoringPlayerId: event.payload.playerId,
      }
    default:
      return null
  }
}

/**
 * Returns one compact, human-readable summary for the most recent meaningful
 * physical/tabletop action. Rules remain event-driven; this is presentation only.
 */
export function buildLatestBattleUpdate(session: BattleSession): LatestBattleUpdate | null {
  let turnStartIndex = -1
  for (let index = session.state.events.length - 1; index >= 0; index -= 1) {
    if (session.state.events[index].type === 'TURN_STARTED') {
      turnStartIndex = index
      break
    }
  }

  const turnEvents = session.state.events.slice(turnStartIndex + 1)
  const cause = [...turnEvents].reverse().find(isMeaningfulPhysicalEvent)
  if (!cause) return null
  const described = describeCause(session, cause)
  if (!described) return null

  const group = turnEvents.filter((event) => event.actionId === cause.actionId)
  const consequences: string[] = []

  for (const event of group) {
    if (event.type !== 'RULESET_EVENT' || event.payload.rulesetId !== CAULDRON_RULESET_ID) continue
    if (event.payload.action !== 'SECONDARY_COMPLETED') continue
    const data = event.payload.data as SecondaryCompletionData
    if (!data.cardId || typeof data.pointsAwarded !== 'number') continue
    const card = CAULDRON_SECONDARY_BY_ID[data.cardId]
    if (card) consequences.push(`${card.name} +${data.pointsAwarded} VP`)
  }

  if (session.setup.rulesetId === CAULDRON_RULESET_ID && described.scoringPlayerId) {
    try {
      const planState = getOperationalPlanState(session, described.scoringPlayerId)
      const evaluation = evaluateOperationalPlan(session, described.scoringPlayerId)
      if (planState.planId === 'WYNISZCZENIE' && evaluation.progress) {
        consequences.push(`Wyniszczenie ${evaluation.progress.current}/${evaluation.progress.target} ${evaluation.progress.unit}`)
      }
    } catch {
      // The summary must never make the battle screen fail when optional ruleset
      // configuration is missing or belongs to another game type.
    }
  }

  return {
    actionId: cause.actionId,
    title: described.title,
    detail: described.detail,
    consequences: [...new Set(consequences)],
  }
}
