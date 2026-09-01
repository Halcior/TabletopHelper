import type { SharedParticipant } from './types'

export const SHARED_ACTIVE_SEAT_MS = 30_000
export const SHARED_VISIBLE_ONLINE_MS = 20_000

export function participantIsActive(
  participant: SharedParticipant,
  now = Date.now(),
  activeForMs = SHARED_ACTIVE_SEAT_MS,
): boolean {
  const seenAt = Date.parse(participant.lastSeenAt)
  return Number.isFinite(seenAt) && now - seenAt < activeForMs
}

export function participantIsOnline(participant: SharedParticipant, now = Date.now()): boolean {
  return participantIsActive(participant, now, SHARED_VISIBLE_ONLINE_MS)
}

export function secondsUntilSeatReclaim(participant: SharedParticipant, now = Date.now()): number {
  const seenAt = Date.parse(participant.lastSeenAt)
  if (!Number.isFinite(seenAt)) return 0
  return Math.max(0, Math.ceil((SHARED_ACTIVE_SEAT_MS - (now - seenAt)) / 1000))
}
