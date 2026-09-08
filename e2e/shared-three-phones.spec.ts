import { expect, test, type Page } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone, scoreCard } from './helpers'
import { MockSupabase } from './mockSupabase'

async function joinLobby(page: Page, roomCode: string, playerId: string): Promise<void> {
  await page.goto(`/shared?room=${roomCode}`)
  await expect(page.getByRole('heading', { name: 'Choose your commander' })).toBeVisible()
  await page.locator(`input[name="shared-seat"][value="${playerId}"]`).check()
  await page.getByRole('button', { name: 'Join lobby' }).click()
  await expect(page.getByText('Waiting room')).toBeVisible()
}

test('three phones start, synchronize and recover one idempotent offline action', async ({ browser }) => {
  const backend = new MockSupabase()
  const alpha = await phone(browser, backend)
  const bravo = await phone(browser, backend)
  const charlie = await phone(browser, backend)

  try {
    await importTestArmy(alpha.page)
    await alpha.page.getByRole('button', { name: /FFA 3/ }).click()
    await alpha.page.getByLabel('Guidance level').selectOption('fast')
    await alpha.page.getByRole('button', { name: 'Create 3-player lobby' }).click()
    await expect(alpha.page.getByText('Waiting room')).toBeVisible()
    await expect(alpha.page.locator('.shared-lobby-seat')).toHaveCount(3)
    await expect(alpha.page.locator('.shared-lobby-seat__marker')).toHaveText(['01', '02', '03'])
    await alpha.page.getByRole('button', { name: 'Enlarge QR invite' }).click()
    await expect(alpha.page.getByRole('dialog', { name: 'QR room invite' })).toBeVisible()
    await alpha.page.getByRole('button', { name: 'Close QR invite' }).click()
    const roomCode = (await alpha.page.locator('.shared-room-focus__code strong').textContent())?.trim()
    expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)

    await joinLobby(bravo.page, roomCode!, 'player-b')
    await joinLobby(charlie.page, roomCode!, 'player-c')

    for (const page of [alpha.page, bravo.page, charlie.page]) {
      const ready = page.getByRole('button', { name: 'I am ready' })
      await expect(ready).toBeEnabled()
      await ready.click()
    }

    await expect(alpha.page.locator('.shared-lobby-seat.is-ready')).toHaveCount(3)
    if (process.env.CAPTURE_UI === '1') await alpha.page.screenshot({ path: 'test-results/visual-lobby.png', fullPage: true })

    const start = alpha.page.getByRole('button', { name: 'Start battle' })
    await expect(start).toBeEnabled()
    await start.click()
    await Promise.all([alpha.page, bravo.page, charlie.page].map((page) => expect(page).toHaveURL(/\/battle\//)))
    await dismissSecondaryReveal(alpha.page)
    await expect(alpha.page.locator('.shared-secondary-card__icon')).toHaveCount(2)

    await alpha.page.getByRole('button', { name: 'Gain 1 CP for Player I' }).click()
    await expect(scoreCard(bravo.page, 'Player I').locator('.score-card__numbers strong').nth(1)).toHaveText('1')

    await bravo.context.setOffline(true)
    await expect(bravo.page.getByText('This phone is offline')).toBeVisible()
    await bravo.page.getByRole('button', { name: 'Gain 1 CP for Player II' }).click()
    await expect(scoreCard(bravo.page, 'Player II').locator('.score-card__numbers strong').nth(1)).toHaveText('1')

    backend.failNextEventInsertAfterCommit = true
    await bravo.context.setOffline(false)
    await expect(scoreCard(alpha.page, 'Player II').locator('.score-card__numbers strong').nth(1)).toHaveText('1')

    const stored = backend.storedEvents('CP_GAINED', 'player-b')
    expect(stored).toHaveLength(1)
    expect(backend.attemptsFor(stored[0].event_id)).toBeGreaterThanOrEqual(2)
    await expect(bravo.page.getByText('This phone is offline')).toBeHidden()
  } finally {
    await Promise.all([alpha.context.close(), bravo.context.close(), charlie.context.close()])
  }
})
