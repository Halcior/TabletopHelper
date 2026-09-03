import { participantIsOnline } from './presence'
import type { SharedParticipant } from './types'

export type SharedLobbySummary = {
  seatCount: number
  onlineCount: number
  readyCount: number
  allSeatsOnline: boolean
  allReady: boolean
}

export function sharedBattleHasStarted(startedAt: string | null | undefined): startedAt is string {
  return typeof startedAt === 'string' && startedAt.length > 0
}

export function summarizeSharedLobby(
  playerIds: string[],
  participants: SharedParticipant[],
  now = Date.now(),
): SharedLobbySummary {
  const seats = playerIds.map((playerId) => participants.find((participant) => participant.playerId === playerId))
  const onlineSeats = seats.filter((participant): participant is SharedParticipant => Boolean(
    participant && participantIsOnline(participant, now),
  ))
  const readySeats = onlineSeats.filter((participant) => participant.isReady)

  return {
    seatCount: seats.filter(Boolean).length,
    onlineCount: onlineSeats.length,
    readyCount: readySeats.length,
    allSeatsOnline: playerIds.length > 0 && onlineSeats.length === playerIds.length,
    allReady: playerIds.length > 0 && readySeats.length === playerIds.length,
  }
}

export function canStartSharedLobby(
  isHost: boolean,
  playerIds: string[],
  participants: SharedParticipant[],
  now = Date.now(),
): boolean {
  const summary = summarizeSharedLobby(playerIds, participants, now)
  return isHost && summary.allSeatsOnline && summary.allReady
}
