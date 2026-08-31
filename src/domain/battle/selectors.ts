import type { GameState, PlayerState } from './types'

export function totalScore(player: PlayerState): number {
  return Object.values(player.score).reduce((total, value) => total + value, 0)
}

export function activePlayer(state: GameState): PlayerState {
  const player = state.players[state.activePlayerId]
  if (!player) throw new Error(`Active player ${state.activePlayerId} is missing from battle state.`)
  return player
}

export function canUndo(state: GameState): boolean {
  return state.events.some((event) => event.undoable)
}
