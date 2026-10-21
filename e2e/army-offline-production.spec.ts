import { expect, test } from '@playwright/test'
import path from 'node:path'
import { phone } from './helpers'
import { MockAccounts } from './mockAccounts'

test('installed production app opens unvisited roster routes, edits and reloads fully offline', async ({
  browser,
}) => {
  test.skip(
    process.env.E2E_PRODUCTION !== '1',
    'Run with E2E_PRODUCTION=1 to verify the real build and service worker.',
  )
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await page.goto('/army-import')
    await page
      .locator('input[type=file]')
      .setInputFiles(path.resolve('test-data/1700.json'))
    await page.getByRole('button', { name: 'Save army', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Army saved' })).toBeVisible()
    // Neither the new library nor editor has been opened online.
    await context.setOffline(true)
    await page.goto('/armies')
    await expect(page.locator('.roster-card-grid > article')).toHaveCount(1)
    await page.getByRole('link', { name: 'Edit', exact: true }).click()
    await page
      .getByRole('textbox', { name: 'Roster name' })
      .fill('Offline library variant')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Roster saved.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('textbox', { name: 'Roster name' }),
    ).toHaveValue('Offline library variant')
    await page.getByRole('link', { name: '← My Armies' }).click()
    await page.getByRole('link', { name: 'Use in Battle', exact: true }).click()
    await expect(page.getByRole('heading', { name: /New Duel/ })).toBeVisible()
  } finally {
    await context.close()
  }
})


test('expired account session keeps its private cache editable after a full offline reload', async ({ browser }) => {
  test.skip(process.env.E2E_PRODUCTION !== '1', 'Requires the built production service worker.')
  const { context, page } = await phone(browser)
  const backend = new MockAccounts()
  await backend.attach(context)
  try {
    await page.goto('/account')
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('a@example.test')
    await page.getByText('Enter email code', { exact: true }).click()
    await page.getByRole('textbox', { name: 'Email code' }).fill('123456')
    await page.getByRole('button', { name: 'Verify code' }).click()
    await expect(page.getByRole('heading', { name: 'a@example.test' })).toBeVisible()
    await page.goto('/army-import'); await page.locator('input[type=file]').setInputFiles(path.resolve('test-data/1700.json'))
    await page.getByRole('button', { name: 'Save army', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Army saved' })).toBeVisible()
    await page.goto('/armies')
    await expect(page.locator('.roster-card-grid > article')).toHaveCount(1)
    await page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('tabletophelper-account')!)
      value.expires_at = Math.floor(Date.now()/1000)-10
      localStorage.setItem('tabletophelper-account',JSON.stringify(value))
    })
    backend.failNetwork = true
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('.roster-card-grid > article')).toHaveCount(1)
    await page.getByRole('link', { name: 'Edit', exact: true }).click()
    await page.getByRole('textbox', { name: 'Roster name' }).fill('Expired-session offline edit')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Roster saved.', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Roster name' })).toHaveValue('Expired-session offline edit')
  } finally { await context.close() }
})
