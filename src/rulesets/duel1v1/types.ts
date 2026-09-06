import type { Army } from '../../domain/army/types'
import type { DuelForceDispositionId, DuelSecondaryMode } from './missionData'

export type DuelTurnPosition = 1 | 2
export type DuelLayoutVariant = 'A' | 'B' | 'C'

export type DuelPlayerInput = {
  id: string
  name: string
  armyId: string
  turnPosition: DuelTurnPosition
}

export type DuelPlayerMissionConfig = {
  forceDispositionId: DuelForceDispositionId
  secondaryMode: DuelSecondaryMode
  fixedSecondaryIds: string[]
  battleReady: boolean
}

export type DuelGameInput = {
  players: DuelPlayerInput[]
  armies: Army[]
  guidanceLevel: 'guided' | 'fast'
  objectiveCount?: number
  missionConfigs?: Record<string, DuelPlayerMissionConfig>
  attackerPlayerId?: string
  layoutVariant?: DuelLayoutVariant
  gameId?: string
  createdAt?: string
}

export type DuelConfig = {
  version: 2
  objectiveCount: number
  attackerPlayerId: string
  layoutVariant: DuelLayoutVariant
  playerConfigs: Record<string, DuelPlayerMissionConfig>
}

export type DuelScoredSecondary = {
  cardId: string
  round: number
  vp: number
}

export type DuelPlayerMissionState = {
  playerId: string
  activeCardIds: string[]
  deckCardIds: string[]
  discardCardIds: string[]
  scoredSecondaries: DuelScoredSecondary[]
  primaryByRound: Record<number, number>
  secondaryByRound: Record<number, number>
  mulliganUsed: boolean
  discardCpRounds: number[]
}

export type DuelMissionState = Record<string, DuelPlayerMissionState>
