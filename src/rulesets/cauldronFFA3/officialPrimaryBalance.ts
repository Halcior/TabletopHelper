import type { BattleSession } from '../../domain/battle/types'
import { getCauldronConfig } from './sessionConfig'

export const FFA_PRIMARY_BALANCE_VERSION = 'balanced-v1' as const

type PrimaryPoints = {
  dominanceNonHomeBonus: number
  meatgrinderHold: number
  meatgrinderTrade: number
  gatherFirstCenter: number
  gatherHold: number
  gatherAction: number
  sabotageAction: number
  outmanoeuvreHome: number
  outmanoeuvreCommand: number
  outmanoeuvreLate: number
}

const ORIGINAL_PRIMARY_POINTS: PrimaryPoints = {
  dominanceNonHomeBonus: 2,
  meatgrinderHold: 4,
  meatgrinderTrade: 5,
  gatherFirstCenter: 6,
  gatherHold: 4,
  gatherAction: 7,
  sabotageAction: 3,
  outmanoeuvreHome: 10,
  outmanoeuvreCommand: 5,
  outmanoeuvreLate: 6,
}

export const BALANCED_PRIMARY_POINTS: PrimaryPoints = {
  dominanceNonHomeBonus: 1,
  meatgrinderHold: 5,
  meatgrinderTrade: 4,
  gatherFirstCenter: 4,
  gatherHold: 5,
  gatherAction: 8,
  sabotageAction: 4,
  outmanoeuvreHome: 8,
  outmanoeuvreCommand: 6,
  outmanoeuvreLate: 7,
}

export function usesBalancedFfaPrimary(session: BattleSession): boolean {
  const config = getCauldronConfig(session)
  return config.primaryDeck === 'chapter-approved-ffa'
    && config.officialPrimaryBalance === FFA_PRIMARY_BALANCE_VERSION
}

export function officialPrimaryPoints(session: BattleSession): PrimaryPoints {
  // Untagged saved battles retain the point values they started with.
  return usesBalancedFfaPrimary(session) ? BALANCED_PRIMARY_POINTS : ORIGINAL_PRIMARY_POINTS
}
