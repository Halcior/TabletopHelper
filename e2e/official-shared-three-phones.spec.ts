import { expect, test, type Page } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone } from './helpers'
import { MockSupabase } from './mockSupabase'

async function join(page: Page, roomCode: string, seat: string): Promise<void> {
  await page.goto(`/shared?room=${roomCode}`)
  await page.locator(`input[name="shared-seat"][value="${seat}"]`).check()
  await page.getByRole('button', { name: 'Join lobby' }).click()
}

test('Chapter Approved FFA choice and Rival end-turn review synchronize on three phones', async ({ browser }) => {
  const backend = new MockSupabase()
  const alpha = await phone(browser, backend)
  const bravo = await phone(browser, backend)
  const charlie = await phone(browser, backend)
  try {
    await importTestArmy(alpha.page)
    await alpha.page.getByRole('button', { name: /FFA 3/ }).click()
    await alpha.page.getByLabel('Guidance level').selectOption('fast')
    await alpha.page.getByLabel('Secondary deck').selectOption('chapter-approved')
    await alpha.page.getByLabel('Secondary strategy').selectOption('fixed')
    await alpha.page.getByRole('button', { name: 'Create 3-player lobby' }).click()
    const code = (await alpha.page.locator('.shared-room-focus__code strong').textContent())!.trim()
    await join(bravo.page, code, 'player-b')
    await join(charlie.page, code, 'player-c')
    await expect(bravo.page.getByLabel('Secondary deck selected for this room')).toContainText('Chapter Approved 2026–27 · Fixed')
    for (const page of [alpha.page, bravo.page, charlie.page]) await page.getByRole('button', { name: 'I am ready' }).click()
    await alpha.page.getByRole('button', { name: 'Start battle' }).click()
    await Promise.all([alpha.page, bravo.page, charlie.page].map((page) => expect(page).toHaveURL(/\/battle\//)))
    await dismissSecondaryReveal(alpha.page)
    for (const page of [alpha.page, bravo.page, charlie.page]) {
      await expect(page.locator('.ruleset-label').last()).toContainText('Fixed')
      await expect(page.locator('.official-secondary-panel').first()).toContainText('FFA adaptation')
    }

    for (let index = 0; index < 6; index += 1) await alpha.page.locator('.next-phase').click()
    await expect(alpha.page.getByRole('heading', { name: 'End Turn Review' })).toBeVisible()
    await expect(alpha.page.getByText('Secondary review pending')).toBeVisible()
    await alpha.page.getByRole('button', { name: /Finished reviewing Player I’s turn/ }).click()
    await charlie.page.getByRole('button', { name: /Finished reviewing Player I’s turn/ }).click()
    await expect(alpha.page.getByText('Secondary review pending')).toBeHidden()
    await alpha.page.getByRole('button', { name: 'Apply Primary scoring' }).click()
    await expect(alpha.page.getByRole('button', { name: /End turn/ })).toBeEnabled()
    await alpha.page.getByRole('button', { name: /End turn/ }).click()
    await expect(bravo.page.locator('.battle-turn__mobile-meta')).toContainText('Player II')
  } finally {
    await Promise.all([alpha.context.close(), bravo.context.close(), charlie.context.close()])
  }
})
