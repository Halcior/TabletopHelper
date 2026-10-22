// Separate high-entropy bearer proof for seat-specific profile/mission mutations.
// The public shared participant client_id is NOT an authentication secret.
const KEY = 'tabletophelper:seat-credential:v1'
let inMemory: string | null = null

export function seatCredential(): string {
  if (inMemory) return inMemory
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(KEY)
      if (saved && /^[a-f0-9]{64}$/.test(saved)) {
        inMemory = saved
        return saved
      }
    } catch {
      throw new Error('Secure local storage is required to claim a multiplayer seat.')
    }
  }
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random numbers are required for multiplayer seat identity.')
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(KEY, value) }
    catch { throw new Error('Secure local storage is required to claim a multiplayer seat.') }
  }
  inMemory = value
  return value
}
