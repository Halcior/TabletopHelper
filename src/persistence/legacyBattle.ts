import type { Army } from '../domain/army/types'
import type { BattleSession } from '../domain/battle/types'

type LegacyPlayerSetup = BattleSession['setup']['players'][number] & { army?: Army }

export function normalizeLegacySession(session: BattleSession): BattleSession {
  const legacySetup = session.setup as Omit<BattleSession['setup'], 'armies' | 'players'> & {
    armies?: Record<string, Army>
    players: LegacyPlayerSetup[]
  }
  if (legacySetup.armies) return session
  const armies = Object.fromEntries(legacySetup.players.flatMap((player) => (
    player.army ? [[player.army.id, player.army] as const] : []
  )))
  const players = legacySetup.players.map((player) => {
    const { army, ...setupPlayer } = player
    return { ...setupPlayer, armyId: setupPlayer.armyId ?? army?.id }
  })
  return { ...session, setup: { ...session.setup, players, armies } }
}
