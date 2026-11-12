import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { companionCsv } from '../test-data/companion'
import { FILES } from '../src/features/companion/data'
import { phone } from './helpers'
import type { Page } from '@playwright/test'
import path from 'node:path'
import { seedDesignBattles } from './ui2Fixtures'

async function importCompanionArmy(page: Page) {
  await page.goto('/army-import')
  await page.locator('input[type=file]').setInputFiles(path.resolve('test-data/1700.json'))
  await expect(page.getByRole('heading', { name: 'Adeptus Custodes' })).toHaveText('Adeptus Custodes')
  await page.getByRole('button', { name: 'Save army', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Army saved' })).toBeAttached()
}

const upload = Object.entries(companionCsv).map(([name, content]) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(content!) }))

test('mobile companion imports rules, preserves duplicate units and confirms/refunds actual CP in another player turn', async ({ browser }) => {
  const { page, context } = await phone(browser)
  try {
    await importCompanionArmy(page)
    await page.evaluate(async () => {
      const { listArmies, saveArmy } = await import('/src/persistence/database.ts')
      const { copyUnit } = await import('/src/domain/army/roster.ts')
      const army = (await listArmies())[0].army
      army.units.push(copyUnit(army.units.find(unit => unit.name === 'Allarus Custodians')!))
      await saveArmy(army)
    })
    const { ffa } = await seedDesignBattles(page)
    await page.goto(`/battle/${ffa}`)
    await page.getByRole('button', { name: 'Battle Companion', exact: true }).click()
    await page.getByLabel('Companion player').selectOption('p-b')
    await expect(page.locator('.companion-units button').filter({ hasText: 'Allarus Custodians' })).toHaveCount(2)
    await page.locator('.companion input[type=file]').setInputFiles(upload)
    await page.getByRole('button', { name: 'Use selected snapshot', exact: true }).click()
    await expect(page.getByText(/Selected snapshot/)).toBeAttached()
    await page.locator('.companion-units button').first().click()
    await page.getByRole('button', { name: 'Choose datasheet manually', exact: true }).click()
    await page.getByLabel('Search all datasheets').fill('Test Sentinel')
    await page.getByRole('button', { name: 'Test Sentinel · AC · 001', exact: true }).click()
    await expect(page.getByText(/Manually confirmed/)).toBeAttached()
    await expect(page.locator('.companion-detail')).toContainText('Test defense')
    await page.getByRole('button', { name: 'Stratagems', exact: true }).click()
    await expect(page.locator('.companion-stratagem')).toHaveCount(2)
    await page.locator('.companion-stratagem').filter({ hasText: 'TEST ONLY — Shield' }).locator('button').first().click()
    await page.getByRole('button', { name: 'Use stratagem', exact: true }).click()
    await page.getByLabel('Actual CP cost').fill('100')
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
    await page.getByLabel('Actual CP cost').fill('0')
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.locator('.companion-use')).toContainText('0 CP')
    await page.locator('.companion-stratagem').filter({ hasText: 'TEST ONLY — Shield' }).locator('button').first().click()
    await page.getByRole('button', { name: 'Use stratagem', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.locator('.companion-use')).toHaveCount(2)
    const before = await page.evaluate(async () => {
      const store = (await import('/src/stores/battleStore.ts')).useBattleStore
      const state = store.getState().session!.state
      const value = { cp: state.players['p-b'].cp, otherCp: state.players['p-a'].cp }
      store.getState().dispatch({ type: 'CP_GAINED', payload: { playerId: 'p-b', amount: 2 } })
      return value
    })
    await page.getByRole('button', { name: 'Undo use', exact: true }).first().click()
    await expect(page.locator('.companion-use').first()).toContainText('reverted')
    const after = await page.evaluate(async () => {
      const state = (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.state
      return { cp: state.players['p-b'].cp, otherCp: state.players['p-a'].cp }
    })
    expect(after.cp).toBe(before.cp + 3)
    expect(after.otherCp).toBe(before.otherCp)
    await page.reload()
    await page.getByRole('button', { name: 'Battle Companion', exact: true }).click()
    await page.getByLabel('Companion player').selectOption('p-b')
    await expect(page.getByText(/Selected snapshot/)).toBeAttached()
    await page.locator('.companion-units button').first().click()
    await expect(page.getByText(/Manually confirmed/)).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/companion-phone.png', fullPage: true })
  } finally { await context.close() }
})

test('real Custodes export loads on phone, keeps missing matches visible and caches through connection loss', async ({ browser }) => {
  test.skip(!process.env.COMPANION_CSV_DIR, 'Set COMPANION_CSV_DIR to downloaded real Wahapedia files.')
  const { page, context } = await phone(browser)
  try {
    await importCompanionArmy(page); await page.goto('/armies')
    await page.getByRole('link', { name: 'Battle Companion', exact: true }).click()
    await page.locator('.companion input[type=file]').setInputFiles(Object.keys(FILES).map(name => ({ name, mimeType: 'text/csv', buffer: readFileSync(join(process.env.COMPANION_CSV_DIR!, name)) })))
    await page.getByRole('button', { name: 'Use selected snapshot', exact: true }).click()
    for (const name of ['Trajann Valoris', 'Allarus Custodians', 'Custodian Wardens', 'Telemon Heavy Dreadnought']) {
      await page.locator('.companion-units button').filter({ hasText: name }).click()
      await expect(page.locator('.companion-sheet h2')).toHaveText(name)
      await expect(page.locator('.companion-detail')).toContainText('Exact name & faction match')
      await expect(page.locator('.companion-weapon').first()).toBeVisible()
      await page.locator('.companion-back').click()
    }
    await page.locator('.companion-units button').filter({ hasText: 'Telemon Heavy Dreadnought' }).click()
    await context.setOffline(true)
    await expect(page.locator('.companion-detail')).toContainText('Telemon Heavy Dreadnought')
    await page.screenshot({ path: 'test-results/companion-real-phone.png', fullPage: true })
    await context.setOffline(false)
    await page.reload()
    await page.locator('.companion-units button').filter({ hasText: 'Telemon Heavy Dreadnought' }).click()
    await expect(page.locator('.companion-detail')).toContainText('Exact name & faction match')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.screenshot({ path: 'test-results/companion-real-desktop.png', fullPage: true })
  } finally { await context.close() }
})

test('production app reopens cached rules fully offline', async ({ browser }) => {
  test.skip(process.env.E2E_PRODUCTION !== '1', 'Requires production service worker.')
  const { page, context } = await phone(browser)
  try {
    await importCompanionArmy(page)
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.goto('/armies'); await page.getByRole('link', { name: 'Battle Companion', exact: true }).click()
    await page.locator('.companion input[type=file]').setInputFiles(upload)
    await page.getByRole('button', { name: 'Use selected snapshot', exact: true }).click()
    await expect(page.getByText(/Selected snapshot/)).toBeAttached()
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText(/Selected snapshot/)).toBeAttached()
    await page.getByRole('button', { name: 'Stratagems', exact: true }).click()
    await expect(page.locator('.companion-stratagem')).toHaveCount(2)
  } finally { await context.close() }
})
