import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import { importTestArmy, selectPanel } from './helpers'
import { seedDesignBattles } from './ui2Fixtures'

const capture = process.env.REFERENCE_UI_CAPTURE
async function shot(page: Page, width: number, name: string, fullPage = false) {
  if (!capture || (capture === 'before' && width !== 390)) return
  const folder = `docs/reference-ui/screenshots/${capture}`
  await fs.mkdir(folder, { recursive: true })
  await page.screenshot({ path: `${folder}/${width}-${name}.png`, fullPage, animations: 'disabled' })
}

for (const [width, height] of [[375, 812], [390, 844], [768, 1024], [1440, 1000]]) {
  test(`reference surfaces at ${width}px retain real controls and fit the viewport`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 821, hasTouch: width < 821, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    try {
      await importTestArmy(page)
      await expect(page.getByRole('region', { name: 'Rules Source', exact: true })).toContainText('Official format')
      if (capture !== 'before') await page.evaluate(async () => {
        const source = getComputedStyle(document.documentElement).getPropertyValue('--scene-art').match(/url\(["']?([^"')]+)["']?\)/)?.[1]
        if (!source) throw new Error('Missing original panorama')
        const image = new Image()
        image.src = source
        await image.decode()
      })
      if (width <= 820) {
        const formatCards = await page.locator('.setup-mode-picker > button').evaluateAll((cards) =>
          cards.map((card) => Math.round(card.getBoundingClientRect().height)))
        expect(Math.max(...formatCards), `Format cards must stay compact at ${width}px`).toBeLessThanOrEqual(190)
      }
      await shot(page, width, 'setup', true)
      const { ffa } = await seedDesignBattles(page)
      await page.goto(`/battle/${ffa}`)
      await expect(page.locator('.score-card')).toHaveCount(3)
      const missionStrip = page.getByRole('region', { name: 'Mission score summary' })
      await expect(missionStrip).toBeVisible()
      await expect(missionStrip.getByRole('button', { name: 'Open mission cards: Primary' })).toBeVisible()
      await expect(missionStrip.getByRole('button', { name: 'Open mission cards: Secondary' })).toBeVisible()
      await shot(page, width, 'live')
      await selectPanel(page, 'objectives')
      await expect(page.locator('.battlefield-canvas > svg').first()).toBeVisible()
      await page.locator('.battlefield-frame').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      await shot(page, width, 'objectives')
      await selectPanel(page, 'log')
      await expect(page.locator('.chronicle-entry').first()).toBeVisible()
      await expect(page.locator('.chronicle-entry--scoring').first()).toBeVisible()
      await expect(page.locator('.chronicle-entry--objective-control').first()).toBeVisible()
      await page.locator('.chronicle-timeline').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
      await shot(page, width, 'chronicle')
      await selectPanel(page, 'report')
      await expect(page.locator('.report-ranking')).toBeVisible()
      await page.locator('.report-ranking').evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      await shot(page, width, 'report')
      await selectPanel(page, 'army')
      await expect(page.locator('.unit-grid .unit-card').first()).toBeVisible()
      await page.locator('.unit-grid').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
      await shot(page, width, 'army')
      for (const panel of ['overview', 'army', 'objectives', 'log', 'report'] as const) {
        await selectPanel(page, panel)
        expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `${panel} overflow at ${width}`).toBe(false)
        await expect(page.locator('.next-phase')).toBeInViewport()
      }
      expect(errors).toEqual([])
    } finally { await context.close() }
  })
}

test('steel surfaces retain text contrast and setup works when artwork cannot load', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await context.route('**/*outpost-panorama*.webp', (route) => route.abort())
  const page = await context.newPage()
  try {
    await importTestArmy(page)
    const pairs = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const luminance = (hex: string) => {
        const channels = hex.trim().replace('#', '').match(/.{2}/g)!.map((value) => parseInt(value, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
      }
      const ratio = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
      return ['--text-primary', '--text-secondary', '--status-info'].flatMap((text) => ['--surface', '--surface-elevated', '--surface-sunken'].map((surface) => ({ text, surface, ratio: ratio(root.getPropertyValue(text), root.getPropertyValue(surface)) })))
    })
    for (const pair of pairs) expect(pair.ratio, `${pair.text} on ${pair.surface}`).toBeGreaterThanOrEqual(4.5)
    const advanced = page.locator('.setup-custom-settings')
    await advanced.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(advanced).toHaveAttribute('open', '')
    await expect(page.getByLabel('Primary mode')).toBeVisible()
    await page.getByRole('button', { name: /FFA 3/ }).click()
    await expect(page.getByRole('region', { name: 'Rules Source', exact: true })).toContainText('Community format')
    expect(await page.locator('.app-background').evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none')
  } finally { await context.close() }
})

test('long imported names survive landscape rotation and objective controls remain keyboard accessible', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const longName = 'Shield-Captain of the Unbroken Expedition — Allarus Terminator Armour'
  try {
    await importTestArmy(page)
    const { ffa } = await seedDesignBattles(page)
    await page.goto(`/battle/${ffa}`)
    await expect(page.locator('.score-card')).toHaveCount(3)
    await page.evaluate(async (name) => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      const session = structuredClone(useBattleStore.getState().session!)
      const army = session.setup.armies[session.state.players[session.state.activePlayerId].armyId!]
      army.units[0].name = name
      useBattleStore.setState({ session })
    }, longName)
    await selectPanel(page, 'army')
    await expect(page.locator('.unit-grid').getByRole('heading', { name: longName, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await page.setViewportSize({ width: 844, height: 390 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    await selectPanel(page, 'objectives')
    const node = page.locator('.objective-node[data-objective-id="CENTER"]')
    await node.focus()
    await page.keyboard.press('Enter')
    const controls = page.getByRole('dialog', { name: 'Objective controls for CENTER', exact: true })
    await expect(controls).toBeInViewport()
    const sizes = await controls.getByRole('button').evaluateAll((buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })))
    expect(sizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(controls).toHaveCount(0)
    await expect(page.locator('.next-phase')).toBeInViewport()
  } finally { await context.close() }
})
