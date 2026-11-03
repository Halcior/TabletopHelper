import { useLocale } from '../../features/i18n/locale'
import { publicTableEvents } from './TableMode'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { dispatchBattleEvents, serializeBattleSession } from '../../domain/battle/engine'
import { describe, expect, it } from 'vitest'
import { leadChangeEventIds, reportHighlights } from './reportPresentation'
import type { BattlefieldReplayFrame } from '../../domain/battlefield/replay'
import type { ChronicleEntry } from '../../domain/battle/chronicle'

describe('report presentation uses recorded history', () => {
  it('publishes only highlights without notes, corrections, cards or pending decisions', () => {
    const session = dispatchBattleEvents(testCauldronGame(), [
      { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-a', note: 'PRIVATE NOTE sentinel' } },
      { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-c', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-b' } },
      { type: 'STATE_CORRECTED', payload: { correction: { kind: 'OBJECTIVE_CONTROL', objectiveId: 'N1', controllerPlayerId: 'p-a' }, reason: 'PRIVATE CORRECTION sentinel' } },
    ])
    const before = serializeBattleSession(session)
    const events = publicTableEvents(session)
    expect(events.length).toBeGreaterThan(0)
    expect(events.length).toBeLessThanOrEqual(6)
    expect(JSON.stringify(events)).not.toMatch(/PRIVATE|cardId|cardSpecificState|pending/)
    expect(events.some(event => event.description.includes('model'))).toBe(true)
    useLocale.setState({ locale: 'pl' })
    try {
      const localized = publicTableEvents(session).map(event => event.description)
      expect(localized.some(text => text.includes('Alpha → Four-model unit (Bravo)'))).toBe(true)
      expect(localized.some(text => text.includes('Bravo → Four-model unit (Charlie)'))).toBe(true)
    } finally { useLocale.setState({ locale: 'en' }) }

    expect(serializeBattleSession(session)).toBe(before)
  })
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
