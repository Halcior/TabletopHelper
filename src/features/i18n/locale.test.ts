import { narrativeCopy, reportMarkdownCopy } from './reportCopy'
import { buildBattleReport, battleReportMarkdown } from '../../domain/battle/battleReport'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { OFFICIAL_SECONDARY_IDS } from '../../rulesets/cauldronFFA3/officialSecondaryDefinitions'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialLocale, LANGUAGE_KEY, t, useLocale } from './locale'
import { clockCopy } from '../battleClock/copy'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SecondaryScope } from '../../components/battle/RivalClarity'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { testArmy } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { dispatchBattleEvents, serializeBattleSession } from '../../domain/battle/engine'

afterEach(() => { useLocale.setState({ locale: 'en' }); vi.unstubAllGlobals() })
describe('presentation language', () => {
  it('keeps English source and preserves whitespace, placeholders and literal user punctuation', () => {
    expect(t('Target Rival: Death Guard — Player B')).toBe('Target Rival: Death Guard — Player B')
    useLocale.setState({ locale: 'pl' })
    expect(t('  Current Rival  ')).toBe('  Bieżący rywal  ')
    const name = 'Player $& [A] (test) — ą'
    expect(t(`Target Rival: ${name}`, 'Target Rival: {0}')).toBe(`Rywal karty: ${name}`)
    expect(t(`Gain 1 CP for ${name}`, 'Gain 1 CP for {0}')).toBe(`Dodaj 1 CP graczowi ${name}`)
    expect(t(name)).toBe(name)
    expect(t(undefined)).toBeUndefined()
    expect(t('toString')).toBe('toString')
    expect(clockCopy().pass).toBe('Przekaż czas')
  })
  it('localizes report prose and Markdown without altering canonical report data', () => {
    const report = buildBattleReport(testCauldronGame())
    const before = JSON.stringify(report)
    expect(narrativeCopy(report).join(' ')).toContain('Live preview')
    expect(reportMarkdownCopy(report)).toContain('## Army performance')
    useLocale.setState({ locale: 'pl' })
    expect(narrativeCopy(report)).toEqual(report.narrative)
    expect(reportMarkdownCopy(report)).toBe(battleReportMarkdown(report))
    expect(JSON.stringify(report)).toBe(before)
  })
  it('restores a local language choice and tolerates denied storage', () => {
    const storage = { getItem: vi.fn(() => 'pl'), setItem: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    expect(initialLocale()).toBe('pl')
    useLocale.getState().setLocale('en')
    expect(storage.setItem).toHaveBeenCalledWith(LANGUAGE_KEY, 'en')
    storage.getItem.mockImplementation(() => { throw new Error('denied') })
    storage.setItem.mockImplementation(() => { throw new Error('denied') })
    vi.stubGlobal('navigator', { language: 'pl-PL' })
    expect(initialLocale()).toBe('pl')
    expect(() => useLocale.getState().setLocale('pl')).not.toThrow()
  })
  it('translates old/new FFA target and timing scopes while preserving the session exactly', () => {
    const armies = ['a', 'b', 'c'].map(id => testArmy(id))
    let session = createCauldronGame({ gameId: 'language-test', armies, guidanceLevel: 'fast', secondaryDeck: 'chapter-approved',
      secondaryDeckOrders: { 'p-a': ['OFFICIAL_ASSASSINATION', 'OFFICIAL_DISPLAY_OF_MIGHT', ...OFFICIAL_SECONDARY_IDS.filter(id => id !== 'OFFICIAL_ASSASSINATION' && id !== 'OFFICIAL_DISPLAY_OF_MIGHT')] },
      players: armies.map((army, i) => ({ id: `p-${'abc'[i]}`, name: ['Bartek', 'Ready $&', 'Michał'][i], armyId: army.id, deploymentZone: 'ABC'[i] as 'A' | 'B' | 'C', turnPosition: (i + 1) as 1 | 2 | 3, operationalPlanId: 'WYNISZCZENIE' })),
    })
    session = dispatchBattleEvents(session, [{ type: 'ROUND_STARTED', payload: { round: 2 } }, { type: 'TURN_STARTED', payload: { playerId: 'p-a' } }])
    const before = serializeBattleSession(session)
    useLocale.setState({ locale: 'pl' })
    const markup = renderToStaticMarkup(createElement(SecondaryScope, { session, playerId: 'p-a', cardId: 'OFFICIAL_ASSASSINATION' }))
    expect(markup).toContain('Rywal karty: b faction — Ready $&amp;')
    expect(markup).toContain('Przypisano w rundzie 1')
    expect(markup).toContain('Inny niż bieżący rywal')
    expect(markup).not.toContain('Locked until')
    const all = renderToStaticMarkup(createElement(SecondaryScope, { session, playerId: 'p-a', cardId: 'OFFICIAL_DISPLAY_OF_MIGHT' }))
    expect(all).toContain('WSZYSCY WROGOWIE')
    expect(all).toContain('obie wrogie armie')
    expect(all).not.toContain('Rywal karty:')
    expect(serializeBattleSession(session)).toBe(before)
  })
})
