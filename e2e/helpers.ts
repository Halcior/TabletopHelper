import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import type { MockSupabase } from './mockSupabase'

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

export async function phone(browser: Browser, backend?: MockSupabase): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(PHONE)
  if (backend) await backend.attach(context)
  return { context, page: await context.newPage() }
}

export async function importTestArmy(page: Page): Promise<void> {
  await page.goto('/army-import')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('test-data/1700.json'))
  await expect(page.getByRole('heading', { name: 'Adeptus Custodes' })).toBeVisible()
  await page.getByRole('button', { name: 'Use this army' }).click()
  await expect(page).toHaveURL(/\/battle\/setup/)
}

export function scoreCard(page: Page, playerName: string) {
  const exactName = new RegExp(`^${playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  return page.locator('.score-card').filter({
    has: page.locator('.score-card__name').filter({ hasText: exactName }),
  })
}

export async function dismissSecondaryReveal(page: Page): Promise<void> {
  const keep = page.getByRole('button', { name: 'Keep cards' })
  if (await keep.isVisible().catch(() => false)) await keep.click()
}

export async function resolvePriorityTargetIfNeeded(page: Page): Promise<void> {
  const selectTarget = page.getByRole('button', { name: 'Select target', exact: true })
  if (!await selectTarget.isVisible().catch(() => false)) return

  await selectTarget.click()
  const panel = page.locator('.quick-panel')
  const confirmAlpha = panel.getByRole('button', { name: /^Confirm \d+ Alpha target/ })
  await expect(confirmAlpha).toBeVisible()
  const count = Number((await confirmAlpha.textContent())?.match(/\d+/)?.[0] ?? 0)
  const candidates = panel.locator('.priority-target-list input[type="checkbox"]:not(:disabled)')
  for (let index = 0; index < count; index += 1) await candidates.nth(index).check()
  await confirmAlpha.click()

  const gamma = panel.locator('.context-choice-list button:not(:disabled)').first()
  if (await gamma.isVisible().catch(() => false)) await gamma.click()
}
