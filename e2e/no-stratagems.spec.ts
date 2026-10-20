import { expect, test } from '@playwright/test'
import { importTestArmy, phone, selectPanel } from './helpers'
import { seedDesignBattles } from './ui2Fixtures'

test('battle keeps manual CP and phase navigation without loading or showing Stratagem assistance', async ({ browser }) => {
  const { context, page } = await phone(browser)
  const metadataRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/rulesData/40kdc/')) metadataRequests.push(request.url())
  })
  try {
    await importTestArmy(page)
    const { ffa } = await seedDesignBattles(page)
    await page.goto(`/battle/${ffa}`)
    await expect(page.locator('.score-card')).toHaveCount(3)
    await expect(page.locator('.opponent-stratagems, .stratagem-panel, .reaction-panel, .context-section--stratagems, .context-section--reactions, .rules-data-attribution')).toHaveCount(0)
    const score = page.locator('.score-card').first()
    const cp = score.locator('.score-card__metric--cp strong')
    const before = Number(await cp.textContent())
    await score.getByRole('button', { name: /^Gain 1 CP/ }).click()
    await expect(cp).toHaveText(String(before + 1))
    await score.getByRole('button', { name: /^Spend 1 CP/ }).click()
    await expect(cp).toHaveText(String(before))
    for (const phase of ['Charge', 'Fight', 'End']) {
      await page.locator('.next-phase').click()
      await expect(page.getByRole('heading', { name: `${phase} phase`, exact: true })).toBeVisible()
    }
    await page.reload()
    await expect(page.locator('.score-card').first().locator('.score-card__metric--cp strong')).toHaveText(String(before))
    expect(metadataRequests).toEqual([])
    expect(await page.evaluate(async () => {
      const session = (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!
      return session.state.events.filter((event) => ['STRATAGEM_USED', 'REACTION_WINDOW_OPENED'].includes(event.type)).length
    })).toBe(0)
  } finally { await context.close() }
})

for (const pause of ['automatic', 'manual'] as const) {
  test(`saved ${pause} reaction pause can be closed while preserving historical CP and Stratagem events`, async ({ browser }) => {
    const { context, page } = await phone(browser)
    try {
      await importTestArmy(page)
      const saved = await page.evaluate(async (pause) => {
        const { createCauldronGame } = await import('/src/rulesets/cauldronFFA3/session.ts')
        const { dispatchBattleEvents } = await import('/src/domain/battle/engine.ts')
        const { useStratagem, processReactionTrigger, requestReactionHold, getCurrentReactionWindow } = await import('/src/domain/stratagems/battleIntegration.ts')
        const { listArmies, saveBattle } = await import('/src/persistence/database.ts')
        const army = (await listArmies())[0].army
        const definition = { id: 'legacy-rule', kind: 'STRATAGEM' as const, name: 'Archived tactic', description: 'Historical test record', cpCost: 1, ownerScope: 'ANY_PLAYER' as const, phases: ['ANY' as const], triggers: ['PHASE_START' as const], reaction: false, usageLimits: [], source: 'Test' }
        let session = createCauldronGame({ gameId: `legacy-${pause}`, mode: 'duel', armies: [army], guidanceLevel: 'guided', players: [
          { id: 'p-a', name: 'Alpha', armyId: army.id, deploymentZone: 'A', turnPosition: 1, operationalPlanId: 'WYNISZCZENIE' },
          { id: 'p-b', name: 'Bravo', armyId: army.id, deploymentZone: 'B', turnPosition: 2, operationalPlanId: 'WYNISZCZENIE' },
        ] })
        session = dispatchBattleEvents(session, ['p-a', 'p-b'].map((playerId) => ({ type: 'CP_GAINED' as const, payload: { playerId, amount: 4 } })))
        session = useStratagem(session, { playerId: 'p-a', definition, trigger: 'PHASE_START' })
        const input = { trigger: 'PHASE_START' as const, definitionsByPlayer: { 'p-a': [], 'p-b': [{ ...definition, id: 'legacy-response', reaction: true }] } }
        session = pause === 'automatic' ? processReactionTrigger(session, input).session : requestReactionHold(session, 'p-b', input)
        if (!getCurrentReactionWindow(session)) throw new Error('Legacy test pause did not open')
        await saveBattle(session)
        return { id: session.setup.gameId, cp: session.state.players['p-a'].cp, history: session.state.events.map((event) => event.id) }
      }, pause)
      await page.goto(`/battle/${saved.id}`)
      await page.getByRole('button', { name: 'Keep cards', exact: true }).click()
      await page.getByRole('button', { name: 'Close legacy pause', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Close legacy pause', exact: true })).toHaveCount(0)
      await expect(page.locator('.score-card').first().locator('.score-card__metric--cp strong')).toHaveText(String(saved.cp))
      await page.reload()
      await expect(page.locator('.score-card')).toHaveCount(2)
      const restored = await page.evaluate(async () => {
        const session = (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!
        return { history: session.state.events.map((event) => event.id), pause: session.state.timing.activeReactionWindowId }
      })
      expect(restored.history.slice(0, saved.history.length)).toEqual(saved.history)
      expect(restored.pause).toBeFalsy()
      await selectPanel(page, 'log')
      await page.getByRole('button', { name: 'Full History', exact: true }).click()
      await expect(page.locator('.chronicle-entry').filter({ hasText: 'Archived tactic' })).toHaveCount(1)
    } finally { await context.close() }
  })
}
