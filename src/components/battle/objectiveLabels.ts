export type ObjectiveLabelPoint = { id: string; x: number; y: number; owner?: string }
export type ObjectiveLabel = { id: string; x: number; y: number; width: number; height: number }

/** Display-only label placement in CSS pixels. Never changes saved marker coordinates. */
export function placeObjectiveLabels(points: ObjectiveLabelPoint[], width: number, height: number): { labels: ObjectiveLabel[]; overflowIds: string[] } {
  if (width <= 0 || height <= 0) return { labels: [], overflowIds: points.map((point) => point.id) }
  const labels: ObjectiveLabel[] = []
  const overflowIds: string[] = []
  const markerBoxes = points.map((point) => ({ x: point.x * width - 23, y: point.y * height - 23, width: 46, height: 46 }))
  const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width + 3 && a.x + a.width + 3 > b.x && a.y < b.y + b.height + 3 && a.y + a.height + 3 > b.y
  for (const point of points) {
    const w = Math.min(128, Math.max(64, point.id.length * 7.8 + 12, (point.owner?.length ?? 0) * 7 + 12)), h = point.owner ? 36 : 22
    const x = point.x * width, y = point.y * height
    const candidates = [
      [x - w / 2, y + 27], [x - w / 2, y - h - 27],
      [x + 27, y - h / 2], [x - w - 27, y - h / 2],
      [x + 27, y + 27], [x - w - 27, y + 27],
      [x + 27, y - h - 27], [x - w - 27, y - h - 27],
    ]
    const fits = ([left, top]: number[]) => left >= 3 && top >= 3 && left + w <= width - 3 && top + h <= height - 3 && ![...markerBoxes, ...labels].some((box) => intersects({ x: left, y: top, width: w, height: h }, box))
    let position = candidates.find(fits)
    if (!position) {
      const free: number[][] = []
      for (let top = 3; top + h <= height - 3; top += 8) for (let left = 3; left + w <= width - 3; left += 8) if (fits([left, top])) free.push([left, top])
      position = free.sort((a, b) => Math.hypot(a[0] + w / 2 - x, a[1] + h / 2 - y) - Math.hypot(b[0] + w / 2 - x, b[1] + h / 2 - y))[0]
    }
    if (position) labels.push({ id: point.id, x: position[0], y: position[1], width: w, height: h })
    else overflowIds.push(point.id)
  }
  return { labels, overflowIds }
}
