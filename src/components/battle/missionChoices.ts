import type { BattleSession } from '../../domain/battle/types'
import { doublesSecondaryUnitChoices } from '../../rulesets/cauldronFFA3/officialSecondary'
import { officialPlayerUnits } from '../../rulesets/cauldronFFA3/officialSecondaryFFA'

function rosterUnitChoices(session: BattleSession, playerId: string) {
  const units = officialPlayerUnits(session, playerId)
  const totals = new Map<string, number>()
  const seen = new Map<string, number>()
  for (const unit of units) totals.set(unit.name, (totals.get(unit.name) ?? 0) + 1)
  return units.map(({ id, name }) => {
    const index = (seen.get(name) ?? 0) + 1
    seen.set(name, index)
    return { value: id, label: (totals.get(name) ?? 0) > 1 ? `${name} #${index}` : name }
  })
}

export function missionUnitChoices(session: BattleSession, playerId: string, forAction: boolean) {
  const force = session.setup.doubles?.forces.find((entry) => entry.captainPlayerId === playerId)
  if (force) {
    const labels = new Map(force.memberPlayerIds.map((id) => [
      id, new Map(rosterUnitChoices(session, id).map((unit) => [unit.value, unit.label])),
    ]))
    return doublesSecondaryUnitChoices(session, playerId, forAction).map((choice) => ({
      value: choice.value,
      label: `${session.state.players[choice.playerId].name} · ${labels.get(choice.playerId)?.get(choice.unitId) ?? choice.unitId}`,
    }))
  }
  return rosterUnitChoices(session, playerId).filter((choice) => {
    const state = session.state.players[playerId]?.units[choice.value]
    return state && !state.destroyed && !state.inReserve && (!forAction || !state.battleShocked)
  })
}

export function missionObjectiveLabel(session: BattleSession, id: string): string {
  const name = session.state.objectives[id]?.name
  return name && name !== id ? `${name} · ${id}` : id
}

export function missionUnitLabel(session: BattleSession, playerId: string, value: string): string {
  if (session.setup.doubles) {
    for (const owner of session.setup.players) {
      const unit = rosterUnitChoices(session, owner.id).find((unit) => JSON.stringify([owner.id, unit.value]) === value)
      if (unit) return `${owner.name} · ${unit.label}`
    }
  }
  return rosterUnitChoices(session, playerId).find((unit) => unit.value === value)?.label ?? value
}
