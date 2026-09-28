import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone } from './helpers'

test('official duel selects asymmetric matrix cards and scores the first turn', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    await page.getByLabel('Primary mode').selectOption('chapter-approved-duel')
    await expect(page.getByRole('combobox', { name: 'Force Disposition' })).toHaveCount(2)
    await expect(page.getByText('Your Primary:')).toHaveCount(2)
    await expect(page.getByText('Immovable Object')).toBeVisible()
    await expect(page.getByText('Unstoppable Force')).toBeVisible()
    await page.getByLabel('Guidance level').selectOption('fast')
    await page.getByRole('button', { name: 'Start locally' }).click()
    await expect(page).toHaveURL(/\/battle\//)
    await dismissSecondaryReveal(page)
    await expect(page.locator('.ruleset-label').first()).toHaveText('Chapter Approved Duel 1v1')
    await expect(page.locator('.duel-primary-panel').first()).toContainText('Immovable Object')
    await page.getByRole('button', { name: 'objectives', exact: true }).click()
    await expect(page.locator('.objective-card')).toHaveCount(6)
    await page.getByRole('button', { name: 'overview', exact: true }).click()
    for (let phase = 0; phase < 6; phase += 1) await page.locator('.next-phase').click()
    await expect(page.getByRole('heading', { name: 'End Turn · Chapter Approved' })).toBeVisible()
    await page.locator('.duel-primary-condition').filter({ hasText: 'Control at least one central objective.' }).getByRole('checkbox').check()
    await page.getByRole('button', { name: /Confirm end of turn · \+3 VP/ }).click()
    await expect(page.locator('.duel-primary-panel')).toContainText('Reviewed · +3 VP')
    for (const button of await page.getByRole('button', { name: /Finished reviewing .* turn/ }).all()) await button.click()
    await page.getByRole('button', { name: /End turn →/ }).click()
    await expect(page.locator('.duel-primary-panel').first()).toContainText('Unstoppable Force')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  } finally { await context.close() }
})
