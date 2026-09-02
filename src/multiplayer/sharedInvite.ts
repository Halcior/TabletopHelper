import { isValidRoomCode, normalizeRoomCode } from './roomCode'

export function buildSharedInviteUrl(origin: string, roomCode: string): string {
  const code = normalizeRoomCode(roomCode)
  const url = new URL('/shared', origin)
  if (isValidRoomCode(code)) url.searchParams.set('room', code)
  return url.toString()
}

export function roomCodeFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get('room') ?? ''
  const code = normalizeRoomCode(value)
  return isValidRoomCode(code) ? code : null
}
