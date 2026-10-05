import { expect, test } from '@playwright/test'
import { phone } from './helpers'

test('mobile FFA locks Beacon, retains its Rival after reload, and checks both enemies at CENTER', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    const gameId = await page.evaluate(async () => {
      const sessionPath = '/src/rulesets/cauldronFFA3/session.ts'
      const utilsPath = '/src/rulesets/cauldronFFA3/cauldronTestUtils.ts'
      const definitionsPath = '/src/rulesets/cauldronFFA3/officialSecondaryDefinitions.ts'
      const persistencePath = '/src/persistence/database.ts'
      const { createCauldronGame } = await import(sessionPath)
      const { testArmy } = await import(utilsPath)
      const { OFFICIAL_SECONDARY_IDS } = await import(definitionsPath)
      const { saveBattle } = await import(persistencePath)
      const first = ['OFFICIAL_BEACON', 'OFFICIAL_CENTRE_GROUND']
      const order = [...first, ...OFFICIAL_SECONDARY_IDS.filter((id: string) => !first.includes(id))]
      const armies = ['a', 'b', 'c'].map((id) => testArmy(`army-${id}`))
      const session = createCauldronGame({
        gameId: 'ffa-secondary-ui', guidanceLevel: 'fast', armies,
        primaryDeck: 'chapter-approved-ffa', secondaryDeck: 'chapter-approved', objectiveLayout: 'expanded-7',
        secondaryDeckOrders: Object.fromEntries(['p-a', 'p-b', 'p-c'].map((id) => [id, order])),
        players: armies.map((army: { id: string }, index: number) => ({
          id: `p-${'abc'[index]}`, name: `Player ${'ABC'[index]}`, armyId: army.id,
          deploymentZone: 'ABC'[index], turnPosition: index + 1,
          operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'battlefield-dominance',
        })),
      })
      await saveBattle(session)
      return session.setup.gameId as string
    })
    await page.goto(`/battle/${gameId}`)
    await page.getByRole('button', { name: 'Keep cards', exact: true }).click()
    const beacon = page.locator('.official-secondary-panel .secondary-card').filter({ has: page.getByRole('heading', { name: 'Beacon', exact: true }) })
    const centre = page.locator('.official-secondary-panel .secondary-card').filter({ has: page.getByRole('heading', { name: 'Centre Ground', exact: true }) })
    await expect(beacon).toContainText('Target Rival: Player B · B-HOME')
    await expect(centre).toContainText('Enemy scope: All opponents')
    await expect(centre).not.toContainText('Target Rival:')
    await beacon.getByLabel('Chosen own unit').selectOption('infantry')
    await beacon.getByRole('button', { name: 'Save and lock choice' }).click()
    await expect(beacon).toContainText('Locked choice: Four-model unit')
    await expect(beacon.getByLabel('Chosen own unit')).toHaveCount(0)
    await page.evaluate(async () => {
      const storePath = '/src/stores/battleStore.ts'
      const persistencePath = '/src/persistence/database.ts'
      const { useBattleStore } = await import(storePath)
      const { saveBattle } = await import(persistencePath)
      const store = useBattleStore.getState()
      store.dispatch({ type: 'ROUND_STARTED', payload: { round: 2 } })
      useBattleStore.getState().dispatch({ type: 'TURN_STARTED', payload: { playerId: 'p-a' } })
      useBattleStore.getState().dispatch({ type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
      await saveBattle(useBattleStore.getState().session)
    })
    await page.reload()
    await expect(page.locator('.official-primary-panel')).toContainText('Current Rival: Player C · C-HOME · Battle Round 2')
    await expect(beacon).toContainText('Target Rival: Player B · B-HOME')
    await expect(beacon).toContainText('Locked choice: Four-model unit')
    await centre.getByLabel('Own qualifying unit within 3″ of CENTER').check()
    await centre.getByLabel('Player B · closest enemy unit to CENTER').selectOption('outside-6')
    await centre.getByLabel('Player C · closest enemy unit to CENTER').selectOption('within-3')
    await expect(centre.getByRole('button', { name: /^Condition met · score/ })).toBeDisabled()
    await centre.getByLabel('Player C · closest enemy unit to CENTER').selectOption('within-6')
    await expect(centre.getByRole('button', { name: 'Condition met · score 3 VP', exact: true })).toBeEnabled()
    await centre.getByLabel('Player C · closest enemy unit to CENTER').selectOption('outside-6')
    await expect(centre.getByRole('button', { name: 'Condition met · score 5 VP', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/visual-ffa-secondary-balance.png', fullPage: true })
  } finally {
    await context.close()
  }
})
