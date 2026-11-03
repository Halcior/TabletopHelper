import { expect, test } from '@playwright/test'
import { selectPanel } from './helpers'

for (const width of [375, 1440]) test(`FFA ${width}px: locked targets, separate timing, rotation, reload and both enemies at CENTER`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: width === 375 ? 812 : 1000 }, isMobile: width < 600, hasTouch: width < 600 })
  const page = await context.newPage()
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
      let session = createCauldronGame({
        gameId: 'ffa-secondary-ui', guidanceLevel: 'fast', armies,
        primaryDeck: 'chapter-approved-ffa', secondaryDeck: 'chapter-approved', objectiveLayout: 'expanded-7',
        secondaryDeckOrders: Object.fromEntries(['p-a', 'p-b', 'p-c'].map((id) => [id, order])),
        players: armies.map((army: { id: string }, index: number) => ({
          id: `p-${'abc'[index]}`, name: `Player ${'ABC'[index]}`, armyId: army.id,
          deploymentZone: 'ABC'[index], turnPosition: index + 1,
          operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'battlefield-dominance',
        })),
      })
      const enginePath = '/src/domain/battle/engine.ts'
      const secondaryPath = '/src/rulesets/cauldronFFA3/secondary.ts'
      const { dispatchBattleEvents } = await import(enginePath)
      const { officialDrawEvents } = await import(secondaryPath)
      session = dispatchBattleEvents(session, officialDrawEvents(session, 'p-a', ['OFFICIAL_ASSASSINATION'], 1, 1, 1))
      await saveBattle(session)
      return session.setup.gameId as string
    })
    await page.goto(`/battle/${gameId}`)
    const reveal = page.getByRole('dialog', { name: 'Your Secondary Missions', exact: true })
    await expect(reveal).toContainText('Target Rival: army-b faction — Player B')
    await expect(reveal).toContainText('ALL ENEMIES')
    await expect(reveal).toContainText('BATTLEFIELD OBJECTIVE')
    await page.getByRole('button', { name: 'Keep cards', exact: true }).click()
    const beacon = page.locator('.official-secondary-panel .secondary-card').filter({ has: page.getByRole('heading', { name: 'Beacon', exact: true }) })
    const centre = page.locator('.official-secondary-panel .secondary-card').filter({ has: page.getByRole('heading', { name: 'Centre Ground', exact: true }) })
    const assassination = page.locator('.official-secondary-panel .secondary-card').filter({ has: page.getByRole('heading', { name: 'Assassination', exact: true }) })
    const bring = page.locator('.official-secondary-panel .secondary-card').filter({ has: page.getByRole('heading', { name: 'Bring It Down', exact: true }) })
    await expect(assassination.locator('.secondary-scope')).toContainText('Target Rival: army-b faction — Player B')
    await expect(beacon.locator('.secondary-scope')).toContainText('Score at: End of army-b faction — Player B’s turn')
    await expect(beacon.locator('.secondary-scope')).not.toContainText('Target Rival:')
    await expect(centre).toContainText('ALL ENEMIES')
    await expect(centre).not.toContainText('Target Rival:')
    await beacon.getByLabel('Chosen own unit').selectOption('infantry')
    await beacon.getByRole('button', { name: 'Save and lock choice' }).click()
    await expect(beacon).toContainText('Locked choice: Four-model unit')
    await expect(beacon.getByLabel('Chosen own unit')).toHaveCount(0)
    await page.evaluate(async () => {
      const storePath = '/src/stores/battleStore.ts'
      const { useBattleStore } = await import(storePath)
      const store = useBattleStore.getState()
      store.dispatch({ type: 'ROUND_STARTED', payload: { round: 2 } })
      useBattleStore.getState().dispatch({ type: 'TURN_STARTED', payload: { playerId: 'p-a' } })
      const secondaryPath = '/src/rulesets/cauldronFFA3/secondary.ts'
      const { officialDrawEvents } = await import(secondaryPath)
      const current = useBattleStore.getState().session
      for (const event of officialDrawEvents(current, 'p-a', ['OFFICIAL_BRING_IT_DOWN'], 1, 2, 2)) useBattleStore.getState().dispatch(event)
    })
    await expect(page.getByRole('status', { name: 'Rival rotation' })).toContainText('Your Current Rival is now army-c faction — Player C')
    await expect(reveal).toContainText('Target Rival: army-b faction — Player B')
    await expect(reveal).toContainText('Target Rival: army-c faction — Player C')
    await expect(reveal).toContainText('Different from Current Rival. This card keeps its original target.')
    await page.getByRole('button', { name: 'Keep cards', exact: true }).click()
    await expect(bring.locator('.secondary-scope')).toContainText('Assigned in Round 2')
    await page.evaluate(async () => {
      const storePath = '/src/stores/battleStore.ts'
      const { useBattleStore } = await import(storePath)
      useBattleStore.getState().dispatch({ type: 'PHASE_CHANGED', payload: { phase: 'END_TURN' } })
    })
    // Let the store's queued snapshots finish before reloading. A direct save here
    // can be overwritten by an earlier queued Command-phase snapshot.
    await expect.poll(() => page.evaluate(async () => {
      const persistencePath = '/src/persistence/database.ts'
      const { getBattle } = await import(persistencePath)
      return (await getBattle('ffa-secondary-ui'))?.state.phase
    })).toBe('END_TURN')
    await page.reload()
    await expect(page.locator('.official-primary-panel .current-rival')).toContainText('Current Rival — Round 2')
    await expect(page.locator('.official-primary-panel .current-rival')).toContainText('army-c faction — Player C')
    await expect(page.getByRole('status', { name: 'Rival rotation' })).toBeHidden()
    await expect(page.locator('.official-primary-panel .current-rival')).toContainText('Your Primary Rival for this battle round.')
    await expect(assassination.locator('.secondary-scope')).toContainText('Target Rival: army-b faction — Player B')
    await expect(assassination.locator('.secondary-scope')).toContainText('Different from Current Rival.')
    await expect(bring.locator('.secondary-scope')).toContainText('Target Rival: army-c faction — Player C')
    await expect(beacon.locator('.secondary-scope')).toContainText('Scoring timing differs from Current Rival.')
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
    for (const element of await page.locator('.secondary-scope:visible').all()) {
      expect(await element.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    await page.locator('.next-phase').click()
    await expect(page.getByRole('heading', { name: 'End Turn Review' })).toBeVisible()
    await expect(assassination.locator('.secondary-scope')).toContainText('Target Rival: army-b faction — Player B')
    await expect(assassination).toContainText('Eligible window')
    await expect(bring.locator('.secondary-scope')).toContainText('Target Rival: army-c faction — Player C')
    await expect(centre.locator('.secondary-scope')).toContainText('ALL ENEMIES')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: `test-results/ffa-rival-${width}-review.png`, fullPage: true })
    await page.getByRole('button', { name: 'Back to turn', exact: true }).click()
    await selectPanel(page, 'log')
    await expect(page.getByRole('heading', { name: 'Battle Chronicle', exact: true })).toBeVisible()
    await selectPanel(page, 'overview')
    if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: `test-results/ffa-rival-${width}-battle.png`, fullPage: true })
  } finally {
    await context.close().catch(() => {})
  }
})
