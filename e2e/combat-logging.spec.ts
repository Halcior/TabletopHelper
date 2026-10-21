import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, phone, selectPanel } from './helpers'
import fs from 'node:fs/promises'

test('mobile effective Wounds, attack summary, healing, correction, report and legacy pause recovery', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    await page.evaluate(async () => {
      const { testArmy } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { createCauldronGame } = await import('/src/rulesets/cauldronFFA3/session.ts')
      const { dispatchBattleEvent } = await import('/src/domain/battle/engine.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const armies = 'abc'.split('').map((id) => testArmy(`army-${id}`))
      armies[0].units[1].name = 'Caladius Grav-Tank'
      armies[1].units[0].name = 'Custodian Wardens'
      const game = createCauldronGame({ gameId: 'combat-mobile', armies, guidanceLevel: 'fast', secondaryDeck: 'chapter-approved', primaryDeck: 'chapter-approved-ffa', players: armies.map((army, index) => ({ id: `p-${'abc'[index]}`, name: ['Alpha', 'Bravo', 'Charlie'][index], armyId: army.id, deploymentZone: 'ABC'[index], turnPosition: index + 1, operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'meatgrinder' })) })
      await saveBattle(dispatchBattleEvent(game, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } }))
    })
    await page.goto('/battle/combat-mobile')
    await expect(page.getByRole('heading', { name: 'HOLD / REACT' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^HOLD/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gain 1 CP for Alpha' })).toBeVisible()
    await selectPanel(page, 'army')
    await page.locator('.combat-source').getByLabel('Attacking unit (optional)').selectOption('tank')
    const target = page.locator('.unit-card').filter({ has: page.getByRole('heading', { name: 'Custodian Wardens', exact: true }) })
    await target.getByRole('button', { name: '−1 W', exact: true }).click()
    await expect(target.locator('.combat-current')).toContainText('2 / 3 W')
    await expect(target.locator('.combat-vitals')).toContainText('4 / 4 models')
    await target.getByText('Detailed Combat Logging', { exact: true }).click()
    await target.getByLabel('Amount', { exact: true }).fill('2')
    await target.getByRole('button', { name: 'Apply Damage', exact: true }).click()
    await expect(target.locator('.combat-vitals')).toContainText('3 / 4 models')
    await expect(target.locator('.combat-current')).toContainText('3 / 3 W')
    await target.getByLabel('Amount', { exact: true }).fill('8')
    await target.getByLabel('Attack note (optional)').fill('Effective losses after tabletop allocation')
    await target.getByRole('button', { name: 'Apply Damage', exact: true }).click()
    await expect(target.locator('.combat-vitals')).toContainText('1 / 4 models')
    await expect(target.locator('.combat-current')).toContainText('1 / 3 W')
    await target.getByText('Detailed Combat Logging', { exact: true }).click()
    await expect(target).toContainText('Below Half Strength')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    if (process.env.CAPTURE_COMBAT === '1') {
      await fs.mkdir('docs/combat-logging', { recursive: true })
      await target.scrollIntoViewIfNeeded()
      await page.screenshot({ path: 'docs/combat-logging/army-mobile.png' })
      await page.locator('.scoreboard').screenshot({ path: 'docs/combat-logging/scoreboard-mobile.png' })
    }
    await selectPanel(page, 'log')
    const attack = page.locator('.chronicle-entry').filter({ hasText: '8 Wounds lost' })
    await expect(attack).toHaveCount(1)
    await expect(attack).toContainText('2 models destroyed')
    await expect(attack).toContainText('Caladius Grav-Tank')
    if (process.env.CAPTURE_COMBAT === '1') await attack.screenshot({ path: 'docs/combat-logging/chronicle-mobile.png' })
    await selectPanel(page, 'report')
    await expect(page.locator('.report-narrative')).toContainText('8 Wounds')
    const performer = page.locator('.performance-card').filter({ has: page.getByRole('heading', { name: 'Caladius Grav-Tank', exact: true }) })
    await expect(performer).toContainText('11 W')
    if (process.env.CAPTURE_COMBAT === '1') {
      await page.locator('.report-narrative').screenshot({ path: 'docs/combat-logging/report-mobile.png' })
      const report = await page.evaluate(async () => {
        const { buildBattleReport, battleReportMarkdown } = await import('/src/domain/battle/battleReport.ts')
        const { useBattleStore } = await import('/src/stores/battleStore.ts')
        const data = buildBattleReport(useBattleStore.getState().session!)
        return { data, markdown: battleReportMarkdown(data) }
      })
      await fs.writeFile('docs/combat-logging/example-report.json', JSON.stringify(report.data, null, 2))
      await fs.writeFile('docs/combat-logging/example-report.md', report.markdown)
    }
    await selectPanel(page, 'army')
    await target.getByRole('button', { name: '+1 W', exact: true }).click()
    await target.getByRole('button', { name: '+1 Model', exact: true }).click()
    await expect(target.locator('.combat-current')).toContainText('2 / 3 W')
    await expect(target.locator('.combat-vitals')).toContainText('2 / 4 models')
    await page.reload()
    await selectPanel(page, 'army')
    await expect(target.locator('.combat-current')).toContainText('2 / 3 W')
    await page.getByRole('button', { name: 'Open battle menu' }).click()
    await page.getByRole('menuitem', { name: 'Correct battle state', exact: true }).click()
    const correction = page.getByRole('dialog', { name: 'Correct battle state', exact: true })
    await correction.getByLabel('What is wrong?').selectOption('UNIT_COMBAT')
    await correction.getByRole('combobox', { name: 'Commander', exact: true }).selectOption('p-b')
    await correction.getByRole('combobox', { name: 'Unit', exact: true }).selectOption('infantry')
    await correction.getByRole('spinbutton', { name: 'Current model Wounds', exact: true }).fill('3')
    await correction.getByLabel('Reason', { exact: true }).fill('Accidental extra Wound')
    await correction.getByRole('button', { name: 'Record correction' }).click()
    await expect(target.locator('.combat-current')).toContainText('3 / 3 W')
    await selectPanel(page, 'log')
    const correctionEntry = page.locator('.chronicle-entry').filter({ hasText: 'Accidental extra Wound' })
    await expect(correctionEntry).toContainText('correction')
    await expect(correctionEntry).not.toContainText('restored')
    await page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      const { requestReactionHold } = await import('/src/domain/stratagems/battleIntegration.ts')
      const store = useBattleStore.getState()
      useBattleStore.setState({ session: requestReactionHold(store.session!, 'p-b', { trigger: 'CUSTOM_CONFIRMATION', context: { holdDraft: true }, definitionsByPlayer: { 'p-a': [], 'p-b': [], 'p-c': [] } }) })
    })
    await page.getByRole('button', { name: 'Close legacy pause', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Close legacy pause', exact: true })).toHaveCount(0)

    // Regression: damaging the third unit must not move it to the first card.
    // Quick Access must not shrink or reshuffle while the player is tapping.
    await selectPanel(page, 'army')
    const cards = page.locator('.unit-grid .unit-card')
    const originalOrder = await cards.locator('h3').allTextContents()
    const shortcutNames = () => page.locator('.recent-unit__identity strong').allTextContents()
    const originalShortcuts = await shortcutNames()
    const lastUnit = cards.filter({ has: page.getByRole('heading', { name: 'Remainder', exact: true }) })
    const damageButton = lastUnit.getByRole('button', { name: '−1 W', exact: true })
    await damageButton.scrollIntoViewIfNeeded()
    const initialY = (await lastUnit.boundingBox())!.y
    for (const remaining of [9, 8, 7]) {
      await damageButton.click()
      await expect(lastUnit.locator('.combat-current')).toContainText(`${remaining} / 10 W`)
      expect(await cards.locator('h3').allTextContents()).toEqual(originalOrder)
      expect(await shortcutNames()).toEqual(originalShortcuts)
      expect(Math.abs((await lastUnit.boundingBox())!.y - initialY)).toBeLessThan(2)
    }
    await page.getByRole('button', { name: 'Refresh quick access for Bravo' }).click()
    expect((await shortcutNames())[0]).toBe('Remainder')
    expect(await cards.locator('h3').allTextContents()).toEqual(originalOrder)
  } finally { await context.close() }
})

test('quick Wound controls stay independent of an open mixed-profile allocation', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    await page.evaluate(async () => {
      const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { rehydrateBattleSession } = await import('/src/domain/battle/engine.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const game = testCauldronGame()
      game.setup.gameId = 'combat-mixed'
      const army = game.setup.armies[game.state.players['p-b'].armyId!]
      army.units[0].name = 'Mixed squad'
      army.units[0].modelGroups = [{ name: 'Guard', startingCount: 3, equipment: [], stats: { wounds: 3 } }, { name: 'Veteran', startingCount: 1, equipment: [], stats: { wounds: 5 } }]
      await saveBattle(rehydrateBattleSession(game))
    })
    await page.goto('/battle/combat-mixed')
    await expect(page.getByRole('button', { name: 'Keep cards', exact: true })).toBeVisible()
    await dismissSecondaryReveal(page)
    await selectPanel(page, 'army')
    const target = page.locator('.unit-card').filter({ has: page.getByRole('heading', { name: 'Mixed squad', exact: true }) })
    await target.getByLabel('Model profile for Mixed squad').selectOption('group-0')
    await target.getByText('Detailed Combat Logging', { exact: true }).click()
    await target.getByLabel('Allocate this resolution across profiles').check()
    await target.getByLabel('Guard · wounds').fill('4')
    await target.getByLabel('Veteran · wounds').fill('2')
    await target.getByRole('button', { name: '−1 W', exact: true }).click()
    await expect(target.locator('.combat-current')).toContainText('2 / 3 W')
    await expect(target.locator('.combat-vitals')).toContainText('4 / 4 models')
    await target.getByLabel('Model profile for Mixed squad').selectOption('group-1')
    await expect(target.locator('.combat-current')).toContainText('5 / 5 W')
    await target.getByRole('button', { name: 'Apply Damage', exact: true }).click()
    await expect(target.locator('.combat-current')).toContainText('3 / 5 W')
    await expect(target.locator('.combat-vitals')).toContainText('3 / 4 models')
    await target.getByLabel('Model profile for Mixed squad').selectOption('group-0')
    await expect(target.locator('.combat-current')).toContainText('1 / 3 W')
    await selectPanel(page, 'log')
    await expect(page.locator('.chronicle-entry').filter({ hasText: '6 Wounds lost' })).toHaveCount(1)
  } finally { await context.close() }
})


test('partial casualties remain visible and net attribution is grouped by unit in report', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    await page.evaluate(async () => {
      const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { dispatchBattleEvents } = await import('/src/domain/battle/engine.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const game = testCauldronGame()
      game.setup.gameId = 'partial-attribution'
      await saveBattle(dispatchBattleEvents(game, [
        { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } },
        { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a', attackerUnitId: 'tank' } },
        { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1, destroyedByPlayerId: 'p-c', attackerUnitId: 'tank' } },
        { type: 'UNIT_MODEL_RESTORED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 1 } },
      ]))
    })
    await page.goto('/battle/partial-attribution')
    await expect(page.getByRole('navigation', { name: 'Battle panels' })).toBeVisible()
    await selectPanel(page, 'log')
    await expect(page.locator('.chronicle-entry--kills').filter({ hasText: '2 models' })).toHaveCount(1)
    await page.locator('.chronicle-filters').getByRole('button', { name: 'Combat', exact: true }).click()
    const events = page.locator('.chronicle-entry--kills')
    await expect(events).toHaveCount(2)
    await expect(events.first()).toContainText('Source: Single-model tank')
    await selectPanel(page, 'report')
    const ledger = page.getByRole('region', { name: 'Combat engagements' })
    await expect(ledger).toBeVisible()
    await expect(ledger.locator('tbody tr')).toHaveCount(1)
    await expect(ledger.locator('tbody tr').first()).toContainText('Single-model tank')
    await expect(ledger.locator('tbody tr').first()).toContainText('Four-model unit')
    await expect(ledger.locator('tbody tr').first()).toContainText('85')
    await expect(ledger.locator('tbody tr').first()).toContainText('2')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  } finally { await context.close() }
})
