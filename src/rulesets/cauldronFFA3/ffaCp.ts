import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { totalScore } from '../../domain/battle/selectors'
import { cauldronEvent, getCauldronEventData } from './events'
import { getCauldronConfig } from './sessionConfig'

export const FFA_ROUND_CP_ACTION = 'FFA_ROUND_CP_GRANTED'
export const FFA_ROUND_BASE_CP = 2

export type FfaRoundCpAward = {
  round: number
  baseCp: 2
  bonusPlayerIds: string[]
  /** Complete total for each physical player; never reallocate an existing CP balance. */
  grants: Record<string, number>
}

export function usesBalancedFfaCp(session: BattleSession): boolean {
  const config = getCauldronConfig(session)
  return config.mode === 'ffa3' && config.ffaCpPolicy === 'balanced-round-v1'
}

/** The event itself, rather than incidental +CP corrections, proves an allocation occurred. */
export function ffaRoundCpRecorded(session: BattleSession, round = session.state.round): boolean {
  if (!usesBalancedFfaCp(session)) return false
  return getCauldronEventData<FfaRoundCpAward>(session, FFA_ROUND_CP_ACTION)
    .some((award) => award.round === round)
}

/** Round 3 considers end-of-Round-2 VP, etc. Tied last players receive the
 * bonus, but a universal tie does not count as anyone being behind.
 */
export function calculateFfaRoundCpAward(session: BattleSession): FfaRoundCpAward {
  if (!usesBalancedFfaCp(session)) throw new Error('Balanced CP is only for opted-in FFA sessions.')
  const ids = session.state.turnOrder
  const round = session.state.round
  const scores = ids.map((id) => totalScore(session.state.players[id]))
  const lowest = Math.min(...scores)
  const highest = Math.max(...scores)
  const bonusPlayerIds = round >= 3 && lowest < highest
    ? ids.filter((id) => totalScore(session.state.players[id]) === lowest)
    : []
  return {
    round,
    baseCp: FFA_ROUND_BASE_CP,
    bonusPlayerIds,
    grants: Object.fromEntries(ids.map((id) => [
      id, FFA_ROUND_BASE_CP + Number(bonusPlayerIds.includes(id)),
    ])),
  }
}

/** Call after ROUND_STARTED and after final old-round scoring; dispatch all
 * events together with the round transition. Replay/reconnect cannot double
 * grant the same round because CP is projected exclusively from these events.
 */
export function ffaRoundCpGrantEvents(session: BattleSession): BattleEventInput[] {
  if (!usesBalancedFfaCp(session) || ffaRoundCpRecorded(session)) return []
  const award = calculateFfaRoundCpAward(session)
  return [
    cauldronEvent(FFA_ROUND_CP_ACTION, award),
    ...session.state.turnOrder.map((playerId): BattleEventInput => ({
      type: 'CP_GAINED',
      payload: { playerId, amount: award.grants[playerId] },
    })),
  ]
}
