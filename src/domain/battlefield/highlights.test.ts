import { it, expect } from 'vitest'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { dispatchBattleEvent, undoLastAction, rehydrateBattleSession } from '../battle/engine'
import { battleHighlights } from './highlights'
it('replays score and objectives without inventing unit positions; undo and refresh preserve facts', () => {
  let s = testCauldronGame()
  s = dispatchBattleEvent(s, { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'adjustment', delta: 8 } })
  const frames = battleHighlights(s)
  expect(frames.at(-1)?.scores['p-a']).toBe(8)
  expect(frames.every(f => !f.unitTracking && !f.combat)).toBe(true)
  expect(battleHighlights(rehydrateBattleSession(s))).toEqual(frames)
  expect(battleHighlights(undoLastAction(s))).toHaveLength(0)
})
it('does not highlight an elimination that was restored', () => {
  let s = dispatchBattleEvent(testCauldronGame(), { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank', destroyedByPlayerId: 'p-a' } })
  expect(battleHighlights(s).some(f => f.combat?.eliminated)).toBe(true)
  s = dispatchBattleEvent(s, { type: 'UNIT_MODEL_RESTORED', payload: { playerId: 'p-b', unitId: 'tank', amount: 1 } })
  expect(battleHighlights(s).some(f => f.combat?.eliminated)).toBe(false)
})
