import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone } from './helpers'

test('three commanders can choose different 11th edition Primary missions', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    await page.getByRole('button', { name: /FFA 3/ }).click()
    await page.getByLabel('Primary mode').selectOption('chapter-approved-ffa')
    const primaryPickers = page.getByLabel('11th edition Primary')
    await expect(primaryPickers).toHaveCount(3)
    await primaryPickers.nth(0).selectOption('gather-intel')
    await primaryPickers.nth(1).selectOption('meatgrinder')
    await primaryPickers.nth(2).selectOption('sabotage')
    await expect(page.getByRole('combobox', { name: 'Operational Plan', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await page.getByLabel('Guidance level').selectOption('fast')
    await page.getByRole('button', { name: 'Start locally' }).click()
    await expect(page).toHaveURL(/\/battle\//)
    await dismissSecondaryReveal(page)
    await expect(page.locator('.score-card')).toHaveCount(3)
    await expect(page.locator('.official-primary-panel h2').first()).toHaveText('Gather Intel')
    await expect(page.locator('.ruleset-label').last()).toContainText('Gather Intel')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)

    for (let index = 0; index < 6; index += 1) await page.locator('.next-phase').click()
    await expect(page.getByRole('heading', { name: 'End Turn Review' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Gather Intel' })).toBeVisible()
    await page.getByRole('button', { name: 'Apply scoring' }).click()
    await expect(page.locator('.turn-handoff-summary')).toBeVisible()
    await page.getByRole('button', { name: /End turn/ }).click()
    await expect(page.locator('.official-primary-panel h2').first()).toHaveText('Meatgrinder')
  } finally {
    await context.close()
  }
})
