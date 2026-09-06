import type { Army } from '../../domain/army/types'

export type DuelTurnPosition = 1 | 2

export type DuelPlayerInput = {
  id: string
  name: string
  armyId: string
  turnPosition: DuelTurnPosition
}

export type DuelGameInput = {
  players: DuelPlayerInput[]
  armies: Army[]
  guidanceLevel: 'guided' | 'fast'
  objectiveCount?: number
  gameId?: string
  createdAt?: string
}

export type DuelConfig = {
  version: 1
  objectiveCount: number
}
