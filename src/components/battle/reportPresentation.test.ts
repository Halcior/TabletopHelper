import { describe, expect, it } from 'vitest'
import { leadChangeEventIds, reportHighlights } from './reportPresentation'
import type { BattlefieldReplayFrame } from '../../domain/battlefield/replay'
import type { ChronicleEntry } from '../../domain/battle/chronicle'

describe('report presentation uses recorded history', () => {
  it('marks a new sole leader without inventing a change on initialization or a tie', () => {
    const frames = [[0, 0], [5, 0], [5, 5], [5, 8], [10, 8]].map(([a, b], index) => ({ index, eventId: `e${index}`, scores: { a, b } } as unknown as BattlefieldReplayFrame))
    expect([...leadChangeEventIds(frames)]).toEqual(['e4'])
  })
  it('chooses at most three recorded highlights and preserves their event order', () => {
    const events = [
      { id: 'objective', category: 'objectives', highlight: true },
      { id: 'small', category: 'vp', highlight: true, scoreDelta: 1 },
      { id: 'big', category: 'vp', highlight: true, scoreDelta: 10 },
      { id: 'kill', category: 'kills', highlight: true },
      { id: 'lead', category: 'vp', highlight: true, scoreDelta: 5 },
    ] as ChronicleEntry[]
    expect(reportHighlights(events, new Set(['lead'])).map((entry) => entry.id)).toEqual(['big', 'kill', 'lead'])
    expect(reportHighlights([], new Set())).toEqual([])
  })
})
