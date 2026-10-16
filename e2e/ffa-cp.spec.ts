import { expect, test } from '@playwright/test'
import { phone, scoreCard } from './helpers'

test('new FFA starts with automatic +2 CP for every commander and keeps manual CP controls', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/battle/setup?mode=ffa3')
    await expect(page.getByRole('note')).toContainText('Every commander automatically receives +2 CP')
    const gameId = await page.evaluate(async () => {
      const { createCauldronGame } = await import('/src/rulesets/cauldronFFA3/session.ts')
      const { testArmy } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const armies = ['a', 'b', 'c'].map((id) => testArmy(`ffa-cp-e2e-${id}`))
      const session = createCauldronGame({
        gameId: 'ffa-cp-e2e',
        mode: 'ffa3',
        guidanceLevel: 'fast',
        armies,
        players: armies.map((army, i) => ({
          id: `p-${'abc'[i]}`, name: ['Alpha', 'Bravo', 'Charlie'][i],
          armyId: army.id, deploymentZone: 'ABC'[i] as 'A' | 'B' | 'C',
          turnPosition: (i + 1) as 1 | 2 | 3,
          operationalPlanId: 'WYNISZCZENIE' as const,
        })),
      })
      await saveBattle(session)
      return session.setup.gameId
    })
    await page.goto(`/battle/${gameId}`)
    await expect(page.locator('.score-card')).toHaveCount(3)
    for (const name of ['Alpha', 'Bravo', 'Charlie']) {
      await expect(scoreCard(page, name).locator('.score-card__numbers strong').nth(1)).toHaveText('2')
      await expect(page.getByRole('button', { name: `Gain 1 CP for ${name}` })).toBeVisible()
    }
    const cp = await page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      const session = useBattleStore.getState().session!
      return {
        grants: session.state.events.filter((event) => event.type === 'CP_GAINED').map((event) => event.payload.amount),
        markers: session.state.events.filter((event) => event.type === 'RULESET_EVENT' && event.payload.action === 'FFA_ROUND_CP_GRANTED').length,
      }
    })
    expect(cp).toEqual({ grants: [2, 2, 2], markers: 1 })
  } finally {
    await context.close()
  }
})
