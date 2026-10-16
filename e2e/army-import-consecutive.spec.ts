import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { phone } from './helpers'

test('imports several New Recruit armies in a row without leaving the library', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/army-import')
    const file = page.locator('input[type="file"]')
    const saved = page.getByRole('status', { name: 'Army saved' })
    const imports = page.getByRole('region', { name: 'Armies imported this visit' })
    await file.setInputFiles(path.resolve('test-data/1700.json'))
    await expect(page.getByRole('heading', { name: 'Adeptus Custodes' })).toBeVisible()
    await page.getByRole('button', { name: 'Save army' }).click()
    await expect(saved).toBeVisible()
    await expect(page).toHaveURL(/\/army-import$/)
    await expect(imports.getByRole('listitem')).toHaveCount(1)
    await expect(file).toBeEnabled()

    // Use an independent New Recruit roster identity; the unit profiles may
    // remain the same since the importer should preserve independent saved IDs.
    const second = JSON.parse(readFileSync(path.resolve('test-data/1700.json'), 'utf8')) as {
      roster: { id: string; name: string }
    }
    second.roster.id = 'second-army-import-test'
    second.roster.name = 'Second roster'
    await file.setInputFiles({
      name: 'second.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(second)),
    })
    await expect(page.getByText('Second roster', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Save army' }).click()
    await expect(page).toHaveURL(/\/army-import$/)
    await expect(imports.getByRole('listitem')).toHaveCount(2)
    await expect(imports.getByText('Second roster')).toBeVisible()

    // Selecting the same filename again must work; Dexie overwrites the same
    // roster id rather than creating duplicate cards in the current session.
    await file.setInputFiles({
      name: 'second.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(second)),
    })
    await page.getByRole('button', { name: 'Save army' }).click()
    await expect(imports.getByRole('listitem')).toHaveCount(2)
    const stored = await page.evaluate(async () => {
      const { listArmies } = await import('/src/persistence/database.ts')
      return (await listArmies()).map((entry) => entry.army.name)
    })
    expect(stored).toContain('Second roster')
    expect(stored).toHaveLength(2)

    // Only the explicit action leaves the importer; every saved army is
    // selectable in the existing Duel, FFA 3 and Doubles setup.
    await saved.getByRole('link', { name: 'Create battle' }).click()
    await expect(page).toHaveURL(/\/battle\/setup$/)
    await page.getByRole('button', { name: 'Next: Commanders' }).click()
    await expect(page.getByRole('combobox', { name: 'Saved army' }).first().locator('option')).toHaveCount(2)
  } finally {
    await context.close()
  }
})
