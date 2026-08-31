import type { BattleSession } from '../../domain/battle/types'
import { getCauldronConfig } from './sessionConfig'
import type { DeploymentZone } from './types'

const ODD_RIVALS: Record<DeploymentZone, DeploymentZone> = { A: 'B', B: 'C', C: 'A' }
const EVEN_RIVALS: Record<DeploymentZone, DeploymentZone> = { A: 'C', B: 'A', C: 'B' }

export function getCurrentRival(playerSlot: DeploymentZone, battleRound: number): DeploymentZone {
  if (!Number.isInteger(battleRound) || battleRound < 1) throw new Error('Battle Round must be a positive integer.')
  return (battleRound % 2 === 1 ? ODD_RIVALS : EVEN_RIVALS)[playerSlot]
}

export function getCurrentRivalPlayerId(session: BattleSession, playerId: string, battleRound = session.state.round): string {
  const config = getCauldronConfig(session)
  const playerSlot = config.playerConfigs[playerId]?.deploymentZone
  if (!playerSlot) throw new Error(`Player ${playerId} has no Cauldron deployment zone.`)
  const rivalSlot = getCurrentRival(playerSlot, battleRound)
  const rival = Object.entries(config.playerConfigs).find(([, player]) => player.deploymentZone === rivalSlot)?.[0]
  if (!rival) throw new Error(`No player is assigned to Cauldron deployment zone ${rivalSlot}.`)
  return rival
}

export function getRivalMapping(session: BattleSession, battleRound = session.state.round): Record<string, string> {
  return Object.fromEntries(session.setup.players.map((player) => [
    player.id,
    getCurrentRivalPlayerId(session, player.id, battleRound),
  ]))
}
