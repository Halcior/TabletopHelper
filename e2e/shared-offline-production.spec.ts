import { expect, test } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone, scoreCard, setupBattlefield } from './helpers'
import { MockSupabase } from './mockSupabase'

test('started multiplayer battle reloads on a network-offline phone and syncs its pending action on reconnect', async ({ browser }) => {
  test.skip(process.env.E2E_PRODUCTION !== '1', 'Requires the production service worker.')
  test.setTimeout(90_000)
  const backend = new MockSupabase()
  const host = await phone(browser, backend)
  const guest = await phone(browser, backend)
  try {
    await importTestArmy(host.page)
    await setupBattlefield(host.page)
    await host.page.getByLabel('Guidance level').selectOption('fast')
    await host.page.getByRole('button', { name: 'Start locally' }).click()
    await host.page.goto('/shared')
    await host.page.getByText('Legacy: share an existing local battle').click()
    await host.page.getByRole('button', { name: 'Share existing battle' }).click()
    const code = (await host.page.locator('.shared-room-focus__code strong').textContent())!.trim()
    await guest.page.goto(`/shared?room=${code}`)
    await guest.page.locator('input[name="shared-seat"][value="player-b"]').check()
    await guest.page.getByRole('button', { name: 'Join lobby' }).click()
    await guest.page.getByRole('button', { name: 'I am ready', exact: true }).click()
    await host.page.getByRole('button', { name: 'I am ready', exact: true }).click()
    await expect(host.page.locator('.shared-lobby-seat.is-ready')).toHaveCount(2)
    await host.page.getByRole('button', { name: 'Start battle', exact: true }).click()
    await expect(guest.page).toHaveURL(/\/battle\//)
    await expect(guest.page.locator('.shared-status')).toContainText('2/2 online')
    await dismissSecondaryReveal(guest.page)
    await guest.page.waitForFunction(() => Boolean(navigator.serviceWorker.controller)
      && Object.keys(localStorage).some(key => key.startsWith('tabletop-companion.shared-started:')))

    const guestCp = scoreCard(guest.page, 'Player II').locator('.score-card__numbers strong').nth(1)
    const before = Number(await guestCp.textContent())
    await guest.context.setOffline(true)
    await expect(guest.page.getByText('This phone is offline', { exact: true })).toBeVisible()
    await guest.page.getByRole('button', { name: 'Gain 1 CP for Player II', exact: true }).click()
    await expect(guestCp).toHaveText(String(before + 1))
    await guest.page.reload()
    await expect(guest.page.getByText('This phone is offline', { exact: true })).toBeVisible()
    await expect(guest.page.getByText('Changes awaiting confirmation: 1.')).toBeVisible()
    await expect(guestCp).toHaveText(String(before + 1))

    await guest.context.setOffline(false)
    await expect(guest.page.getByText('Changes awaiting confirmation: 1.')).toHaveCount(0)
    await expect(scoreCard(host.page, 'Player II').locator('.score-card__numbers strong').nth(1)).toHaveText(String(before + 1))
    expect(backend.storedEvents('CP_GAINED', 'player-b')).toHaveLength(1)
  } finally {
    await Promise.all([host.context.close(), guest.context.close()])
  }
})
