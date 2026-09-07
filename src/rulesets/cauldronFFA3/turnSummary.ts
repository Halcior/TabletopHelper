import { totalScore } from '../../domain/battle/selectors'
import type { BattleEvent, BattleSession } from '../../domain/battle/types'
import { CAULDRON_SECONDARY_BY_ID } from './secondaryDefinitions'
import type { SecondaryId } from './secondaryTypes'

export type TurnCompletedSecondary = {
  cardId: SecondaryId
  name: string
  pointsAwarded: number
}

export type TurnKill = {
  victimPlayerId: string
  victimPlayerName: string
  unitId: string
  unitName: string
}

export type CauldronTurnSummary = {
  playerId: string
  round: number
  scoreBefore: number
  scoreAfter: number
  pointsGained: number
  primaryGained: number
  secondaryGained: number
  completedSecondaries: TurnCompletedSecondary[]
  kills: TurnKill[]
}

function currentTurnEvents(session: BattleSession, playerId: string): BattleEvent[] {
  let startIndex = -1
  for (let index = session.state.events.length - 1; index >= 0; index -= 1) {
    const event = session.state.events[index]
    if (event.type === 'TURN_STARTED' && event.payload.playerId === playerId) {
      startIndex = index
      break
    }
  }
  return startIndex >= 0 ? session.state.events.slice(startIndex + 1) : []
}

function unitName(session: BattleSession, playerId: string, unitId: string): string {
  const setupPlayer = session.setup.players.find((player) => player.id === playerId)
  const army = setupPlayer?.armyId ? session.setup.armies[setupPlayer.armyId] : undefined
  return army?.units.find((unit) => unit.id === unitId)?.name ?? unitId
}

function casualtyAttribution(event: BattleEvent): { victimPlayerId: string; unitId: string; attackerPlayerId?: string } | undefined {
  if (event.type !== 'UNIT_MODEL_DESTROYED' && event.type !== 'UNIT_WOUNDS_CHANGED' && event.type !== 'UNIT_DESTROYED') return undefined
  return {
    victimPlayerId: event.payload.playerId,
    unitId: event.payload.unitId,
    attackerPlayerId: event.payload.destroyedByPlayerId ?? undefined,
  }
}

function casualtyAttributionReset(event: BattleEvent): { playerId: string; unitId: string } | undefined {
  if (event.type === 'UNIT_MODEL_RESTORED') return event.payload
  if (event.type !== 'STATE_CORRECTED') return undefined
  const correction = event.payload.correction
  if (correction.kind !== 'UNIT_MODELS' && correction.kind !== 'UNIT_WOUNDS') return undefined
  return { playerId: correction.playerId, unitId: correction.unitId }
}

export function buildCauldronTurnSummary(session: BattleSession, playerId: string): CauldronTurnSummary {
  const events = currentTurnEvents(session, playerId)
  let primaryGained = 0
  let secondaryGained = 0
  let pointsGained = 0
  const completedSecondaries: TurnCompletedSecondary[] = []
  const latestCasualtyByUnit = new Map<string, {
    victimPlayerId: string
    unitId: string
    attackerPlayerId?: string
  }>()

  for (const event of events) {
    if (event.type === 'SCORE_ADJUSTED' && event.payload.playerId === playerId) {
      pointsGained += event.payload.delta
      if (event.payload.category === 'primary') primaryGained += event.payload.delta
      if (event.payload.category === 'secondary') secondaryGained += event.payload.delta
    }

    if (event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_COMPLETED') {
      const data = event.payload.data
      if (data && typeof data === 'object' && 'playerId' in data && 'cardId' in data && 'pointsAwarded' in data) {
        const typed = data as { playerId?: unknown; cardId?: unknown; pointsAwarded?: unknown }
        if (
          typed.playerId === playerId
          && typeof typed.cardId === 'string'
          && typed.cardId in CAULDRON_SECONDARY_BY_ID
          && typeof typed.pointsAwarded === 'number'
        ) {
          const cardId = typed.cardId as SecondaryId
          completedSecondaries.push({
            cardId,
            name: CAULDRON_SECONDARY_BY_ID[cardId].name,
            pointsAwarded: typed.pointsAwarded,
          })
        }
      }
    }

    const reset = casualtyAttributionReset(event)
    if (reset) latestCasualtyByUnit.delete(`${reset.playerId}:${reset.unitId}`)

    const casualty = casualtyAttribution(event)
    if (casualty) {
      latestCasualtyByUnit.set(`${casualty.victimPlayerId}:${casualty.unitId}`, {
        victimPlayerId: casualty.victimPlayerId,
        unitId: casualty.unitId,
        attackerPlayerId: casualty.attackerPlayerId,
      })
    }
  }

  const kills = [...latestCasualtyByUnit.values()].flatMap(({ victimPlayerId, unitId, attackerPlayerId }): TurnKill[] => {
    if (attackerPlayerId !== playerId || victimPlayerId === playerId) return []
    if (!session.state.players[victimPlayerId]?.units[unitId]?.destroyed) return []
    return [{
      victimPlayerId,
      victimPlayerName: session.state.players[victimPlayerId]?.name ?? victimPlayerId,
      unitId,
      unitName: unitName(session, victimPlayerId, unitId),
    }]
  })

  const scoreAfter = totalScore(session.state.players[playerId])
  return {
    playerId,
    round: session.state.round,
    scoreBefore: scoreAfter - pointsGained,
    scoreAfter,
    pointsGained,
    primaryGained,
    secondaryGained,
    completedSecondaries,
    kills,
  }
}
