import type { BattleSession } from '../battle/types'
import { CAULDRON_RULESET_ID } from '../../rulesets/cauldronFFA3/constants'
import { evaluateOperationalPlan, getOperationalPlanState } from '../../rulesets/cauldronFFA3/operationalPlans'
import { getRoundSecondaryVp } from '../../rulesets/cauldronFFA3/secondary'
import { CAULDRON_SECONDARY_BY_ID } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import type { ContextItem } from './types'

type CompletionData = {
  playerId?: string
  cardId?: SecondaryId
  pointsAwarded?: number
}

function unitName(session: BattleSession, playerId: string, unitId: string): string {
  const armyId = session.setup.players.find((player) => player.id === playerId)?.armyId
  return session.setup.armies[armyId ?? '']?.units.find((unit) => unit.id === unitId)?.name ?? 'Unit'
}

function isPhysicalKillEvent(event: BattleSession['state']['events'][number]): event is BattleSession['state']['events'][number] & {
  type: 'UNIT_DESTROYED' | 'UNIT_WOUNDS_CHANGED' | 'UNIT_MODEL_DESTROYED'
  payload: { playerId: string; unitId: string }
} {
  return event.type === 'UNIT_DESTROYED'
    || event.type === 'UNIT_WOUNDS_CHANGED'
    || event.type === 'UNIT_MODEL_DESTROYED'
}

/**
 * Builds one player-facing consequence chain for the latest physical kill that
 * automatically completed a Secondary. The underlying battle/Secondary events
 * stay separate and authoritative; this only groups their shared actionId for UX.
 */
export function buildLatestAutomaticConsequence(session: BattleSession): ContextItem | null {
  if (session.setup.guidanceLevel === 'fast' || session.setup.rulesetId !== CAULDRON_RULESET_ID) return null

  let turnStartIndex = -1
  for (let index = session.state.events.length - 1; index >= 0; index -= 1) {
    if (session.state.events[index].type === 'TURN_STARTED') {
      turnStartIndex = index
      break
    }
  }

  const turnEvents = session.state.events.slice(turnStartIndex + 1)
  const actionIds = [...new Set([...turnEvents].reverse().map((event) => event.actionId))]

  for (const actionId of actionIds) {
    const group = turnEvents.filter((event) => event.actionId === actionId)
    const physical = group.find(isPhysicalKillEvent)
    const completion = group.find((event) => (
      event.type === 'RULESET_EVENT'
      && event.payload.rulesetId === CAULDRON_RULESET_ID
      && event.payload.action === 'SECONDARY_COMPLETED'
    ))
    if (!physical || !completion || completion.type !== 'RULESET_EVENT') continue

    const data = completion.payload.data as CompletionData
    if (!data.playerId || !data.cardId || typeof data.pointsAwarded !== 'number') continue
    const secondary = CAULDRON_SECONDARY_BY_ID[data.cardId]
    if (!secondary) continue

    const destroyedName = unitName(session, physical.payload.playerId, physical.payload.unitId)
    const roundSecondaryVp = getRoundSecondaryVp(session, data.playerId)
    const details = [
      `Army → ${destroyedName} marked destroyed.`,
      `Secondary → ${secondary.name} completed for +${data.pointsAwarded} VP.`,
      `Round Secondary → ${roundSecondaryVp} / 10 VP.`,
    ]

    const planState = getOperationalPlanState(session, data.playerId)
    if (planState.planId === 'WYNISZCZENIE') {
      const evaluation = evaluateOperationalPlan(session, data.playerId)
      if (evaluation.progress) {
        details.push(`Wyniszczenie → ${evaluation.progress.current} / ${evaluation.progress.target} ${evaluation.progress.unit}.`)
      }
    }

    return {
      id: `automatic-consequence-${actionId}`,
      type: 'AUTOMATIC_CONSEQUENCE_CHAIN',
      title: `${destroyedName} destroyed → ${secondary.name} +${data.pointsAwarded} VP`,
      shortDescription: 'Army state and automatic scoring were resolved from the same battle action.',
      status: 'DONE',
      severity: 'INFO',
      source: 'SECONDARY',
      phase: session.state.phase,
      relatedPlayerId: data.playerId,
      relatedUnitId: physical.payload.unitId,
      relatedSecondaryId: data.cardId,
      actions: [],
      details,
    }
  }

  return null
}
