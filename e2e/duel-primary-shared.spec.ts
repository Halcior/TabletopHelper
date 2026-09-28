import { expect, test } from '@playwright/test'
import { importTestArmy, phone, scoreCard } from './helpers'
import { MockSupabase } from './mockSupabase'

test('two phones review their own asymmetric Primary, including opponent-turn Punishment', async ({ browser }) => {
  test.setTimeout(90_000)
  const backend = new MockSupabase()
  const alpha = await phone(browser, backend)
  const bravo = await phone(browser, backend)
  try {
    await importTestArmy(alpha.page)
    await alpha.page.getByLabel('Primary mode').selectOption('chapter-approved-duel')
    await alpha.page.getByRole('combobox', { name: 'Force Disposition' }).nth(0).selectOption('purge-the-foe')
    await alpha.page.getByRole('combobox', { name: 'Force Disposition' }).nth(1).selectOption('disruption')
    for (const strategy of await alpha.page.getByRole('combobox', { name: 'Secondary strategy' }).all()) await strategy.selectOption('fixed')
    await alpha.page.getByLabel('Guidance level').selectOption('fast')
    await alpha.page.getByRole('button', { name: 'Create 2-player lobby' }).click()
    const code = (await alpha.page.locator('.shared-room-focus__code strong').textContent())!.trim()
    await bravo.page.goto(`/shared?room=${code}`)
    await bravo.page.locator('input[name="shared-seat"][value="player-b"]').check()
    await bravo.page.getByRole('button', { name: 'Join lobby' }).click()
    for (const page of [alpha.page, bravo.page]) await page.getByRole('button', { name: 'I am ready' }).click()
    await alpha.page.getByRole('button', { name: 'Start battle' }).click()
    await Promise.all([alpha.page, bravo.page].map((page) => expect(page).toHaveURL(/\/battle\//)))
    await expect(alpha.page.locator('.duel-primary-panel').first()).toContainText('Punishment')
    await expect(bravo.page.locator('.duel-primary-panel').first()).toContainText('Delaying Action')
    for (let i = 0; i < 6; i += 1) await alpha.page.locator('.next-phase').click()
    await alpha.page.getByRole('button', { name: /Confirm end of turn/ }).click()
    for (const page of [alpha.page, bravo.page]) {
      const acknowledge = page.getByRole('button', { name: /Finished reviewing Player I’s turn/ })
      await expect(acknowledge).toBeVisible()
      await acknowledge.click()
    }
    await expect(alpha.page.getByRole('button', { name: /End turn →/ })).toBeEnabled()
    await alpha.page.getByRole('button', { name: /End turn →/ }).click()
    await expect(bravo.page.locator('.battle-turn__mobile-meta')).toContainText('Player II')
    for (let i = 0; i < 6; i += 1) await bravo.page.locator('.next-phase').click()
    await expect(bravo.page.getByRole('heading', { name: 'End Turn · Chapter Approved' })).toBeVisible()
    const punishment = alpha.page.locator('.duel-primary-panel').filter({ hasText: 'Punishment' }).first()
    await expect(punishment).toContainText('condemned unit left the battlefield')
    await punishment.getByRole('checkbox').check()
    await punishment.getByRole('button', { name: /Confirm end of turn · \+5 VP/ }).click()
    await expect(scoreCard(bravo.page, 'Player I').locator('.score-card__metric--vp strong')).toHaveText('5')
    await bravo.page.getByRole('button', { name: /Confirm end of turn/ }).click()
  } finally { await Promise.all([alpha.context.close(), bravo.context.close()]) }
})
