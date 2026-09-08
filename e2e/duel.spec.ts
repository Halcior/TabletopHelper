import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone, resolvePriorityTargetIfNeeded } from './helpers'

test('Duel 1v1 starts as a compact two-player phone battle', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    await page.getByLabel('Guidance level').selectOption('fast')
    await page.getByRole('button', { name: 'Start locally' }).click()
    await expect(page).toHaveURL(/\/battle\//)
    await expect(page.locator('.ruleset-label')).toHaveText('Cauldron Duel 1v1')
    await expect(page.locator('.score-card')).toHaveCount(2)
    await expect(page.locator('.secondary-draw-reveal__card')).toHaveCount(2)
    await expect(page.locator('.secondary-draw-reveal__card-icon')).toHaveCount(2)
    if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/visual-secondary-reveal.png', fullPage: true })
    await dismissSecondaryReveal(page)

    await expect(page.locator('.battle-turn__mobile-meta')).toBeVisible()
    await expect(page.locator('.battle-turn__mobile-meta')).toContainText('Player I')
    await expect(page.locator('.score-card__name i')).toHaveCount(2)

    await expect(page.locator('.next-phase')).toBeVisible()
    const layout = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      nextButtonHeight: document.querySelector('.next-phase')?.getBoundingClientRect().height ?? 0,
    }))
    expect(layout.horizontalOverflow).toBe(false)
    expect(layout.nextButtonHeight).toBeGreaterThanOrEqual(44)

    await resolvePriorityTargetIfNeeded(page)
    for (let phase = 0; phase < 5; phase += 1) await page.locator('.next-phase').click()
    await expect(page.locator('.battle-turn h1')).toHaveText('End phase')
    await page.locator('.next-phase').click()
    await expect(page.getByRole('heading', { name: 'End Turn Review' })).toBeVisible()
    await page.getByRole('button', { name: 'Apply scoring' }).click()

    await expect(page.locator('.turn-handoff-summary')).toBeVisible()
    await expect(page.locator('.turn-handoff-summary__marker')).toHaveText('P')
    await expect(page.locator('.turn-handoff-next__icon')).toBeVisible()
    await expect(page.locator('.turn-review-details')).not.toHaveAttribute('open', '')
    await expect(page.locator('.turn-review-details__body')).toBeHidden()
    await expect(page.getByRole('button', { name: /End turn/ })).toBeVisible()
    if (process.env.CAPTURE_UI === '1') {
      await page.waitForTimeout(350)
      await page.screenshot({ path: 'test-results/visual-handoff.png', fullPage: true })
    }
  } finally {
    await context.close()
  }
})
