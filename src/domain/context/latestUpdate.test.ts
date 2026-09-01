import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase, dispatchCauldronBattleEvent } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { CAULDRON_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { buildLatestBattleUpdate } from './latestUpdate'

function gameWithFirepowerFirst() {
  const deck: SecondaryId[] = ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')]
  return testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
}

describe('latest battle update summary', () => {
  it('summarizes objective control changes without inventing scoring', () => {
    let session = testCauldronGame()
    session = dispatchCauldronBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    })

    const update = buildLatestBattleUpdate(session)
    expect(update?.title).toMatch(/N1 → Alpha/i)
    expect(update?.detail).toBe('Objective control updated.')
    expect(update?.consequences).toEqual([])
  })

  it('groups a kill with automatic Secondary and Operational Plan progress', () => {
    let session = gameWithFirepowerFirst()
    session = advanceCauldronPhase(session)
    session = advanceCauldronPhase(session)
    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })

    const update = buildLatestBattleUpdate(session)
    expect(update?.title).toMatch(/Four-model unit destroyed/i)
    expect(update?.consequences.some((item) => item.includes('Siła Ognia'))).toBe(true)
    expect(update?.consequences.some((item) => item.includes('Wyniszczenie'))).toBe(true)
  })
})
