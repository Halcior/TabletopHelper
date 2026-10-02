import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone } from './helpers'

test('selects the official Tactical deck when starting a Duel', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    await page.getByLabel('Secondary deck').selectOption('chapter-approved')
    await page.getByLabel('Guidance level').selectOption('fast')
    await page.getByRole('button', { name: 'Start locally' }).click()
    await expect(page).toHaveURL(/\/battle\//)
    await expect(page.getByRole('button', { name: 'Keep cards' })).toBeVisible()
    await dismissSecondaryReveal(page)
    await expect(page.getByRole('button', { name: 'Keep cards' })).toBeHidden()
    await expect(page.locator('.official-secondary-panel').first()).toBeVisible()
    await expect(page.locator('.official-secondary-panel .secondary-card')).toHaveCount(2)
    await expect(page.locator('.official-secondary-panel').first()).toContainText('/ 15')
    await expect(page.locator('.ruleset-label').last()).toContainText('Tactical')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/visual-official-tactical.png', fullPage: true })
    for (let index = 0; index < 6; index += 1) await page.locator('.next-phase').click()
    await expect(page.getByRole('heading', { name: 'End Turn Review' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply Primary scoring' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('chooses two Fixed cards for each commander', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    await page.getByLabel('Secondary deck').selectOption('chapter-approved')
    await page.getByLabel('Secondary strategy').selectOption('fixed')
    await expect(page.getByLabel('Fixed Secondary 1')).toHaveCount(2)
    await page.getByRole('button', { name: 'Start locally' }).click()
    await expect(page.getByRole('button', { name: 'Keep cards' })).toBeVisible()
    await dismissSecondaryReveal(page)
    await expect(page.locator('.official-secondary-panel').first()).toContainText('Fixed')
    await expect(page.locator('.official-secondary-panel .secondary-card')).toHaveCount(2)
    await expect(page.locator('.official-secondary-panel').first()).toContainText('A Grievous Blow')
    await expect(page.locator('.official-secondary-panel').first()).toContainText('Engage on All Fronts')
    const progress = page.locator('.official-secondary-panel .secondary-card__progress').first()
    await expect(progress).toContainText('0 / 20 VP scored on this card')
    expect(await progress.evaluate((element) => ({ display: getComputedStyle(element).display, width: element.getBoundingClientRect().width })))
      .toEqual(expect.objectContaining({ display: 'block', width: expect.any(Number) }))
    expect(await progress.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(150)
  } finally {
    await context.close()
  }
})
