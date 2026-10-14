import { selectPanel } from './helpers'
import { expect, test } from '@playwright/test'
import { phone } from './helpers'
import fs from 'node:fs/promises'

test('mobile casualty attribution, chronicle filters, offline report exports, undo and reload', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    const gameId = await page.evaluate(async () => {
      const { createCauldronGame } = await import('/src/rulesets/cauldronFFA3/session.ts')
      const { testArmy } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { dispatchBattleEvents } = await import('/src/domain/battle/engine.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const armies = 'abc'.split('').map((id) => testArmy(`army-${id}`))
      armies[0].units[1].name = 'Caladius Grav-Tank'
      armies[0].units[1].points = 230
      armies[1].units[1].name = 'Doomsday Ark'
      armies[1].units[1].points = 400
      let session = createCauldronGame({ gameId: 'chronicle-mobile', armies, guidanceLevel: 'fast', secondaryDeck: 'chapter-approved', primaryDeck: 'chapter-approved-ffa', players: armies.map((army, index) => ({ id: `p-${'abc'[index]}`, name: ['Custodes', 'Necrons', 'Aeldari'][index], armyId: army.id, deploymentZone: 'ABC'[index], turnPosition: index + 1, operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: 'meatgrinder' })) })
      session = dispatchBattleEvents(session, [{ type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } }])
      await saveBattle(session)
      return session.setup.gameId
    })
    await page.goto(`/battle/${gameId}`)
    await selectPanel(page, 'army')
    await page.locator('.combat-source').getByLabel('Attacking unit (optional)').selectOption('tank')
    await page.getByLabel('Combat note (applies to following losses)').isVisible().then(async (visible) => { if (!visible) await page.getByText('Optional combat note', { exact: true }).click() })
    await page.getByLabel('Combat note (applies to following losses)').fill('Confirmed final volley')
    const target = page.locator('.unit-card').filter({ has: page.getByRole('heading', { name: 'Doomsday Ark', exact: true }) })
    await target.getByRole('button', { name: '−1 Model', exact: true }).click()
    await expect(page.locator('.battle-kill-notice')).toContainText('Caladius Grav-Tank')
    await selectPanel(page, 'report')
    await expect(page.getByRole('heading', { name: 'Battle Report', exact: true })).toBeVisible()
    const caladius = page.locator('.performance-card').filter({ has: page.getByRole('heading', { name: 'Caladius Grav-Tank', exact: true }) })
    await expect(caladius).toContainText('174%')
    await expect(caladius).toContainText('400')
    expect(await page.evaluate(() => [...document.querySelectorAll('.battle-report, .report-heading, .report-ranking, .performance-card')].some((element) => element.getBoundingClientRect().right > innerWidth))).toBe(false)
    if (process.env.CAPTURE_UI === '1') {
      await expect(page.locator('.battle-kill-notice')).toHaveCount(0)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: 'test-results/chronicle-report-mobile.png' })
      await caladius.scrollIntoViewIfNeeded()
      await caladius.screenshot({ path: 'test-results/chronicle-performance-mobile.png' })
    }
    await context.setOffline(true)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON', exact: true }).click()
    const file = await download
    const report = JSON.parse(await fs.readFile((await file.path())!, 'utf8'))
    expect(report.performance.units.find((unit: { name: string }) => unit.name === 'Caladius Grav-Tank').combatRoi).toBeCloseTo(173.913)
    const markdown = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export Markdown', exact: true }).click()
    expect(await fs.readFile((await (await markdown).path())!, 'utf8')).toContain('Confirmed final volley')
    await context.setOffline(false)
    await selectPanel(page, 'log')
    await expect(page.getByRole('heading', { name: 'Battle Chronicle' })).toBeVisible()
    await page.getByRole('button', { name: 'Kills', exact: true }).click()
    await expect(page.locator('.chronicle-entry')).toHaveCount(1)
    await expect(page.locator('.chronicle-entry')).toContainText('Doomsday Ark')
    await page.getByLabel('Chronicle player').selectOption('p-c')
    await expect(page.locator('.chronicle-entry')).toHaveCount(0)
    await page.getByLabel('Chronicle player').selectOption('all')
    if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/chronicle-timeline-mobile.png' })
    await page.reload()
    await expect(page.locator('.battle-kill-notice')).toHaveCount(0)
    await selectPanel(page, 'report')
    await expect(caladius).toContainText('174%')
    await page.getByRole('button', { name: 'Open battle menu' }).click()
    await page.getByRole('menuitem', { name: 'Undo last action', exact: true }).click()
    await expect(caladius.locator('.performance-kpis strong').nth(1)).toHaveText('0')
    await page.getByRole('button', { name: 'Open battle menu' }).click()
    await page.getByRole('menuitem', { name: 'Redo action', exact: true }).click()
    await expect(caladius).toContainText('174%')
    await expect(page.locator('.battle-kill-notice')).toHaveCount(0)
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.battle-report')).toBeVisible()
    await expect(page.locator('.report-export')).toBeHidden()
  } finally { await context.close() }
})

test('mobile reduced motion and score feedback stay quiet after restoring history', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const id = await page.evaluate(async () => {
      const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const session = testCauldronGame()
      await saveBattle(session)
      return session.setup.gameId
    })
    await page.goto(`/battle/${id}`)
    await expect(page.locator('.score-card')).toHaveCount(3)
    await page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      useBattleStore.getState().dispatch({ type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 5 } })
    })
    const pulse = page.locator('.live-score-pulse')
    await expect(pulse).toHaveText('5')
    expect(await pulse.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
    await expect(page.locator('.live-score-delta')).toHaveText('+5')
    await page.reload()
    await expect(page.locator('.live-score-pulse')).toHaveCount(0)
    await expect(page.locator('.live-score-delta')).toHaveCount(0)
  } finally { await context.close() }
})
