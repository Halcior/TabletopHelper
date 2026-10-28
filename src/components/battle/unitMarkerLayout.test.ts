import { describe, expect, it } from 'vitest'
import { groupUnitMarkers, placeUnitMarkers } from './unitMarkerLayout'

describe('tactical marker display layout', () => {
  it('keeps objective hit targets clear without changing source coordinates', () => {
    const units = Array.from({ length: 9 }, (_, index) => ({ key: `unit-${index}`, point: { x: .5, y: .5 } }))
    const snapshot = JSON.stringify(units)
    const layout = placeUnitMarkers(units, [{ x: .5, y: .5 }], 720, 480)
    expect(JSON.stringify(units)).toBe(snapshot)
    for (const position of layout.values()) expect(Math.hypot(position.x - 360, position.y - 240)).toBeGreaterThanOrEqual(49)
    const points = [...layout.values()]
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThanOrEqual(43)
    expect(placeUnitMarkers([...units].reverse(), [{ x: .5, y: .5 }], 720, 480)).toEqual(layout)
  })
})


it('groups sixty nearby units deterministically before placing display markers', () => {
  const units = Array.from({ length: 60 }, (_, index) => ({ key: `unit-${index}`, point: { x: .5 + index / 100000, y: .5 } }))
  const groups = groupUnitMarkers(units, 320, 210)
  expect(groups).toHaveLength(1)
  expect(groups[0].members).toHaveLength(60)
  expect(groupUnitMarkers([...units].reverse(), 320, 210)).toEqual(groups)
})
