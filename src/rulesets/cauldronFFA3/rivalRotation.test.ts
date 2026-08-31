import { describe, expect, it } from 'vitest'
import { getCurrentRival, getCurrentRivalPlayerId, getRivalMapping } from './rivalRotation'
import { testCauldronGame } from './cauldronTestUtils'

describe('Cauldron rival rotation', () => {
  it('maps every slot correctly in odd and even rounds', () => {
    for (const round of [1, 3, 5]) {
      expect(getCurrentRival('A', round)).toBe('B')
      expect(getCurrentRival('B', round)).toBe('C')
      expect(getCurrentRival('C', round)).toBe('A')
    }
    for (const round of [2, 4]) {
      expect(getCurrentRival('A', round)).toBe('C')
      expect(getCurrentRival('B', round)).toBe('A')
      expect(getCurrentRival('C', round)).toBe('B')
    }
  })

  it('resolves player IDs independently of fixed turn order', () => {
    const session = testCauldronGame()
    expect(getCurrentRivalPlayerId(session, 'p-a', 1)).toBe('p-b')
    expect(getCurrentRivalPlayerId(session, 'p-a', 2)).toBe('p-c')
    expect(getCurrentRivalPlayerId(session, 'p-b', 1)).toBe('p-c')
    expect(getCurrentRivalPlayerId(session, 'p-b', 2)).toBe('p-a')
    expect(getCurrentRivalPlayerId(session, 'p-c', 1)).toBe('p-a')
    expect(getCurrentRivalPlayerId(session, 'p-c', 2)).toBe('p-b')
    expect(getRivalMapping(session, 1)).toEqual({ 'p-a': 'p-b', 'p-b': 'p-c', 'p-c': 'p-a' })
  })
})
