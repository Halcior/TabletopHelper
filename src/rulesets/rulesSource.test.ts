import { describe, expect, it } from 'vitest'
import { testCauldronGame } from './cauldronFFA3/cauldronTestUtils'
import type { CauldronConfig } from './cauldronFFA3/types'
import { rulesForSession } from './rulesSource'

describe('saved battle source presentation', () => {
  it('keeps an untagged legacy save custom without applying new-game defaults or changing any state', () => {
    const session = testCauldronGame()
    const config = session.setup.rulesetConfig as CauldronConfig
    delete config.mode
    delete config.primaryDeck
    delete config.secondaryDeck
    delete config.ffaCpPolicy
    const before = JSON.stringify(session)
    const rules = rulesForSession(session)
    expect(rules.source).toBe('community')
    expect(rules.title).toBe('Cauldron FFA 3')
    expect(rules.primary).toContain('Operational Plans')
    expect(rules.secondary).toContain('15 cards')
    expect(JSON.stringify(session)).toBe(before)
  })

  it('does not label the original FFA Primary profile as Balanced FFA v1', () => {
    const session = testCauldronGame()
    const config = session.setup.rulesetConfig as CauldronConfig
    config.primaryDeck = 'chapter-approved-ffa'
    config.secondaryDeck = 'chapter-approved'
    delete config.officialPrimaryBalance
    const before = JSON.stringify(session)
    expect(rulesForSession(session)).toMatchObject({ source: 'community', title: 'Community FFA 3 · original profile', primary: '11th edition FFA · original house profile' })
    expect(JSON.stringify(session)).toBe(before)
  })
})
