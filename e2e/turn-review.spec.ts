import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, phone } from './helpers'

test('entering Centre OC on a phone previews and records the Cauldron award', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    const battleId = await page.evaluate(async () => {
      const utilsPath = '/src/rulesets/cauldronFFA3/cauldronTestUtils.ts'
      const enginePath = '/src/domain/battle/engine.ts'
      const persistencePath = '/src/persistence/database.ts'
      const definitionsPath = '/src/rulesets/cauldronFFA3/secondaryDefinitions.ts'
      const { testCauldronGame } = await import(utilsPath)
      const { dispatchBattleEvents } = await import(enginePath)
      const { saveBattle } = await import(persistencePath)
      const { CAULDRON_SECONDARY_IDS } = await import(definitionsPath)
      const first = ['DOMINACJA_CENTRUM', 'SILA_OGNIA']
      const deck = [...first, ...CAULDRON_SECONDARY_IDS.filter((id: string) => !first.includes(id))]
      const session = testCauldronGame({ secondaryDeckOrders: { 'p-a': deck } })
      const endTurn = dispatchBattleEvents(session, [{ type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } }])
      await saveBattle(endTurn)
      return endTurn.setup.gameId
    })
    await page.goto(`/battle/${battleId}`)
    await dismissSecondaryReveal(page)
    await page.locator('.next-phase').click()
    const alpha = page.getByRole('spinbutton', { name: 'Alpha' })
    await alpha.fill('12')
    await page.getByRole('spinbutton', { name: 'Bravo' }).fill('8')
    await page.getByRole('spinbutton', { name: 'Charlie' }).fill('4')
    await expect(page.getByText('Secondary preview:')).toHaveText('Secondary preview: +5 VP')
    await alpha.fill('8')
    await expect(page.getByText('Secondary preview:')).toHaveText('Secondary preview: +0 VP')
    await page.getByRole('button', { name: 'Increase OC for Alpha' }).click()
    await expect(alpha).toHaveValue('9')
    await page.getByRole('button', { name: 'Apply scoring' }).click()
    await expect(page.getByRole('region', { name: 'Turn summary' })).toContainText('+5 VP')
  } finally {
    await context.close()
  }
})
