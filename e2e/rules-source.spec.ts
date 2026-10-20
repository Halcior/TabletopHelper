import { expect, test, type Page } from '@playwright/test'
import { importTestArmy, phone, chooseCauldronPreset, openCustomRules, setupRules, setupCommanders, setupBattlefield, selectPanel } from './helpers'
import { seedDesignBattles } from './ui2Fixtures'
import fs from 'node:fs/promises'

const capture = process.env.CAPTURE_PRODUCT_UI === '1'
async function screenshot(page: Page, name: string, fullPage = false) {
  if (!capture) return
  await fs.mkdir('docs/product-polish/screenshots', { recursive: true })
  await page.screenshot({ path: `docs/product-polish/screenshots/${name}.png`, fullPage, animations: 'disabled' })
}

test('recommended formats are explicit, house settings stay collapsed and custom decks survive step navigation', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    const source = page.getByRole('region', { name: 'Rules Source', exact: true })
    await expect(source).toContainText('Official format')
    await expect(source).toContainText('Chapter Approved Duel 1v1')
    await expect(page.getByLabel('Primary mode')).toBeHidden()
    await expect(page.locator('.setup-custom-settings')).not.toHaveAttribute('open', '')
    await screenshot(page, 'setup-duel-mobile')

    await page.getByRole('button', { name: /FFA 3/ }).click()
    await expect(source).toContainText('Community format')
    await expect(source).toContainText('This is not an official GW format')
    await expect(source).toContainText('Balanced FFA v1')
    await expect(source).not.toContainText('Official format')
    await screenshot(page, 'setup-ffa-mobile', true)

    await chooseCauldronPreset(page)
    await expect(source).toContainText('Community format')
    await page.getByLabel('Secondary deck').selectOption('chapter-approved')
    await setupCommanders(page)
    await expect(page.getByRole('combobox', { name: 'Operational Plan', exact: true })).toHaveCount(3)
    await page.getByLabel('Player name', { exact: true }).first().fill('Commander Vale')
    await setupBattlefield(page)
    await expect(page.getByLabel('Battle setup summary')).toContainText('Community format')
    await expect(page.getByLabel('Battle setup summary')).toContainText('Operational Plans')
    await setupRules(page)
    await expect(page.getByLabel('Primary mode')).toHaveValue('cauldron')
    await expect(page.getByLabel('Secondary deck')).toHaveValue('chapter-approved')
    await page.getByRole('button', { name: /Use recommended preset/ }).click()
    await expect(page.getByLabel('Primary mode')).toHaveValue('chapter-approved-ffa')
    await setupCommanders(page)
    await expect(page.getByLabel('Player name', { exact: true }).first()).toHaveValue('Commander Vale')
    await expect(page.getByLabel('11th edition Primary')).toHaveCount(3)

    await setupRules(page)
    await page.getByRole('button', { name: /Doubles 2v2/ }).click()
    await expect(source).toContainText('Official format')
    await expect(source).toContainText('GW Doubles v1.0')
    await setupCommanders(page)
    await expect(page.getByLabel('Player name', { exact: true })).toHaveCount(4)
    await expect(page.getByRole('combobox', { name: 'Force Disposition', exact: true })).toHaveCount(2)
    await expect(page.getByRole('combobox', { name: 'Operational Plan', exact: true })).toHaveCount(0)
    await setupRules(page)
    await page.getByRole('button', { name: /Duel 1v1/ }).click()
    await expect(source).toContainText('Official format')
    await openCustomRules(page)
    await expect(page.getByLabel('Primary mode')).toHaveValue('chapter-approved-duel')
    expect(await page.evaluate(async () => (await (await import('/src/persistence/database.ts')).listRecentBattles(20)).length)).toBe(0)
  } finally { await context.close() }
})

for (const mode of ['duel', 'ffa3', 'doubles2v2']) {
  test(`direct ${mode} setup link starts and reloads the intended rules without custom selections`, async ({ browser }) => {
    const { context, page } = await phone(browser)
    try {
      await importTestArmy(page)
      await page.goto(`/battle/setup?mode=${mode}`)
      const source = page.getByRole('region', { name: 'Rules Source', exact: true })
      await expect(source).toContainText(mode === 'ffa3' ? 'Community format' : 'Official format')
      await setupCommanders(page)
      const strategies = page.getByRole('combobox', { name: 'Secondary strategy', exact: true })
      if (mode !== 'ffa3') {
        await expect(strategies).toHaveCount(2)
        for (const select of await strategies.all()) await expect(select).toHaveValue('tactical')
      }
      await setupBattlefield(page)
      await expect(page.getByLabel('Battle setup summary')).toContainText(mode === 'ffa3' ? 'Community format' : 'Official format')
      await page.getByRole('button', { name: 'Start locally', exact: true }).click()
      await expect(page.locator('.score-card')).toHaveCount(mode === 'ffa3' ? 3 : 2)
      const saved = await page.evaluate(async () => {
        const session = (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!
        return { config: session.setup.rulesetConfig, players: session.setup.players.map(({ deploymentZone, turnPosition }) => ({ deploymentZone, turnPosition })) }
      })
      expect(saved.config).toMatchObject({ mode, primaryDeck: mode === 'ffa3' ? 'chapter-approved-ffa' : 'chapter-approved-duel', secondaryDeck: 'chapter-approved' })
      if (mode === 'doubles2v2') expect(saved.players).toEqual([
        { deploymentZone: 'A', turnPosition: 1 }, { deploymentZone: 'A', turnPosition: 1 },
        { deploymentZone: 'B', turnPosition: 2 }, { deploymentZone: 'B', turnPosition: 2 },
      ])
      await page.reload()
      await expect(page.locator('.score-card')).toHaveCount(mode === 'ffa3' ? 3 : 2)
      expect(await page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.setup.rulesetConfig)).toEqual(saved.config)
    } finally { await context.close() }
  })
}

test('product shell stays static, readable and usable across phone and desktop sizes', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await importTestArmy(page)
    const { ffa } = await seedDesignBattles(page)
    await page.goto('/')
    await expect(page.getByRole('link', { name: /Resume battle/ })).toBeVisible()
    await screenshot(page, 'home-mobile')
    await page.setViewportSize({ width: 1440, height: 1000 })
    await screenshot(page, 'home-desktop')
    await page.goto('/battle/setup')
    await expect(page.getByRole('region', { name: 'Rules Source', exact: true })).toBeVisible()
    await screenshot(page, 'setup-duel-desktop', true)
    await page.goto(`/battle/${ffa}`)
    await expect(page.locator('.score-card')).toHaveCount(3)
    await screenshot(page, 'battle-desktop')
    for (const width of [320, 360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 821 ? 844 : 1000 })
      await selectPanel(page, 'overview')
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), `overflow at ${width}`).toBe(false)
      await expect(page.locator('.score-card.is-active .score-card__role')).toHaveText('Active')
      await expect(page.locator('.phase-step--current strong')).toHaveText('Shooting')
      const buttons = await page.locator('.score-card .compact-controls button').evaluateAll((elements) => elements.map((el) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })))
      expect(buttons.every(({ width, height }) => width >= 44 && height >= 44), `CP targets at ${width}`).toBe(true)
      const background = await page.locator('.app-background').evaluate((element) => ({ pointerEvents: getComputedStyle(element).pointerEvents, animation: getComputedStyle(element).animationName, hidden: element.getAttribute('aria-hidden') }))
      expect(background).toEqual({ pointerEvents: 'none', animation: 'none', hidden: 'true' })
      if (width === 390) await screenshot(page, 'battle-mobile')
    }
  } finally { await context.close() }
})
