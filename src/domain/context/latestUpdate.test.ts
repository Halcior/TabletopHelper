import { describe, expect, it } from 'vitest'
import { requestReactionHold } from '../stratagems/battleIntegration'
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

  it('shows when a reaction window was opened by the recorded table action', () => {
    let session = testCauldronGame()
    session = dispatchCauldronBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    })
    const causeEvent = session.state.events.at(-1)!
    session = requestReactionHold(session, 'p-b', {
      trigger: 'CUSTOM_CONFIRMATION',
      context: { eventId: causeEvent.id, actingPlayerId: 'p-a' },
      definitionsByPlayer: { 'p-a': [], 'p-b': [], 'p-c': [] },
    })

    const update = buildLatestBattleUpdate(session)
    expect(update?.consequences).toContain('Reaction window opened · 1 response pending')
  })
})
