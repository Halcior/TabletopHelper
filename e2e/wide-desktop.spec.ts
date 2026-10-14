import { expect, test } from '@playwright/test'
import { importTestArmy, selectPanel } from './helpers'
import { seedDesignBattles } from './ui2Fixtures'

for (const width of [2560, 3440]) {
  test(`desktop ${width}px keeps readable content and a viewport-sized card reveal`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 1280 } })
    const page = await context.newPage()
    try {
      await importTestArmy(page)
      const { duel } = await seedDesignBattles(page)
      await page.goto(`/battle/${duel}`)
      const reveal = page.getByRole('dialog', { name: 'Your Secondary Missions' })
      await expect(reveal).toBeVisible()
      // Check after entrance animations, which must not trap a fixed overlay.
      await expect.poll(async () => {
        const box = await page.locator('.secondary-draw-reveal').boundingBox()
        return box && Math.round(box.width)
      }).toBe(width)
      const scrim = await page.locator('.secondary-draw-reveal__scrim').boundingBox()
      expect(scrim!.x).toBe(0)
      expect(scrim!.y).toBe(0)
      expect(scrim!.height).toBe(1280)
      const dialog = await reveal.boundingBox()
      expect(dialog!.width).toBeGreaterThanOrEqual(600)
      expect(Math.abs(dialog!.x + dialog!.width / 2 - width / 2)).toBeLessThan(2)
      await expect(reveal.getByRole('button', { name: 'Keep cards', exact: true })).toBeInViewport()
      await reveal.getByRole('button', { name: 'Keep cards', exact: true }).click()
      for (const panel of ['overview', 'cards', 'objectives', 'army'] as const) {
        await selectPanel(page, panel)
        const content = await page.locator('.battle-panel:visible').boundingBox()
        expect(content!.width).toBeGreaterThanOrEqual(1300)
        expect(content!.width).toBeLessThanOrEqual(1440)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      }
      await selectPanel(page, 'overview')
      expect((await page.locator('.tactical-column--primary:visible').boundingBox())!.width).toBeGreaterThan(600)
      await page.screenshot({ path: `test-results/desktop-${width}.png` })
    } finally { await context.close() }
  })
}
