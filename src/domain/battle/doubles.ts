import type { BattleSetup, DoublesForce, DoublesSetup } from './types'

/**
 * A Doubles force is one scoring/turn-taking side, but never merges the
 * underlying players' armies. Four independent player IDs remain in the
 * battle for wounds, units, combat attribution, lobby seats and Chronicle.
 */
export function doublesForceForPlayer(
  setup: BattleSetup,
  playerId: string,
): DoublesForce | undefined {
  return setup.doubles?.forces.find((force) => force.memberPlayerIds.includes(playerId))
}

export function doublesScorekeeperId(setup: BattleSetup, playerId: string): string {
  return doublesForceForPlayer(setup, playerId)?.captainPlayerId ?? playerId
}

export function doublesTeamMembers(setup: BattleSetup, playerId: string): string[] {
  return doublesForceForPlayer(setup, playerId)?.memberPlayerIds ?? [playerId]
}

export function onSameDoublesForce(setup: BattleSetup, a: string, b: string): boolean {
  return Boolean(setup.doubles && doublesScorekeeperId(setup, a) === doublesScorekeeperId(setup, b))
}

export function validateDoublesSetup(
  players: BattleSetup['players'],
  turnOrder: string[],
  doubles: DoublesSetup,
): void {
  if (doubles.rulesVersion !== 'GW-Doubles-1.1') throw new Error('Unsupported Doubles rules version.')
  if (players.length !== 4 || doubles.forces.length !== 2 || turnOrder.length !== 2) {
    throw new Error('Doubles requires exactly four commanders, two forces and two shared turns.')
  }
  const playerIds = new Set(players.map((player) => player.id))
  const used = new Set<string>()
  const captains = new Set<string>()
  for (const force of doubles.forces) {
    if (!force.id.trim() || !force.name.trim() || force.memberPlayerIds.length !== 2
      || !force.memberPlayerIds.includes(force.captainPlayerId)
      || !['unified', 'convenience'].includes(force.forceType)
      || !force.forceDisposition || !force.warlord) {
      throw new Error('A Doubles force needs a name, two commanders, a valid scoring captain, a disposition and one Warlord.')
    }
    for (const id of force.memberPlayerIds) {
      if (!playerIds.has(id) || used.has(id)) throw new Error('Every Doubles commander must belong to exactly one force.')
      used.add(id)
    }
    if (captains.has(force.captainPlayerId)) throw new Error('Force captains must be distinct.')
    captains.add(force.captainPlayerId)
    if (!force.memberPlayerIds.includes(force.warlord.playerId)) throw new Error('A force Warlord must belong to its own force.')
    const selected = players.find((player) => player.id === force.warlord.playerId)
    if (!selected?.armyId) throw new Error('Warlord commander has no army.')
  }
  if (used.size !== 4 || new Set(doubles.forces.map((force) => force.id)).size !== 2
      || turnOrder.some((id) => !captains.has(id)) || new Set(turnOrder).size !== 2) {
    throw new Error('Doubles turn order must contain each force captain once.')
  }
}

/** OC is added across both teammates, not compared as four rival players. */
export function doublesObjectiveController(
  setup: BattleSetup,
  oc: Record<string, number>,
): string | null {
  if (!setup.doubles) return null
  const totals = setup.doubles.forces.map((force) => ({
    captain: force.captainPlayerId,
    oc: force.memberPlayerIds.reduce((sum, id) => sum + Math.max(0, oc[id] ?? 0), 0),
  }))
  if (totals[0].oc === totals[1].oc) return null
  return totals[0].oc > totals[1].oc ? totals[0].captain : totals[1].captain
}
