import { describe, expect, it } from 'vitest'
import { advanceCauldronPhase } from '../../rulesets/cauldronFFA3'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { CAULDRON_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/secondaryDefinitions'
import type { SecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import type { BattleSession } from '../battle/types'
import { buildBattleContext } from './contextEngine'

function game(...cards: SecondaryId[]): BattleSession {
  const requested = [...new Set(cards)]
  const deck = [...requested, ...CAULDRON_SECONDARY_IDS.filter((card) => !requested.includes(card))]
  return testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
}

function toEndTurn(session: BattleSession): BattleSession {
  let current = session
  while (current.state.phase !== 'END_TURN') current = advanceCauldronPhase(current)
  return current
}

function secondaryItem(session: BattleSession, cardId: SecondaryId) {
  return buildBattleContext({ session }).sections
    .flatMap((section) => section.items)
    .find((item) => item.source === 'SECONDARY' && item.relatedSecondaryId === cardId)
}

describe('manual end-turn Secondary context', () => {
  it('keeps end-turn-only checks informational during live phases', () => {
    const item = secondaryItem(game('SZEROKI_FRONT', 'ODCIECIE_ODWROTU'), 'SZEROKI_FRONT')
    expect(item?.status).toBe('INFO')
    expect(item?.actions.some((action) => action.type === 'CHECK_SECONDARY_CONDITION')).toBe(false)
  })

  it('offers scoring review only in End Turn', () => {
    const item = secondaryItem(toEndTurn(game('SZEROKI_FRONT', 'ODCIECIE_ODWROTU')), 'SZEROKI_FRONT')
    const reviewAction = item?.actions.find((action) => action.type === 'CHECK_SECONDARY_CONDITION')
    expect(item?.status).toBe('AVAILABLE')
    expect(reviewAction?.label).toBe('Review scoring')
  })
})
