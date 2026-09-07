import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone } from './helpers'

test('Duel 1v1 starts as a compact two-player phone battle', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    await page.getByLabel('Guidance level').selectOption('fast')
    await page.getByRole('button', { name: 'Start locally' }).click()
    await expect(page).toHaveURL(/\/battle\//)
    await expect(page.locator('.ruleset-label')).toHaveText('Cauldron Duel 1v1')
    await expect(page.locator('.score-card')).toHaveCount(2)
    await dismissSecondaryReveal(page)

    await expect(page.locator('.next-phase')).toBeVisible()
    const layout = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      nextButtonHeight: document.querySelector('.next-phase')?.getBoundingClientRect().height ?? 0,
    }))
    expect(layout.horizontalOverflow).toBe(false)
    expect(layout.nextButtonHeight).toBeGreaterThanOrEqual(44)

    for (let phase = 0; phase < 5; phase += 1) await page.locator('.next-phase').click()
    await expect(page.locator('.battle-turn h1')).toHaveText('End phase')
    await page.locator('.next-phase').click()
    await expect(page.getByRole('heading', { name: 'End Turn Review' })).toBeVisible()
    await page.getByRole('button', { name: 'Apply scoring' }).click()

    await expect(page.locator('.turn-handoff-summary')).toBeVisible()
    await expect(page.locator('.turn-review-details')).not.toHaveAttribute('open', '')
    await expect(page.locator('.turn-review-details__body')).toBeHidden()
    await expect(page.getByRole('button', { name: /End turn/ })).toBeVisible()
  } finally {
    await context.close()
  }
})
