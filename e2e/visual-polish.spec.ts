import { expect, test } from '@playwright/test'
import { phone } from './helpers'

test('mobile home presents a compact command deck without overflow', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ready to play?' })).toBeVisible()
    await expect(page.locator('.home-command-hub__meta')).toContainText('Local-first')
    await expect(page.locator('.home-command-hub__meta')).toContainText('2–3 commanders')

    const layout = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      shortestAction: Math.min(...Array.from(document.querySelectorAll<HTMLElement>('.home-action')).map((item) => item.getBoundingClientRect().height)),
    }))
    expect(layout.horizontalOverflow).toBe(false)
    expect(layout.shortestAction).toBeGreaterThanOrEqual(44)

    if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/visual-home.png', fullPage: true })
  } finally {
    await context.close()
  }
})
