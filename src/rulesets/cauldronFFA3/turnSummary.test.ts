import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase } from './session'
import { dispatchCauldronBattleEvent } from './secondary'
import { CAULDRON_SECONDARY_IDS } from './secondaryDefinitions'
import type { SecondaryId } from './secondaryTypes'
import { testCauldronGame } from './cauldronTestUtils'
import { buildCauldronTurnSummary } from './turnSummary'

describe('Cauldron turn summary', () => {
  it('collects automatic Secondary score and enemy kills from the current turn', () => {
    const deck: SecondaryId[] = ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')]
    let session = testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
    session = advanceCauldronPhase(session)
    session = advanceCauldronPhase(session)
    expect(session.state.phase).toBe('SHOOTING')

    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })

    const summary = buildCauldronTurnSummary(session, 'p-a')
    expect(summary.secondaryGained).toBe(5)
    expect(summary.primaryGained).toBe(0)
    expect(summary.pointsGained).toBe(5)
    expect(summary.scoreBefore).toBe(0)
    expect(summary.scoreAfter).toBe(5)
    expect(summary.completedSecondaries).toEqual([
      expect.objectContaining({ cardId: 'SILA_OGNIA', pointsAwarded: 5 }),
    ])
    expect(summary.kills).toEqual([
      expect.objectContaining({ victimPlayerId: 'p-b', unitId: 'infantry', unitName: 'Four-model unit' }),
    ])
  })

  it('does not call ordinary damage a kill', () => {
    let session = testCauldronGame()
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_WOUNDS_CHANGED',
      payload: { playerId: 'p-b', unitId: 'tank', woundsRemaining: 10, destroyedByPlayerId: 'p-a' },
    })

    const summary = buildCauldronTurnSummary(session, 'p-a')
    expect(summary.kills).toEqual([])
    expect(summary.pointsGained).toBe(0)
  })
})
