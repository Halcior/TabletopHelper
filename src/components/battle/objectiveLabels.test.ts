import { describe, expect, it } from 'vitest'
import { placeObjectiveLabels, type ObjectiveLabelPoint } from './objectiveLabels'

describe('display-only objective labels', () => {
  const points: ObjectiveLabelPoint[] = [
    { id: 'A-HOME', x: .15, y: .15, owner: 'Commander A' },
    { id: 'B-HOME', x: .85, y: .15 },
    { id: 'C-HOME', x: .5, y: .86 },
    { id: 'AB-NEUTRAL', x: .5, y: .2 },
    { id: 'AC-NEUTRAL', x: .2, y: .63 },
    { id: 'BC-NEUTRAL', x: .8, y: .63 },
    { id: 'CENTER', x: .5, y: .5 },
  ]
  for (const [width, height] of [[288, 192], [316, 211], [356, 237], [720, 480]]) {
    it(`keeps labels within ${width}×${height}, without overlaps or moving markers`, () => {
      const before = structuredClone(points)
      const { labels, overflowIds } = placeObjectiveLabels(points, width, height)
      expect(points).toEqual(before)
      expect(new Set([...labels.map((label) => label.id), ...overflowIds])).toEqual(new Set(points.map((point) => point.id)))
      for (const label of labels) {
        expect(label.x).toBeGreaterThanOrEqual(0)
        expect(label.y).toBeGreaterThanOrEqual(0)
        expect(label.x + label.width).toBeLessThanOrEqual(width)
        expect(label.y + label.height).toBeLessThanOrEqual(height)
        for (const other of labels.filter((other) => other.id !== label.id)) expect(label.x >= other.x + other.width || label.x + label.width <= other.x || label.y >= other.y + other.height || label.y + label.height <= other.y).toBe(true)
      }
    })
  }
  it('retains every ID at coincident and edge coordinates, including cramped fields', () => {
    const crowded = ['A-HOME', 'B-HOME', 'N1', 'N2', 'N3', 'CENTER'].map((id) => ({ id, x: 0, y: 1 }))
    for (const [width, height] of [[180, 60], [0, 0]]) {
      const result = placeObjectiveLabels(crowded, width, height)
      expect([...result.labels.map((label) => label.id), ...result.overflowIds].sort()).toEqual(crowded.map((point) => point.id).sort())
    }
  })
})
