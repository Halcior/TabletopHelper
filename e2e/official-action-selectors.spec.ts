import { expect, test } from '@playwright/test'
import { phone } from './helpers'

for (const playerCount of [2, 3] as const) {
  test(`Chapter Approved ${playerCount === 2 ? 'Duel' : 'FFA'} selects roster units and battlefield mission targets`, async ({ browser }) => {
    const { context, page } = await phone(browser)
    try {
      await page.goto('/')
      const gameId = await page.evaluate(async (count) => {
        const sessionPath = '/src/rulesets/cauldronFFA3/session.ts'
        const utilsPath = '/src/rulesets/cauldronFFA3/cauldronTestUtils.ts'
        const enginePath = '/src/domain/battle/engine.ts'
        const secondaryPath = '/src/rulesets/cauldronFFA3/secondary.ts'
        const definitionsPath = '/src/rulesets/cauldronFFA3/officialSecondaryDefinitions.ts'
        const layoutsPath = '/src/domain/battlefield/layouts.ts'
        const persistencePath = '/src/persistence/database.ts'
        const { createCauldronGame } = await import(sessionPath)
        const { testArmy } = await import(utilsPath)
        const { dispatchBattleEvents } = await import(enginePath)
        const { createSecondaryRefillEvents } = await import(secondaryPath)
        const { OFFICIAL_SECONDARY_IDS } = await import(definitionsPath)
        const { defaultBattlefieldGeometry } = await import(layoutsPath)
        const { saveBattle } = await import(persistencePath)
        const first = ['OFFICIAL_CLEANSE', 'OFFICIAL_PLUNDER', 'OFFICIAL_BEACON', 'OFFICIAL_A_TEMPTING_TARGET']
        const order = [...first, ...OFFICIAL_SECONDARY_IDS.filter((id: string) => !first.includes(id))]
        const armies = 'abc'.slice(0, count).split('').map((id) => testArmy(`army-${id}`))
        armies[0].units.push({ ...structuredClone(armies[0].units[0]), id: 'backup', name: 'Second infantry' })
        armies[1].units[0].name = 'Enemy only unit'
        let session = createCauldronGame({
          gameId: `official-action-selectors-${count}`, guidanceLevel: 'fast', armies, secondaryDeck: 'chapter-approved',
          secondaryDeckOrders: Object.fromEntries('abc'.slice(0, count).split('').map((id) => [`p-${id}`, order])),
          players: armies.map((army: { id: string }, index: number) => ({
            id: `p-${'abc'[index]}`, name: `Player ${'ABC'[index]}`, armyId: army.id,
            deploymentZone: 'ABC'[index], turnPosition: index + 1, operationalPlanId: 'WYNISZCZENIE',
          })),
        })
        const refill = createSecondaryRefillEvents(session, 'p-a', 2)
        session = dispatchBattleEvents(session, [
          { type: 'ROUND_STARTED', payload: { round: 2 } },
          { type: 'TURN_STARTED', payload: { playerId: 'p-a' } },
          ...refill,
          { type: 'UNIT_BATTLESHOCK_CHANGED', payload: { playerId: 'p-a', unitId: 'tank', battleShocked: true } },
          { type: 'UNIT_DESTROYED', payload: { playerId: 'p-a', unitId: 'remainder', destroyedByPlayerId: 'p-b' } },
        ])
        if (count === 3) session = dispatchBattleEvents(session, [{ type: 'BATTLEFIELD_LAYOUT_CHANGED', payload: {
          geometry: {
            ...defaultBattlefieldGeometry(session.setup),
            footprints: { 'AC-NEUTRAL': { kind: 'rectangle', widthCm: 21, heightCm: 15, rotation: 0 } },
          },
        } }])
        await saveBattle(session)
        return session.setup.gameId as string
      }, playerCount)
      await page.goto(`/battle/${gameId}`)
      await page.getByRole('button', { name: 'Keep cards', exact: true }).click()
      const panel = page.locator('.official-secondary-panel')
      const beacon = panel.locator('.secondary-card').filter({ has: page.getByRole('heading', { name: 'Beacon', exact: true }) })
      await expect(beacon.getByLabel('Chosen own unit')).toHaveJSProperty('tagName', 'SELECT')
      await expect(beacon.getByLabel('Chosen own unit')).not.toContainText('Enemy only unit')
      await beacon.getByLabel('Chosen own unit').selectOption('backup')
      await beacon.getByRole('button', { name: 'Save and lock choice' }).click()
      await expect(beacon).toContainText('Locked choice: Second infantry')
      const tempting = panel.locator('.secondary-card').filter({ has: page.getByRole('heading', { name: 'A Tempting Target', exact: true }) })
      const temptingObjective = tempting.getByRole('combobox')
      await expect(temptingObjective.locator('option[value$="-HOME"]')).toHaveCount(0)
      const rivalObjective = playerCount === 2 ? 'N1' : 'CENTER'
      await temptingObjective.selectOption(rivalObjective)
      await tempting.getByRole('button', { name: playerCount === 2 ? 'Save choice' : 'Save and lock choice', exact: true }).click()
      if (playerCount === 2) await expect(tempting).toContainText(/Saved choice:.*N1/)
      else await expect(tempting).toContainText('Locked choice:')
      await page.evaluate(async () => {
        const storePath = '/src/stores/battleStore.ts'
        const { useBattleStore } = await import(storePath)
        useBattleStore.getState().dispatch({ type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } })
      })
      const cleanse = panel.locator('.secondary-card').filter({ has: page.getByRole('heading', { name: 'Cleanse', exact: true }) })
      const plunder = panel.locator('.secondary-card').filter({ has: page.getByRole('heading', { name: 'Plunder', exact: true }) })
      for (const card of [cleanse, plunder]) {
        const unit = card.getByLabel('Acting unit')
        await expect(unit).toHaveJSProperty('tagName', 'SELECT')
        await expect(unit.locator('option')).toHaveCount(3)
        await expect(unit).toContainText('Four-model unit')
        await expect(unit).toContainText('Second infantry')
        await expect(unit).not.toContainText('Single-model tank')
        await expect(unit).not.toContainText('Remainder')
        await expect(unit).not.toContainText('Enemy only unit')
      }
      const objectiveId = playerCount === 2 ? 'N1' : 'AB-NEUTRAL'
      await cleanse.getByLabel('Acting unit').selectOption('infantry')
      await expect(cleanse.getByLabel('Non-home objective')).toHaveJSProperty('tagName', 'SELECT')
      await expect(cleanse.getByLabel('Non-home objective').locator('option[value$="-HOME"]')).toHaveCount(0)
      await cleanse.getByLabel('Non-home objective').selectOption(objectiveId)
      await cleanse.getByRole('button', { name: 'Start action in Shooting phase' }).click()
      await expect(cleanse).toContainText('1 action(s) started this turn')
      await expect(cleanse.getByLabel('Acting unit').locator('option[value="infantry"]')).toHaveCount(0)
      await expect(cleanse.getByLabel('Non-home objective').locator(`option[value="${objectiveId}"]`)).toHaveCount(0)
      await plunder.getByLabel('Acting unit').selectOption('backup')
      const terrainId = playerCount === 3 ? 'AC-NEUTRAL' : 'Western Ruins'
      if (playerCount === 3) {
        await plunder.getByRole('combobox', { name: /Terrain area/ }).selectOption(terrainId)
        await expect(plunder.getByRole('button', { name: 'Start action in Shooting phase' })).toBeDisabled()
        await plunder.getByLabel('The entire terrain footprint is wholly outside own Territory, without touching its boundary').check()
      } else await plunder.getByRole('textbox', { name: /Terrain area/ }).fill(terrainId)
      await plunder.getByRole('button', { name: 'Start action in Shooting phase' }).click()
      await expect(plunder).toContainText('1 action(s) started this turn')
      const starts = await page.evaluate(async () => {
        const storePath = '/src/stores/battleStore.ts'
        const { useBattleStore } = await import(storePath)
        return useBattleStore.getState().session.state.events
          .filter((event: { type: string; payload: { action?: string } }) => event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_OFFICIAL_ACTION_STARTED')
          .map((event: { payload: { data: { unit: string; target: string } } }) => ({ unit: event.payload.data.unit, target: event.payload.data.target }))
      })
      expect(starts).toEqual([{ unit: 'infantry', target: objectiveId }, { unit: 'backup', target: terrainId }])
      await page.reload()
      await expect(beacon).toContainText('Locked choice: Second infantry')
      await expect(cleanse).toContainText('1 action(s) started this turn')
      await expect(plunder).toContainText('1 action(s) started this turn')
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
      if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: `test-results/visual-official-action-selectors-${playerCount}.png`, fullPage: true })
    } finally {
      await context.close()
    }
  })
}
