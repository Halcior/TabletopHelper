import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from '../../domain/battle/engine'
import { getWyniszczenieProgress, modelDestroyedValue } from './casualties'
import { testArmy, testCauldronGame } from './cauldronTestUtils'

describe('Cauldron Wyniszczenie casualties', () => {
  it('uses exactly 10% of the current Rival starting army value', () => {
    expect(getWyniszczenieProgress(testCauldronGame(), 'p-a').threshold).toBe(140)
    expect(getWyniszczenieProgress(testCauldronGame({ points: [1400, 1700, 1500] }), 'p-a').threshold).toBe(170)
  })

  it('keeps fractional model values exact without per-model rounding', () => {
    const infantry = testArmy('army').units[0]
    expect(modelDestroyedValue(infantry)).toBe(42.5)
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-a' },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(42.5)
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-a' },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(85)
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a' },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(170)
  })

  it('scores a single-model unit only after destruction, never for partial wounds', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 7, destroyedByPlayerId: 'p-a' },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(0)
    session = dispatchBattleEvent(session, {
      type: 'UNIT_WOUNDS_CHANGED', payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 0, destroyedByPlayerId: 'p-a' },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(225)
  })

  it('ignores casualties inflicted on someone other than the current Rival', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-c', unitId: 'infantry', amount: 4, destroyedByPlayerId: 'p-a' },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(0)
  })

  it('reduces net progress for restored models and does not double count re-destruction', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a' },
    })
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_RESTORED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(42.5)
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-a' },
    })
    expect(getWyniszczenieProgress(session, 'p-a').destroyedValue).toBe(85)
  })
})
