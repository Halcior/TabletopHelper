import { expect, test } from '@playwright/test'
import { phone, setupRules } from './helpers'

test('FFA setup explains automatic round CP and round-three Underdog, without changing Duel setup', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/battle/setup?mode=ffa3')
    await setupRules(page)
    const ffa = page.getByText('Every commander automatically receives +2 CP', { exact: false })
    await expect(ffa).toBeVisible()
    await expect(ffa).toContainText('From Round 3')
    await expect(ffa).toContainText('no bonus if all scores are tied')
    await page.getByRole('button', { name: /Duel 1v1/ }).click()
    await expect(ffa).toHaveCount(0)
    await page.getByRole('button', { name: /FFA 3/ }).click()
    await expect(ffa).toBeVisible()
  } finally {
    await context.close()
  }
})
