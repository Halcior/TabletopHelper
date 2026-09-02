import { describe, expect, it } from 'vitest'
import { dispatchBattleEvent } from './engine'
import { buildScoringAudit } from './scoringAudit'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'

describe('scoring audit', () => {
  it('separates ordinary adjustments from exact host corrections', () => {
    let session = testCauldronGame()
    session = dispatchBattleEvent(session, { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'adjustment', delta: 2 } })
    session = dispatchBattleEvent(session, {
      type: 'STATE_CORRECTED',
      payload: { correction: { kind: 'SCORE', playerId: 'p-b', category: 'primary', value: 10 }, reason: 'Round review correction' },
    })

    expect(buildScoringAudit(session)).toEqual([
      expect.objectContaining({ playerId: 'p-a', points: 2, corrected: false }),
      expect.objectContaining({ playerId: 'p-b', setTo: 10, corrected: true, label: 'Round review correction' }),
    ])
  })
})
