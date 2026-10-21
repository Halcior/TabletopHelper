import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { phone } from './helpers'
import { MockAccounts } from './mockAccounts'

async function importLocal(page: Page) {
  await page.goto('/army-import')
  await page
    .locator('input[type=file]')
    .setInputFiles(path.resolve('test-data/1700.json'))
  await page.getByRole('button', { name: 'Save army', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Army saved' })).toBeVisible()
}
async function login(page: Page, email = 'a@example.test') {
  await page.goto('/account')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await expect(page.getByText(/Check your email/)).toBeVisible()
  await page.getByText('Enter email code', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Email code' }).fill('123456')
  await page.getByRole('button', { name: 'Verify code' }).click()
  await expect(
    page.getByRole('heading', { name: email, exact: true }),
  ).toBeVisible()
}
async function sync(page: Page) {
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Sync now', exact: true }),
  ).toBeEnabled()
}

test('guest edits, copies, exports and restores independent roster variants on a phone', async ({
  browser,
}) => {
  const { context, page } = await phone(browser)
  try {
    await importLocal(page)
    await page.goto('/armies')
    await page.getByRole('link', { name: 'Edit', exact: true }).click()
    await page
      .getByRole('textbox', { name: 'Roster name' })
      .fill('Custodes — Mobile 1750')
    const points = page
      .getByRole('spinbutton', { name: 'Unit points (custom override)' })
      .first()
    const previous = Number(await points.inputValue())
    const total = (await page.getByLabel('Roster total points').textContent())!
    await points.fill(String(previous + 15))
    expect(await page.getByLabel('Roster total points').textContent()).not.toBe(
      total,
    )
    await page
      .getByRole('button', { name: 'Duplicate unit', exact: true })
      .first()
      .click()
    await page.locator('.roster-unit').last().scrollIntoViewIfNeeded()
    const headerBox = await page.locator('.app-header').boundingBox()
    const toolbarBox = await page.locator('.roster-editor-toolbar').boundingBox()
    expect(toolbarBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Roster saved.', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: '← My Armies' }).click()
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
    await expect(page.locator('.roster-card-grid > article')).toHaveCount(2)
    await page
      .getByRole('button', { name: 'Duplicate', exact: true })
      .first()
      .click()
    await expect(page.locator('.roster-card-grid > article')).toHaveCount(3)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Backup library' }).click()
    const file = await download
    await page.goto('/army-import')
    await page.locator('input[type=file]').setInputFiles((await file.path())!)
    await page.getByRole('button', { name: 'Restore rosters' }).click()
    await expect(page.getByRole('status', { name: 'Army saved' })).toBeVisible()
    await page.goto('/armies')
    await expect(page.locator('.roster-card-grid > article')).toHaveCount(3)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    const ids = await page.evaluate(async () => {
      const { listArmies } = await import('/src/persistence/database.ts')
      return (await listArmies()).flatMap((row) =>
        row.army.units.map((u) => u.id),
      )
    })
    expect(new Set(ids).size).toBe(ids.length)
    await page.screenshot({
      path: 'test-results/army-library-phone.png',
      fullPage: true,
    })
  } finally {
    await context.close()
  }
})

test('optional accounts migrate once, restore sessions, sync two devices offline and isolate another account', async ({
  browser,
}) => {
  const backend = new MockAccounts()
  const first = await phone(browser),
    second = await phone(browser)
  await backend.attach(first.context)
  await backend.attach(second.context)
  try {
    await importLocal(first.page)
    await login(first.page)
    await expect(
      first.page.getByRole('heading', { name: /Found 1 local armies/ }),
    ).toBeVisible()
    const backup = first.page.waitForEvent('download')
    await first.page
      .getByRole('button', { name: 'Import all', exact: true })
      .click()
    await backup
    await expect(first.page.getByText(/Imported on this device/)).toBeVisible()
    await sync(first.page)
    expect(backend.rows.size).toBe(1)
    await first.page.reload()
    await expect(
      first.page.getByRole('heading', { name: 'a@example.test' }),
    ).toBeVisible()
    await expect(
      first.page.getByRole('heading', { name: /Found .* local armies/ }),
    ).toHaveCount(0)
    await login(second.page)
    await sync(second.page)
    await second.page.goto('/armies')
    await expect(
      second.page.locator('.roster-card-grid > article'),
    ).toHaveCount(1)
    await second.page.getByRole('link', { name: 'Edit', exact: true }).click()
    await second.page
      .getByRole('textbox', { name: 'Roster name' })
      .fill('Phone cloud variant')
    await second.page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      second.page.getByText('Roster saved.', { exact: true }),
    ).toBeVisible()
    await second.page.goto('/account')
    await sync(second.page)
    await first.page.goto('/armies')
    await sync(first.page)
    await expect(
      first.page.getByRole('heading', {
        name: 'Phone cloud variant',
        exact: true,
      }),
    ).toBeVisible()
    // Persist an offline edit, refresh, reconnect, then receive it on device 2.
    await first.page.getByRole('link', { name: 'Edit', exact: true }).click()
    await expect(
      first.page.getByRole('textbox', { name: 'Roster name' }),
    ).toBeVisible()
    await first.context.setOffline(true)
    await first.page
      .getByRole('textbox', { name: 'Roster name' })
      .fill('Offline PC edit')
    await first.page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      first.page.getByText('Roster saved.', { exact: true }),
    ).toBeVisible()
    await first.context.setOffline(false)
    await first.page.reload()
    await expect(
      first.page.getByRole('textbox', { name: 'Roster name' }),
    ).toHaveValue('Offline PC edit')
    await first.page.goto('/account')
    await sync(first.page)
    await second.page.goto('/armies')
    await sync(second.page)
    await expect(
      second.page.getByRole('heading', {
        name: 'Offline PC edit',
        exact: true,
      }),
    ).toBeVisible()
    // Force an expired persisted SDK session and verify the refresh-token flow.
    await second.page.evaluate(() => {
      const key = 'tabletophelper-account'
      const data = JSON.parse(localStorage.getItem(key)!)
      data.expires_at = Math.floor(Date.now() / 1000) - 10
      localStorage.setItem(key, JSON.stringify(data))
    })
    await second.page.reload()
    await second.page.goto('/account')
    await expect(
      second.page.getByRole('heading', { name: 'a@example.test' }),
    ).toBeVisible()
    expect(backend.refreshes).toBeGreaterThan(0)
    await second.page
      .getByRole('button', { name: 'Sign out', exact: true })
      .click()
    await expect(
      second.page.getByRole('heading', { name: 'Guest on this device' }),
    ).toBeVisible()
    await second.page.goto('/armies')
    await expect(
      second.page.locator('.roster-card-grid > article'),
    ).toHaveCount(0)
    await login(second.page, 'b@example.test')
    await sync(second.page)
    await second.page.goto('/armies')
    await expect(
      second.page.locator('.roster-card-grid > article'),
    ).toHaveCount(0)
    await first.page.screenshot({
      path: 'test-results/army-account-phone.png',
      fullPage: true,
    })
  } finally {
    await first.context.close()
    await second.context.close()
  }
})

test('invalid email code shows an error while guest rosters remain usable', async ({
  browser,
}) => {
  const { context, page } = await phone(browser)
  const backend = new MockAccounts()
  await backend.attach(context)
  try {
    await importLocal(page)
    await page.goto('/account')
    await page
      .getByRole('textbox', { name: 'Email', exact: true })
      .fill('a@example.test')
    await page.getByText('Enter email code', { exact: true }).click()
    await page.getByRole('textbox', { name: 'Email code' }).fill('000000')
    await page.getByRole('button', { name: 'Verify code' }).click()
    await expect(page.getByRole('alert')).toContainText(
      'Invalid or expired code',
    )
    await page.goto('/armies')
    await expect(page.locator('.roster-card-grid > article')).toHaveCount(1)
  } finally {
    await context.close()
  }
})
