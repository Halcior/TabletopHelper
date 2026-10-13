import { expect, test, type Page } from '@playwright/test'
import { importTestArmy, phone, selectPanel } from './helpers'
import { seedDesignBattles } from './ui2Fixtures'

async function changeContext(page: Page, round: number, playerId: string, phase: 'COMMAND' | 'SHOOTING' | 'END_TURN') {
  await page.evaluate(async ({ round, playerId, phase }) => {
    const { useBattleStore } = await import('/src/stores/battleStore.ts')
    const { dispatchBattleEvents } = await import('/src/domain/battle/engine.ts')
    const { createSecondaryRefillEvents, getSecondaryState } = await import('/src/rulesets/cauldronFFA3/secondary.ts')
    const store = useBattleStore.getState()
    let session = dispatchBattleEvents(store.session!, [
      { type: 'ROUND_STARTED', payload: { round } },
      { type: 'TURN_STARTED', payload: { playerId } },
      { type: 'PHASE_CHANGED', payload: { phase } },
    ])
    if (phase === 'COMMAND' && getSecondaryState(session)[playerId].active.length === 0) {
      session = dispatchBattleEvents(session, createSecondaryRefillEvents(session, playerId))
    }
    useBattleStore.setState({ session })
  }, { round, playerId, phase })
}

test('Duel Primary retains tab drafts but requires fresh confirmations after a round, player or window change', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    const { duel } = await seedDesignBattles(page)
    await page.goto(`/battle/${duel}`)
    await page.getByRole('button', { name: 'Keep cards', exact: true }).click()
    await changeContext(page, 2, 'p-a', 'COMMAND')
    await selectPanel(page, 'cards')
    const primary = page.locator('.duel-primary-panel:visible')
    const counts = primary.getByRole('spinbutton')
    await counts.first().fill('3')
    await counts.nth(1).fill('2')
    await expect(primary.getByRole('button', { name: /Confirm end of command phase/ })).toContainText('+13 VP')
    await selectPanel(page, 'army')
    await selectPanel(page, 'cards')
    await expect(counts.first()).toHaveValue('3')
    await primary.getByRole('button', { name: /Confirm end of command phase/ }).click()
    await expect(primary.getByRole('status')).toContainText('+13 VP')
    // The panel remains mounted while hidden during the next round transition.
    await selectPanel(page, 'army')
    await changeContext(page, 3, 'p-a', 'COMMAND')
    await selectPanel(page, 'cards')
    await expect(counts.first()).toHaveValue('0')
    await expect(counts.nth(1)).toHaveValue('0')
    await primary.getByRole('button', { name: /Confirm end of command phase/ }).click()
    await expect(primary.getByRole('status')).toContainText('+0 VP')
    const score = await page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.state.players['p-a'].score.primary)
    expect(score).toBe(13)
    await changeContext(page, 4, 'p-a', 'COMMAND')
    await counts.first().fill('2')
    await changeContext(page, 4, 'p-b', 'COMMAND')
    await expect(primary.getByRole('heading', { level: 2 })).toContainText('Shield Host')
    await expect(counts.first()).toHaveValue('0')
    await counts.first().fill('1')
    await changeContext(page, 4, 'p-b', 'END_TURN')
    await expect(primary.getByRole('heading', { level: 3 })).toContainText('End of turn')
    await changeContext(page, 5, 'p-b', 'END_TURN')
    await expect(counts.first()).toHaveValue('0')
  } finally { await context.close() }
})

test('Secondary action and discard drafts stay on tab switches and reset on phase, turn and player changes', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await importTestArmy(page)
    const { ffa } = await seedDesignBattles(page)
    await page.goto(`/battle/${ffa}`)
    await selectPanel(page, 'cards')
    const cards = page.locator('.official-secondary-panel:visible')
    const plunder = cards.locator('.secondary-card').filter({ has: page.getByRole('heading', { name: 'Plunder', exact: true }) })
    const unit = plunder.getByLabel('Acting unit')
    const unitId = (await unit.locator('option').nth(1).getAttribute('value'))!
    await unit.selectOption(unitId)
    await plunder.getByPlaceholder('Location on the table').fill('Old action draft')
    await selectPanel(page, 'army')
    await selectPanel(page, 'cards')
    await expect(unit).toHaveValue(unitId)
    await expect(plunder.getByPlaceholder('Location on the table')).toHaveValue('Old action draft')
    await changeContext(page, 3, 'p-a', 'END_TURN')
    await selectPanel(page, 'cards')
    const discard = plunder.getByRole('checkbox', { name: 'Discard at the end of this turn', exact: true })
    await discard.check()
    await expect(discard).toBeChecked()
    await selectPanel(page, 'army')
    await selectPanel(page, 'cards')
    await expect(discard).toBeChecked()
    await selectPanel(page, 'army')
    await changeContext(page, 4, 'p-b', 'COMMAND')
    const keep = page.getByRole('button', { name: 'Keep cards', exact: true })
    if (await keep.isVisible()) await keep.click()
    await changeContext(page, 4, 'p-b', 'SHOOTING')
    await selectPanel(page, 'cards')
    await expect(cards.getByRole('heading', { level: 2 })).toContainText('Shield Host')
    await expect(unit).toHaveValue('')
    await expect(plunder.getByPlaceholder('Location on the table')).toHaveValue('')
    await changeContext(page, 4, 'p-b', 'END_TURN')
    await selectPanel(page, 'cards')
    await expect(discard).not.toBeChecked()
    await discard.check()
    await changeContext(page, 5, 'p-b', 'END_TURN')
    await selectPanel(page, 'cards')
    await expect(discard).not.toBeChecked()
    await changeContext(page, 5, 'p-a', 'SHOOTING')
    await selectPanel(page, 'cards')
    await expect(unit).toHaveValue('')
    await expect(plunder.getByPlaceholder('Location on the table')).toHaveValue('')
  } finally { await context.close() }
})
