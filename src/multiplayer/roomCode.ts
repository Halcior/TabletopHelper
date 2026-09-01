const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LENGTH = 6

export function normalizeRoomCode(value: string): string {
  return value.toLocaleUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH)
}

export function isValidRoomCode(value: string): boolean {
  const normalized = normalizeRoomCode(value)
  return normalized.length === ROOM_CODE_LENGTH && [...normalized].every((character) => ALPHABET.includes(character))
}

export function createRoomCode(random = Math.random): string {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => (
    ALPHABET[Math.floor(random() * ALPHABET.length)]
  )).join('')
}
