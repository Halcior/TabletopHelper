import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import path from 'node:path'
import type { MockSupabase } from './mockSupabase'

export const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

export async function selectPanel(page: Page, panel: 'overview' | 'army' | 'objectives' | 'cards' | 'log' | 'report') {
  await expect(page.getByRole('navigation', { name: 'Battle panels' })).toBeVisible()
  const names = { overview: 'Battle', army: 'Army', objectives: 'Objectives', cards: 'Cards', log: 'Chronicle', report: 'Report' }
  const direct = page.locator('.battle-tabs').getByRole('button', { name: names[panel], exact: true })
  if (await direct.isVisible()) { await direct.click(); return }
  const legacy = page.locator('.battle-tabs').getByRole('button', { name: panel, exact: true })
  if (await legacy.isVisible()) { await legacy.click(); return }
  if (panel !== 'log' && panel !== 'report') { await direct.click(); return }
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: panel === 'log' ? 'Battle Chronicle' : 'Battle Report', exact: true }).click()
}

export async function setupRules(page: Page) {
  await page.getByRole('navigation', { name: 'Battle setup steps' }).getByRole('button', { name: /Rules/ }).click()
}
export async function setupCommanders(page: Page) {
  await page.getByRole('navigation', { name: 'Battle setup steps' }).getByRole('button', { name: /Commanders/ }).click()
}
export async function setupBattlefield(page: Page) {
  await page.getByRole('navigation', { name: 'Battle setup steps' }).getByRole('button', { name: /Battlefield/ }).click()
  await expect(page.getByRole('heading', { name: 'Battlefield & Start', exact: true })).toBeVisible()
}
export async function phone(browser: Browser, backend?: MockSupabase): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(PHONE)
  if (backend) await backend.attach(context)
  return { context, page: await context.newPage() }
}

export async function importTestArmy(page: Page): Promise<void> {
  await page.goto('/army-import')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('test-data/1700.json'))
  await expect(page.getByRole('heading', { name: 'Adeptus Custodes' })).toBeVisible()
  await page.getByRole('button', { name: 'Save army' }).click()
  await expect(page.getByRole('region', { name: 'Army saved' })).toBeVisible()
  await expect(page).toHaveURL(/\/army-import$/)
  await page.getByRole('region', { name: 'Army saved' }).getByRole('link', { name: 'Create battle' }).click()
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
  // FFA when-drawn targets must be saved before leaving Command.
  for (const box of await page.locator('.official-secondary-input').all()) {
    const saveChoice = box.getByRole('button', { name: 'Save and lock choice', exact: true })
    if (await saveChoice.isVisible()) {
      const select = box.locator('select').first()
      const value = await select.locator('option').nth(1).getAttribute('value')
      if (value) { await select.selectOption(value); await saveChoice.click() }
    }
    const saveGuards = box.getByRole('button', { name: 'Save guards for this turn', exact: true })
    if (await saveGuards.isVisible()) {
      for (const select of await box.locator('select').all()) {
        const value = await select.locator('option').nth(1).getAttribute('value')
        if (value) await select.selectOption(value)
      }
      await saveGuards.click()
    }
  }
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
