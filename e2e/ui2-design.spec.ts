import { expect, test, type Page } from '@playwright/test'
import { phone, selectPanel } from './helpers'
import { seedDesignBattles } from './ui2Fixtures'
import path from 'node:path'
import fs from 'node:fs/promises'

const baseline = process.env.CAPTURE_BASELINE === '1'
const capture = baseline || process.env.CAPTURE_UI2 === '1'
const destination = `docs/ui-2/${baseline ? 'before' : 'after'}`

async function image(page: Page, name: string, selector?: string) {
  if (!capture) return
  await fs.mkdir(destination, { recursive: true })
  // Tab navigation restores scroll on the next frame; let that complete first.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  if (selector) {
    await page.locator(`${selector}:visible`).evaluate((element) => window.scrollBy({ top: element.getBoundingClientRect().top - (document.querySelector('.battle-status')?.getBoundingClientRect().height ?? 72) - 12, behavior: 'instant' }))
  } else await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.screenshot({ path: `${destination}/${name}.png` })
}

test('design review uses the real Home, Setup, Import, battlefield, cards, army, Chronicle and Report', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/army-import')
    await page.locator('input[type="file"]').setInputFiles(path.resolve('test-data/1700.json'))
    await expect(page.getByRole('heading', { name: 'Adeptus Custodes' })).toBeVisible()
    await image(page, 'army-import-mobile')
    await page.getByRole('button', { name: 'Save army' }).click()
    await expect(page.getByRole('status', { name: 'Army saved' })).toBeVisible()
    await page.getByRole('status', { name: 'Army saved' }).getByRole('link', { name: 'Create battle' }).click()
    await expect(page).toHaveURL(/\/battle\/setup/)
    await expect(page.getByRole('heading', { name: /New Cauldron Duel/ })).toBeVisible()
    await image(page, 'setup-mobile')
    if (capture && !baseline) {
      await page.getByLabel('Primary mode').selectOption('chapter-approved-duel')
      await page.getByRole('button', { name: 'Next: Commanders' }).click()
      await image(page, 'setup-commanders-mobile')
      await page.getByRole('button', { name: 'Next: Battlefield' }).click()
      await image(page, 'setup-battlefield-mobile')
    }
    const ids = await seedDesignBattles(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Resume battle/i })).toBeVisible()
    await image(page, 'home-mobile')
    await page.goto(`/battle/${ids.ffa}`)
    await expect(page.locator('.score-card')).toHaveCount(3)
    await image(page, 'dashboard-mobile')
    await selectPanel(page, 'objectives')
    await expect(page.locator('.objective-node')).toHaveCount(7)
    await image(page, 'objectives-ffa-mobile', '.battlefield-frame')
    if (capture && !baseline) {
      await page.getByRole('button', { name: 'Edit Layout', exact: true }).click()
      await page.getByLabel('Field width (cm)', { exact: true }).fill('160')
      await image(page, 'ffa-editor-mobile', '.battlefield-editor')
      await page.getByRole('button', { name: 'Cancel layout edits', exact: true }).click()
      await page.locator('.objective-node[data-objective-id="CENTER"]').click()
      await image(page, 'objective-control-mobile', '.battlefield-frame')
      await page.getByRole('button', { name: 'Close objective controls', exact: true }).click()
      await page.getByRole('button', { name: 'Replay', exact: true }).click()
      await image(page, 'replay-mobile', '.battlefield-replay')
      await page.getByRole('button', { name: 'Return to live', exact: true }).click()
    }
    await selectPanel(page, 'cards')
    await image(page, 'secondary-mobile', '.official-secondary-panel')
    await selectPanel(page, 'army')
    await image(page, 'army-mobile', '.army-heading')
    await selectPanel(page, 'log')
    await expect(page.getByRole('heading', { name: 'Battle Chronicle' })).toBeVisible()
    await image(page, 'chronicle-mobile', '.chronicle-panel')
    await selectPanel(page, 'report')
    await expect(page.getByRole('heading', { name: 'Battle Report', exact: true })).toBeVisible()
    await image(page, 'report-mobile', '.battle-report')
    if (capture && !baseline) await image(page, 'performance-mobile', '.report-performance')
    await page.goto(`/battle/${ids.duel}`)
    await expect(page.getByRole('button', { name: 'Keep cards', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Keep cards', exact: true }).click()
    await selectPanel(page, 'objectives')
    await image(page, 'official-duel-mobile', '.battlefield-frame')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/battle/${ids.ffa}`)
    await expect(page.locator('.score-card')).toHaveCount(3)
    await image(page, 'dashboard-desktop')
    if (capture && !baseline) {
      await page.setViewportSize({ width: 390, height: 844 })
      // A synthetic completed state through the same event projection, for presentation QA.
      await page.evaluate(async () => {
        const { useBattleStore } = await import('/src/stores/battleStore.ts')
        useBattleStore.getState().dispatch({ type: 'GAME_ENDED', payload: {} })
      })
      await expect(page.getByRole('button', { name: 'View Battle Report', exact: true })).toBeVisible()
      await image(page, 'finished-battle-mobile', '.battle-terminal-content')
      await page.getByRole('button', { name: 'View Battle Report', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Battle Report', exact: true })).toBeVisible()
      await image(page, 'finished-report-mobile', '.battle-report')
    }
  } finally { await context.close() }
})
