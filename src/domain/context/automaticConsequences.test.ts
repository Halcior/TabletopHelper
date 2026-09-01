import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase, dispatchCauldronBattleEvent } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { CAULDRON_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import { buildLatestAutomaticConsequence } from './automaticConsequences'
import { buildBattleContext } from './contextEngine'

function gameWithFirepowerFirst() {
  const deck = ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')]
  return testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
}

describe('automatic consequence feedback', () => {
  it('groups a physical kill, automatic Secondary score, and Wyniszczenie progress', () => {
    let session = gameWithFirepowerFirst()
    session = advanceCauldronPhase(session)
    session = advanceCauldronPhase(session)
    expect(session.state.phase).toBe('SHOOTING')

    session = dispatchCauldronBattleEvent(session, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })

    const consequence = buildLatestAutomaticConsequence(session)
    expect(consequence?.type).toBe('AUTOMATIC_CONSEQUENCE_CHAIN')
    expect(consequence?.title).toMatch(/Four-model unit destroyed/i)
    expect(consequence?.details?.some((detail) => detail.includes('Siła Ognia'))).toBe(true)
    expect(consequence?.details?.some((detail) => detail.includes('Wyniszczenie'))).toBe(true)

    const context = buildBattleContext({ session })
    expect(context.automaticEvents.filter((item) => item.relatedSecondaryId === 'SILA_OGNIA')).toHaveLength(1)
    expect(context.automaticEvents[0].type).toBe('AUTOMATIC_CONSEQUENCE_CHAIN')
  })

  it('does not create a consequence chain for an ordinary non-scoring event', () => {
    let session = gameWithFirepowerFirst()
    session = advanceCauldronPhase(session)
    session = dispatchCauldronBattleEvent(session, {
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: 'N1', controllerPlayerId: 'p-a' },
    })
    expect(buildLatestAutomaticConsequence(session)).toBeNull()
  })
})
