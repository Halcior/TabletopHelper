import { expect, test, type Page } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone, scoreCard } from './helpers'
import { MockSupabase } from './mockSupabase'

async function join(page: Page, roomCode: string, seat: string) {
  await page.goto(`/shared?room=${roomCode}`)
  await page.locator(`input[name="shared-seat"][value="${seat}"]`).check()
  await page.getByRole('button', { name: 'Join lobby' }).click()
}

async function endTacticalTurn(owner: Page, phones: Page[], name: string, last = false) {
  // The other commander's name can already appear as Current Rival before handoff.
  await expect(owner.locator('.battle-turn__mobile-meta strong')).toHaveText(name)
  await expect(owner.locator('.phase-step--current strong')).toHaveText('Command')
  await expect(owner.getByRole('button', { name: 'Keep cards', exact: true })).toBeVisible()
  await dismissSecondaryReveal(owner)
  for (let index = 0; index < 6; index += 1) await owner.locator('.next-phase').click()
  await expect(owner.getByRole('heading', { name: 'End Turn Review' })).toBeVisible()
  for (const page of phones) await expect(page.locator('.phase-step--current strong')).toHaveText('End')
  const kills = owner.getByLabel('Current Rival units destroyed this turn', { exact: true })
  if (await kills.isVisible()) {
    await kills.fill('1')
    const losses = owner.getByLabel('Own units destroyed by current Rival since your previous turn', { exact: true })
    if (await losses.isVisible()) await losses.fill('0')
  }
  const discards = owner.getByLabel('Discard at the end of this turn', { exact: true })
  const count = await discards.count()
  for (let index = 0; index < count; index += 1) await discards.nth(index).check()
  if (count > 0) await owner.getByRole('button', { name: /^Discard \d+ card\(s\) · gain 1 CP$/ }).click()
  for (const page of phones) {
    const acknowledge = page.getByRole('button', { name: `Finished reviewing ${name}’s turn · no more cards to score`, exact: true })
    if (await acknowledge.isVisible()) await acknowledge.click()
  }
  await expect(owner.getByText('Secondary review pending', { exact: true })).toBeHidden()
  await owner.getByRole('button', { name: 'Apply Primary scoring', exact: true }).click()
  const finish = owner.getByRole('button', { name: last ? 'Continue to Battle Round review' : /End turn →/ })
  await expect(finish).toBeEnabled()
  await finish.click()
  if (last) await owner.getByRole('button', { name: 'Confirm end round', exact: true }).click()
}

test('three Tactical phones keep Primary Rival scopes after turn handoffs, round rotation and reload', async ({ browser }) => {
  test.setTimeout(90_000)
  const backend = new MockSupabase()
  const alpha = await phone(browser, backend)
  const bravo = await phone(browser, backend)
  const charlie = await phone(browser, backend)
  const pages = [alpha.page, bravo.page, charlie.page]
  try {
    await importTestArmy(alpha.page)
    await alpha.page.getByRole('button', { name: /FFA 3/ }).click()
    await alpha.page.getByLabel('Primary mode').selectOption('chapter-approved-ffa')
    await alpha.page.getByLabel('Secondary deck').selectOption('chapter-approved')
    await alpha.page.getByLabel('Secondary strategy').selectOption('tactical')
    await alpha.page.getByLabel('Guidance level').selectOption('fast')
    await expect(alpha.page.getByLabel('Objective layout')).toHaveValue('expanded-7')
    await alpha.page.getByRole('button', { name: 'Create 3-player lobby' }).click()
    const code = (await alpha.page.locator('.shared-room-focus__code strong').textContent())!.trim()
    await join(bravo.page, code, 'player-b')
    await join(charlie.page, code, 'player-c')
    for (const page of pages) await page.getByRole('button', { name: 'I am ready' }).click()
    await alpha.page.getByRole('button', { name: 'Start battle' }).click()
    for (const page of pages) await expect(page).toHaveURL(/\/battle\//)
    const oddRivals = ['Player II · B-HOME', 'Player III · C-HOME', 'Player I · A-HOME']
    for (const [index, page] of pages.entries()) {
      await expect(page.locator('.ruleset-label').nth(1)).toHaveText('Chapter Approved · Tactical')
      await expect(page.locator('.official-primary-panel').first()).toContainText(`Current Rival: ${oddRivals[index]} · Battle Round 1`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    }

    await endTacticalTurn(alpha.page, pages, 'Player I')
    await expect(bravo.page.locator('.battle-turn__mobile-meta strong')).toHaveText('Player II')
    await endTacticalTurn(bravo.page, pages, 'Player II')
    for (const page of pages) await expect(scoreCard(page, 'Player II').locator('.score-card__numbers strong').first()).toHaveText('3')
    await endTacticalTurn(charlie.page, pages, 'Player III', true)
    const evenRivals = ['Player III · C-HOME', 'Player I · A-HOME', 'Player II · B-HOME']
    for (const [index, page] of pages.entries()) {
      await expect(page.locator('.official-primary-panel').first()).toContainText(`Current Rival: ${evenRivals[index]} · Battle Round 2`)
    }
    await bravo.page.reload()
    await bravo.page.getByRole('link', { name: 'Open battle', exact: true }).click()
    await expect(bravo.page.locator('.official-primary-panel').first()).toContainText('Current Rival: Player I · A-HOME · Battle Round 2')
    await expect(scoreCard(bravo.page, 'Player II').locator('.score-card__numbers strong').first()).toHaveText('3')
    await endTacticalTurn(alpha.page, pages, 'Player I')
    await endTacticalTurn(bravo.page, pages, 'Player II')
    for (const page of pages) await expect(scoreCard(page, 'Player II').locator('.score-card__numbers strong').first()).toHaveText('11')
    if (process.env.CAPTURE_UI === '1') await bravo.page.screenshot({ path: 'test-results/visual-ffa-current-rival.png', fullPage: true })
  } finally {
    await Promise.all([alpha.context.close(), bravo.context.close(), charlie.context.close()])
  }
})
