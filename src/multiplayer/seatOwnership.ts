import { participantIsActive } from './presence'
import type { SharedMembership, SharedParticipant } from './types'

export type SeatRestoreDecision = 'reuse' | 'reclaim' | 'blocked'

export function shouldPreserveHostClaim(
  participant: SharedParticipant | undefined,
  clientId: string,
): boolean {
  return participant?.clientId === clientId && participant.isHost
}

export function classifySeatRestore(
  membership: SharedMembership,
  participants: SharedParticipant[],
  now = Date.now(),
): SeatRestoreDecision {
  const seat = participants.find((participant) => participant.playerId === membership.playerId)
  if (!seat) return 'reclaim'
  if (seat.clientId === membership.clientId) return 'reuse'
  if (membership.isHost || seat.isHost) return 'blocked'
  return participantIsActive(seat, now) ? 'blocked' : 'reclaim'
}
