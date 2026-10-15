import { describe, expect, it } from 'vitest'
import officialData from './officialLayouts.json'
import { officialObjectivesForPair } from './layouts'
import { DISPOSITIONS } from '../../rulesets/cauldronFFA3/duelPrimary'

describe('Pinned GW objective count and mission pairing', () => {
  it('matches all 45 published layouts without emitting phantom objective IDs', () => {
    for (const dispositionA of DISPOSITIONS) {
      for (const dispositionB of DISPOSITIONS) {
        for (const layout of [1, 2, 3]) {
          const key = [...[dispositionA, dispositionB].sort((a, b) => {
            const order = ['take-and-hold', 'purge-the-foe', 'disruption', 'reconnaissance', 'priority-assets']
            return order.indexOf(a) - order.indexOf(b)
          }), 'ABC'[layout - 1]].join('|')
          const source = officialData.layouts[key as keyof typeof officialData.layouts]
          expect(source, key).toBeDefined()
          const expected = 2 + source.objectives.central.length + source.objectives.expansion.length
          const objectives = officialObjectivesForPair(dispositionA, dispositionB, layout)
          expect(objectives, key).toHaveLength(expected)
          expect(new Set(objectives.map((o) => o.id)).size, key).toBe(expected)
          expect(objectives.filter((o) => o.id.startsWith('CENTER-')), key).toHaveLength(source.objectives.central.length)
          expect(objectives.filter((o) => o.id.startsWith('EXPANSION-')), key).toHaveLength(source.objectives.expansion.length)
        }
      }
    }
  })

  it('handles the official 4-objective pairing without fabricated expansion markers', () => {
    const objectives = officialObjectivesForPair('purge-the-foe', 'purge-the-foe', 1)
    expect(objectives.map((objective) => objective.id)).toEqual(['A-HOME', 'B-HOME', 'CENTER-1', 'CENTER-2'])
  })

  it('rejects unknown dispositions and layout variants', () => {
    expect(() => officialObjectivesForPair('invalid', 'purge-the-foe', 1)).toThrow()
    expect(() => officialObjectivesForPair('purge-the-foe', 'purge-the-foe', 4)).toThrow()
  })
})
