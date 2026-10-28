import type { BoardPoint } from '../../domain/battlefield/types'

/** Display offsets are disposable pixels; they never change saved board coordinates. */
export function placeUnitMarkers(units: Array<{ key: string; point: BoardPoint }>, objectives: BoardPoint[], width: number, height: number) {
  const w = Math.max(80, width), h = Math.max(80, height)
  const placed: Array<{ x: number; y: number }> = []
  const result = new Map<string, { x: number; y: number; crowded: boolean }>()
  for (const unit of [...units].sort((a, b) => a.key.localeCompare(b.key))) {
    const origin = { x: unit.point.x * w, y: unit.point.y * h }
    let best = { ...origin, crowded: true }
    search: for (let radius = 0; radius <= Math.max(w, h); radius += 24) {
      const count = radius === 0 ? 1 : Math.max(8, Math.ceil(2 * Math.PI * radius / 44))
      for (let i = 0; i < count; i++) {
        const x = Math.max(22, Math.min(w - 22, origin.x + radius * Math.cos(i * 2 * Math.PI / count)))
        const y = Math.max(22, Math.min(h - 22, origin.y + radius * Math.sin(i * 2 * Math.PI / count)))
        if (objectives.some(p => Math.hypot(x - p.x * w, y - p.y * h) < 49)) continue
        if (placed.some(p => Math.hypot(x - p.x, y - p.y) < 43)) continue
        best = { x, y, crowded: false }
        break search
      }
    }
    placed.push(best)
    result.set(unit.key, best)
  }
  return result
}

/** Collapse nearby saved locations instead of spreading a horde across the table. */
export function groupUnitMarkers(units: Array<{ key: string; point: BoardPoint }>, width: number, height: number) {
  const groups: Array<{ key: string; point: BoardPoint; members: string[] }> = []
  for (const unit of [...units].sort((a, b) => a.key.localeCompare(b.key))) {
    const group = groups.find(group => Math.hypot((group.point.x - unit.point.x) * width, (group.point.y - unit.point.y) * height) < 38)
    if (group) group.members.push(unit.key)
    else groups.push({ key: unit.key, point: unit.point, members: [unit.key] })
  }
  return groups.map(group => group.members.length > 1 ? { ...group, key: `cluster:${group.key}` } : group)
}
