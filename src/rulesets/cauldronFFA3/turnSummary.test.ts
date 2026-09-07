import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase } from './session'
import { dispatchCauldronBattleEvent } from './secondary'
import { CAULDRON_SECONDARY_BY_ID, CAULDRON_SECONDARY_IDS } from './secondaryDefinitions'
import type { SecondaryId } from './secondaryTypes'
import { testCauldronGame } from './cauldronTestUtils'
import { buildCauldronTurnSummary } from './turnSummary'

describe('Cauldron turn summary', () => {
  it('collects automatic Secondary score and enemy kills from the current turn', () => {
    const deck: SecondaryId[] = ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')]
    const expectedVp = CAULDRON_SECONDARY_BY_ID.SILA_OGNIA.vp
    let session = testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
    session = advanceCauldronPhase(session)
    session = advanceCauldronPhase(session)
    expect(session.state.phase).toBe('SHOOTING')

    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })

    const summary = buildCauldronTurnSummary(session, 'p-a')
    expect(summary.secondaryGained).toBe(expectedVp)
    expect(summary.primaryGained).toBe(0)
    expect(summary.pointsGained).toBe(expectedVp)
    expect(summary.scoreBefore).toBe(0)
    expect(summary.scoreAfter).toBe(expectedVp)
    expect(summary.completedSecondaries).toEqual([
      expect.objectContaining({ cardId: 'SILA_OGNIA', pointsAwarded: expectedVp }),
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

  it('only credits a destroyed unit when the summarized player recorded the final casualty', () => {
    let session = testCauldronGame()
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a' },
    })
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-c' },
    })

    expect(buildCauldronTurnSummary(session, 'p-a').kills).toEqual([])

    let creditedSession = testCauldronGame()
    creditedSession = dispatchCauldronBattleEvent(creditedSession, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-c' },
    })
    creditedSession = dispatchCauldronBattleEvent(creditedSession, {
      type: 'UNIT_MODEL_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a' },
    })

    expect(buildCauldronTurnSummary(creditedSession, 'p-a').kills).toEqual([
      expect.objectContaining({ victimPlayerId: 'p-b', unitId: 'infantry' }),
    ])
  })

  it('clears casualty credit after a model restoration or exact state correction', () => {
    let session = testCauldronGame()
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_MODEL_RESTORED',
      payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 },
    })
    expect(buildCauldronTurnSummary(session, 'p-a').kills).toEqual([])

    session = dispatchCauldronBattleEvent(session, {
      type: 'STATE_CORRECTED',
      payload: {
        correction: { kind: 'UNIT_MODELS', playerId: 'p-b', unitId: 'infantry', value: 0 },
        reason: 'Corrected at the table',
      },
    })
    expect(buildCauldronTurnSummary(session, 'p-a').kills).toEqual([])
  })
})
