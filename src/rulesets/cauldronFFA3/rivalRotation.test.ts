import { describe, expect, it } from 'vitest'
import { getCurrentRival, getCurrentRivalPlayerId, getRivalMapping } from './rivalRotation'
import { testCauldronGame } from './cauldronTestUtils'
import { dispatchBattleEvent, deserializeBattleSession, serializeBattleSession } from '../../domain/battle/engine'
import { rivalRotationChange } from '../../components/battle/RivalRotationNotice'

describe('Cauldron rival rotation', () => {
  it('only announces an appended round that actually changes the viewed player’s rival', () => {
    const first = testCauldronGame()
    const second = dispatchBattleEvent(first, { type: 'ROUND_STARTED', payload: { round: 2 } })
    expect(rivalRotationChange(first, second, 'p-a')).toMatchObject({ round: 2, playerId: 'p-a', rivalId: 'p-c' })
    expect(rivalRotationChange(first, second, 'p-b')).toMatchObject({ rivalId: 'p-a' })
    expect(rivalRotationChange(second, second, 'p-a')).toBeUndefined()
    expect(rivalRotationChange(second, deserializeBattleSession(serializeBattleSession(second)), 'p-a')).toBeUndefined()
    expect(rivalRotationChange(second, first, 'p-a')).toBeUndefined()
    const third = dispatchBattleEvent(first, { type: 'ROUND_STARTED', payload: { round: 3 } })
    expect(rivalRotationChange(first, third, 'p-a')).toBeUndefined()
    const otherGame = { ...second, setup: { ...second.setup, gameId: 'other' } }
    expect(rivalRotationChange(first, otherGame, 'p-a')).toBeUndefined()
    const replacement = { ...second, state: { ...second.state, events: second.state.events.slice(1) } }
    expect(rivalRotationChange(first, replacement, 'p-a')).toBeUndefined()
  })
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
