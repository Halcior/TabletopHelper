import type { UnitDefinition } from '../../domain/army/types'
import type { BattleEvent, BattleSession } from '../../domain/battle/types'
import { getCurrentRivalPlayerId } from './rivalRotation'
import type { CasualtyRecord, WyniszczenieProgress } from './types'

type CasualtyBatch = { attackerPlayerId: string; count: number }

function unitDefinition(session: BattleSession, playerId: string, unitId: string): UnitDefinition | undefined {
  const armyId = session.setup.players.find((player) => player.id === playerId)?.armyId
  return armyId ? session.setup.armies[armyId]?.units.find((unit) => unit.id === unitId) : undefined
}

function unitKey(playerId: string, unitId: string): string {
  return `${playerId}|${unitId}`
}

function recordKey(round: number, attackerPlayerId: string, targetPlayerId: string, unitId: string): string {
  return `${round}|${attackerPlayerId}|${targetPlayerId}|${unitId}`
}

function batchKey(round: number, targetPlayerId: string, unitId: string): string {
  return `${round}|${targetPlayerId}|${unitId}`
}

export function modelDestroyedValue(unit: UnitDefinition): number {
  return unit.startingModels === 1 ? unit.points : unit.points / unit.startingModels
}

export function buildCasualtyLedger(session: BattleSession): CasualtyRecord[] {
  const alive = new Map<string, number>()
  for (const player of session.setup.players) {
    const army = player.armyId ? session.setup.armies[player.armyId] : undefined
    for (const unit of army?.units ?? []) alive.set(unitKey(player.id, unit.id), unit.startingModels)
  }

  const counts = new Map<string, number>()
  const batches = new Map<string, CasualtyBatch[]>()
  let currentRound = 1

  function addCasualties(targetPlayerId: string, unitId: string, requested: number, attackerPlayerId?: string | null): void {
    const key = unitKey(targetPlayerId, unitId)
    const before = alive.get(key) ?? 0
    const effective = Math.min(before, Math.max(0, requested))
    alive.set(key, before - effective)
    if (effective === 0 || !attackerPlayerId) return
    const keyForRecord = recordKey(currentRound, attackerPlayerId, targetPlayerId, unitId)
    counts.set(keyForRecord, (counts.get(keyForRecord) ?? 0) + effective)
    const keyForBatch = batchKey(currentRound, targetPlayerId, unitId)
    batches.set(keyForBatch, [...(batches.get(keyForBatch) ?? []), { attackerPlayerId, count: effective }])
  }

  function restoreCasualties(targetPlayerId: string, unitId: string, requested: number): void {
    const definition = unitDefinition(session, targetPlayerId, unitId)
    if (!definition) return
    const key = unitKey(targetPlayerId, unitId)
    const before = alive.get(key) ?? definition.startingModels
    let effective = Math.min(definition.startingModels - before, Math.max(0, requested))
    alive.set(key, before + effective)
    const keyForBatch = batchKey(currentRound, targetPlayerId, unitId)
    const unitBatches = batches.get(keyForBatch) ?? []
    for (let index = unitBatches.length - 1; index >= 0 && effective > 0; index -= 1) {
      const batch = unitBatches[index]
      const restored = Math.min(batch.count, effective)
      batch.count -= restored
      effective -= restored
      const keyForRecord = recordKey(currentRound, batch.attackerPlayerId, targetPlayerId, unitId)
      counts.set(keyForRecord, Math.max(0, (counts.get(keyForRecord) ?? 0) - restored))
    }
  }

  for (const event of session.state.events as BattleEvent[]) {
    if (event.type === 'ROUND_STARTED') {
      currentRound = event.payload.round
      continue
    }
    if (event.type === 'UNIT_MODEL_DESTROYED') {
      addCasualties(
        event.payload.playerId,
        event.payload.unitId,
        Math.max(1, event.payload.amount),
        event.payload.destroyedByPlayerId,
      )
      continue
    }
    if (event.type === 'UNIT_DESTROYED') {
      const remaining = alive.get(unitKey(event.payload.playerId, event.payload.unitId)) ?? 0
      addCasualties(event.payload.playerId, event.payload.unitId, remaining, event.payload.destroyedByPlayerId)
      continue
    }
    if (event.type === 'UNIT_MODEL_RESTORED') {
      restoreCasualties(event.payload.playerId, event.payload.unitId, Math.max(1, event.payload.amount))
      continue
    }
    if (event.type === 'UNIT_WOUNDS_CHANGED') {
      const definition = unitDefinition(session, event.payload.playerId, event.payload.unitId)
      if (definition?.startingModels !== 1) continue
      const currentlyAlive = (alive.get(unitKey(event.payload.playerId, event.payload.unitId)) ?? 1) > 0
      if (event.payload.woundsRemaining <= 0 && currentlyAlive) {
        addCasualties(event.payload.playerId, event.payload.unitId, 1, event.payload.destroyedByPlayerId)
      } else if (event.payload.woundsRemaining > 0 && !currentlyAlive) {
        restoreCasualties(event.payload.playerId, event.payload.unitId, 1)
      }
    }
  }

  return [...counts.entries()].flatMap(([key, modelsDestroyed]) => {
    if (modelsDestroyed <= 0) return []
    const [round, attackerPlayerId, targetPlayerId, unitId] = key.split('|')
    return [{
      attackerPlayerId,
      targetPlayerId,
      unitId,
      modelsDestroyed,
      battleRound: Number(round),
    }]
  })
}

export function getWyniszczenieProgress(
  session: BattleSession,
  attackerPlayerId: string,
  battleRound = session.state.round,
): WyniszczenieProgress {
  const rivalPlayerId = getCurrentRivalPlayerId(session, attackerPlayerId, battleRound)
  const rivalArmyId = session.setup.players.find((player) => player.id === rivalPlayerId)?.armyId
  const rivalArmy = rivalArmyId ? session.setup.armies[rivalArmyId] : undefined
  if (!rivalArmy) throw new Error(`Rival ${rivalPlayerId} has no starting army.`)
  const destroyedValue = buildCasualtyLedger(session)
    .filter((record) => (
      record.battleRound === battleRound
      && record.attackerPlayerId === attackerPlayerId
      && record.targetPlayerId === rivalPlayerId
    ))
    .reduce((total, record) => {
      const unit = rivalArmy.units.find((candidate) => candidate.id === record.unitId)
      return total + (unit ? modelDestroyedValue(unit) * record.modelsDestroyed : 0)
    }, 0)
  const threshold = rivalArmy.totalPoints * 0.1
  return {
    attackerPlayerId,
    rivalPlayerId,
    destroyedValue,
    threshold,
    completed: destroyedValue >= threshold,
  }
}
