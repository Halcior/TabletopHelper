import { describe, expect, it } from 'vitest'
import {
  battlefieldView, defaultBattlefieldGeometry, DISPOSITION_ORDER, OFFICIAL_BOARD_SOURCE, OFFICIAL_LAYOUTS,
  officialObjectivesForPair, PREVIOUS_OFFICIAL_BOARD_SOURCE_ID,
} from './layouts'
import type { BattleSetup } from '../battle/types'
import { DISPOSITIONS } from '../../rulesets/cauldronFFA3/duelPrimary'

// Counts of objective glyphs by printed page (Event Companion 1.3, pp. 9–53).
const PDF_COUNTS = [5,5,5, 6,6,6, 5,5,5, 5,5,5, 6,6,6, 6,6,6, 6,6,6,
  6,6,6, 6,6,6, 5,5,5, 6,6,6, 5,5,5, 6,6,6, 5,5,5, 5,5,5]

describe('Event Companion objective glyph transcription', () => {
  it('covers all 45 source pages and both orders of each pairing', () => {
    expect(Object.keys(OFFICIAL_LAYOUTS)).toHaveLength(45)
    for (const dispositionA of DISPOSITIONS) {
      for (const dispositionB of DISPOSITIONS) {
        for (const layout of [1, 2, 3]) {
          const key = [...[dispositionA, dispositionB].sort((a, b) =>
            DISPOSITION_ORDER.indexOf(a) - DISPOSITION_ORDER.indexOf(b)), 'ABC'[layout - 1]].join('|')
          const source = OFFICIAL_LAYOUTS[key]
          expect(source, key).toBeDefined()
          const expected = PDF_COUNTS[source.page - 9]
          const objectives = officialObjectivesForPair(dispositionA, dispositionB, layout)
          expect(objectives, key).toHaveLength(expected)
          expect(new Set(objectives.map((o) => o.id)).size, key).toBe(expected)
          expect(objectives.filter((o) => o.id.startsWith('CENTER-')), key).toHaveLength(source.objectives.central.length)
          expect(objectives.filter((o) => o.id.startsWith('EXPANSION-')), key).toHaveLength(source.objectives.expansion.length)
          const setup = {
            players: [{ id: 'a' }, { id: 'b' }],
            turnOrder: ['b', 'a'],
            objectives,
            battlefieldSourceId: OFFICIAL_BOARD_SOURCE.id,
            rulesetConfig: {
              primaryDeck: 'chapter-approved-duel', officialLayout: layout,
              playerConfigs: { a: { forceDisposition: dispositionA }, b: { forceDisposition: dispositionB } },
            },
          } as BattleSetup
          const geo = defaultBattlefieldGeometry(setup, 'B')
          expect(geo.positions['B-HOME']).toEqual(source.objectives.homeAttacker[0])
          expect(geo.positions['A-HOME']).toEqual(source.objectives.homeDefender[0])
          for (const point of Object.values(geo.positions)) {
            expect(point).not.toBeNull()
            expect(point!.x).toBeGreaterThanOrEqual(0)
            expect(point!.x).toBeLessThanOrEqual(1)
            expect(point!.y).toBeGreaterThanOrEqual(0)
            expect(point!.y).toBeLessThanOrEqual(1)
            const view90 = battlefieldView(geo.widthCm, geo.heightCm, false)
            const view270 = battlefieldView(geo.widthCm, geo.heightCm, true)
            const p90 = view90.toDisplay(point!)
            expect(p90).toEqual({ x: 1 - point!.y, y: point!.x })
            expect(view270.toDisplay(point!)).toEqual({ x: 1 - p90.x, y: 1 - p90.y })
          }
        }
      }
    }
  })

  it.each([
    [1, 'A', [{ x: 0.730586, y: 0.122821 }, { x: 0.280897, y: 0.860889 }]],
    [3, 'C', [{ x: 0.665486, y: 0.145331 }, { x: 0.346461, y: 0.850038 }]],
  ])('retains both compact PDF expansion diamonds in Purge the Foe mirror layout %s', (layout, variant, positions) => {
    const pair = ['purge-the-foe', 'purge-the-foe', layout] as const
    expect(officialObjectivesForPair(...pair).map(o => o.id)).toEqual(['A-HOME', 'B-HOME', 'CENTER-1', 'CENTER-2', 'EXPANSION-1', 'EXPANSION-2'])
    expect(officialObjectivesForPair(...pair, PREVIOUS_OFFICIAL_BOARD_SOURCE_ID)).toHaveLength(4)
    expect(OFFICIAL_LAYOUTS[`purge-the-foe|purge-the-foe|${variant}`].objectives.expansion).toEqual(positions)
  })

  it('rejects unknown dispositions and layout variants', () => {
    expect(() => officialObjectivesForPair('invalid', 'purge-the-foe', 1)).toThrow()
    expect(() => officialObjectivesForPair('purge-the-foe', 'purge-the-foe', 4)).toThrow()
  })
})
