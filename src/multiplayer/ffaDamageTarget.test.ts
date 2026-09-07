import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase, dispatchCauldronBattleEvent, getCurrentRivalPlayerId } from '../rulesets/cauldronFFA3'
import { testCauldronGame } from '../rulesets/cauldronFFA3/cauldronTestUtils'
import { CAULDRON_SECONDARY_IDS } from '../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../rulesets/cauldronFFA3/secondaryTypes'
import { authorizeSharedMutation } from './sharedEventPolicy'
import type { SharedMembership } from './types'

function membership(playerId: string): SharedMembership {
  return {
    roomId: 'room-1',
    roomCode: 'ABC234',
    battleId: 'cauldron-test',
    clientId: `client-${playerId}`,
    playerId,
    isHost: false,
  }
}

describe('FFA opponent damage flow', () => {
  it('lets the active commander damage a non-Rival opponent without awarding Rival-only kill VP', () => {
    const deck: SecondaryId[] = ['SILA_OGNIA', ...CAULDRON_SECONDARY_IDS.filter((id) => id !== 'SILA_OGNIA')]
    let before = testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
    before = advanceCauldronPhase(before)
    before = advanceCauldronPhase(before)

    expect(before.state.phase).toBe('SHOOTING')
    expect(getCurrentRivalPlayerId(before, 'p-a')).toBe('p-b')

    const after = dispatchCauldronBattleEvent(before, {
      type: 'UNIT_DESTROYED',
      payload: { playerId: 'p-c', unitId: 'infantry', destroyedByPlayerId: 'p-a' },
    })

    const generated = after.state.events.slice(before.state.events.length)
    expect(after.state.players['p-c'].units.infantry.destroyed).toBe(true)
    expect(generated.some((event) => event.type === 'SCORE_ADJUSTED' && event.payload.playerId === 'p-a' && event.payload.category === 'secondary')).toBe(false)
    expect(generated.some((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_COMPLETED')).toBe(false)
    expect(authorizeSharedMutation(before, after, membership('p-a')).allowed).toBe(true)
  })
})
