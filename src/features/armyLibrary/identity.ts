/** Deterministic 128-bit local→cloud mapping, including browsers on LAN HTTP.
 * This is an identity hash, never an authentication or security primitive.
 */
export const cloudMediaId = (owner: string, id: string) =>
  `account:${owner}:${id}`
export function cloudRosterId(owner: string, localId: string): string {
  const input = `TabletopHelper/army/v1/${owner}/${localId}`
  let a = 1779033703,
    b = 3144134277,
    c = 1013904242,
    d = 2773480762
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i)
    a = b ^ Math.imul(a ^ k, 597399067)
    b = c ^ Math.imul(b ^ k, 2869860233)
    c = d ^ Math.imul(c ^ k, 951274213)
    d = a ^ Math.imul(d ^ k, 2716044179)
  }
  a = Math.imul(c ^ (a >>> 18), 597399067)
  b = Math.imul(d ^ (b >>> 22), 2869860233)
  c = Math.imul(a ^ (c >>> 17), 951274213)
  d = Math.imul(b ^ (d >>> 19), 2716044179)
  const hex = [
    (a ^ b ^ c ^ d) >>> 0,
    (b ^ a) >>> 0,
    (c ^ a) >>> 0,
    (d ^ a) >>> 0,
  ]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('')
    .split('')
  hex[12] = '8'
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16)
  const s = hex.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}
