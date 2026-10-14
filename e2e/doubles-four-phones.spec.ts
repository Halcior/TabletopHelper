import { expect, test, type Page } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone, scoreCard, selectPanel, setupBattlefield, setupCommanders } from './helpers'
import { MockSupabase } from './mockSupabase'

async function join(page: Page, code: string, playerId: string) {
  await page.goto(`/shared?room=${code}`)
  await expect(page.getByRole('heading', { name: 'Choose your commander' })).toBeVisible()
  await page.locator(`input[name="shared-seat"][value="${playerId}"]`).check()
  await page.getByRole('button', { name: 'Join lobby' }).click()
  await expect(page.getByText('Waiting room')).toBeVisible()
}

test('four phones play one GW Doubles turn with exactly two shared CP and VP pools', async ({ browser }) => {
  test.setTimeout(120_000)
  const backend = new MockSupabase()
  const phones = await Promise.all(Array.from({ length: 4 }, () => phone(browser, backend)))
  const [alpha, beta, gamma, delta] = phones
  try {
    await importTestArmy(alpha.page)
    await alpha.page.getByRole('button', { name: /Doubles 2v2/ }).click()
    await setupCommanders(alpha.page)
    await expect(alpha.page.getByRole('heading', { name: /Team Alpha/ })).toBeVisible()
    await expect(alpha.page.getByRole('combobox', { name: 'Force Disposition' })).toHaveCount(2)
    await expect(alpha.page.getByRole('combobox', { name: 'One Warlord for the force' })).toHaveCount(2)
    await expect(alpha.page.getByLabel('Player name', { exact: true })).toHaveCount(4)
    await setupBattlefield(alpha.page)
    await alpha.page.getByLabel('Guidance level').selectOption('fast')
    await setupBattlefield(alpha.page)
    console.info('[Doubles 2v2] Starting four-seat lobby')
    await alpha.page.getByRole('button', { name: 'Create 4-player lobby' }).click()
    await expect(alpha.page.locator('.shared-lobby-seat')).toHaveCount(4)
    const code = (await alpha.page.locator('.shared-room-focus__code strong').textContent())!.trim()
    await join(beta.page, code, 'player-b')
    await join(gamma.page, code, 'player-c')
    await join(delta.page, code, 'player-d')

    console.info('[Doubles 2v2] Four seats joined; marking ready')
    for (const entry of phones) {
      const ready = entry.page.getByRole('button', { name: 'I am ready' })
      await expect(ready).toBeEnabled()
      await ready.click()
    }
    await expect(alpha.page.locator('.shared-lobby-seat.is-ready')).toHaveCount(4)
    await alpha.page.getByRole('button', { name: 'Start battle' }).click()
    console.info('[Doubles 2v2] Battle started; checking scores and shared cards')
    await Promise.all(phones.map(async (entry) => {
      await expect(entry.page).toHaveURL(/\/battle\//)
      await dismissSecondaryReveal(entry.page)
      await expect(entry.page.locator('.score-card')).toHaveCount(2)
    }))

    // Either allied phone may manipulate the one CP pool; the opponents may not.
    await expect(beta.page.getByRole('button', { name: 'Gain 1 CP for Team Alpha' })).toBeEnabled()
    await beta.page.getByRole('button', { name: 'Gain 1 CP for Team Alpha' }).click()
    await expect(scoreCard(alpha.page, 'Team Alpha').locator('.score-card__numbers strong').nth(1)).toHaveText('1')
    await expect(scoreCard(gamma.page, 'Team Alpha').locator('.score-card__numbers strong').nth(1)).toHaveText('1')
    await expect(gamma.page.getByRole('button', { name: 'Gain 1 CP for Team Alpha' })).toHaveCount(0)
    await alpha.page.getByRole('button', { name: 'Spend 1 CP for Team Alpha' }).click()
    await expect(scoreCard(beta.page, 'Team Alpha').locator('.score-card__numbers strong').nth(1)).toHaveText('0')

    // The same two team missions appear to both partners, not four copies.
    await selectPanel(alpha.page, 'cards')
    await selectPanel(beta.page, 'cards')
    await expect(alpha.page.locator('.secondary-card--official')).toHaveCount(2)
    await expect(beta.page.locator('.secondary-card--official')).toHaveCount(2)

    // Chronicle and after-action report must retain all four commanders but only
    // two ranked sides.
    await selectPanel(delta.page, 'report')
    await expect(delta.page.locator('.report-player')).toHaveCount(2)
    await expect(delta.page.getByText('Official Doubles 2v2')).toBeVisible()
  } finally {
    await Promise.allSettled(phones.map((entry) => entry.context.close()))
  }
})
