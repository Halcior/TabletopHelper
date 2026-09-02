import { describe, expect, it } from 'vitest'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { dispatchBattleEvent } from './engine'
import { selectRecentUnits } from './recentUnits'

describe('recent unit selection', () => {
  it('returns distinct units in most-recent-first order', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-a' },
    })
    session = dispatchBattleEvent(session, {
      type: 'UNIT_WOUNDS_CHANGED',
      payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 13, destroyedByPlayerId: 'p-a' },
    })
    session = dispatchBattleEvent(session, {
      type: 'BATTLESHOCK_TEST_RESOLVED',
      payload: { playerId: 'p-b', unitId: 'infantry', passed: false },
    })

    expect(selectRecentUnits(session, 'p-b')).toEqual([
      { playerId: 'p-b', unitId: 'infantry' },
      { playerId: 'p-b', unitId: 'tank' },
    ])
  })

  it('filters by owner and respects the limit', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, {
      type: 'UNIT_WOUNDS_CHANGED',
      payload: { playerId: 'p-a', unitId: 'tank', woundsRemaining: 12 },
    })
    session = dispatchBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 },
    })
    session = dispatchBattleEvent(session, {
      type: 'UNIT_WOUNDS_CHANGED',
      payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 12 },
    })

    expect(selectRecentUnits(session, 'p-b', 1)).toEqual([{ playerId: 'p-b', unitId: 'tank' }])
  })
})
