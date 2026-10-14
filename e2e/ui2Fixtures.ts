import type { Page } from '@playwright/test'

// Representative synthetic sessions, created through the real engine and Dexie.
export async function seedDesignBattles(page: Page) {
  return page.evaluate(async () => {
      const { listArmies, saveBattle } = await import('/src/persistence/database.ts')
      const { createCauldronGame } = await import('/src/rulesets/cauldronFFA3/session.ts')
      const { dispatchBattleEvents } = await import('/src/domain/battle/engine.ts')
      const { OFFICIAL_SECONDARY_IDS } = await import('/src/rulesets/cauldronFFA3/officialSecondaryDefinitions.ts')
      const army = (await listArmies())[0].army
      const players = ['p-a', 'p-b', 'p-c'].map((id, index) => ({ id, name: ['Custodes', 'Shield Host', 'Moritoi'][index], armyId: army.id, deploymentZone: 'ABC'[index], turnPosition: index + 1, operationalPlanId: 'WYNISZCZENIE', officialPrimaryId: ['battlefield-dominance', 'meatgrinder', 'outmanoeuvre'][index], forceDisposition: 'take-and-hold' }))
      const firstCards = ['OFFICIAL_CLEANSE', 'OFFICIAL_PLUNDER', 'OFFICIAL_BEACON', 'OFFICIAL_ENGAGE_ON_ALL_FRONTS']
      const deck = [...firstCards, ...OFFICIAL_SECONDARY_IDS.filter((id) => !firstCards.includes(id))]
      let ffa = createCauldronGame({ gameId: 'ui2-demo-ffa', createdAt: '2026-10-13T10:00:00Z', armies: [army], players, guidanceLevel: 'fast', primaryDeck: 'chapter-approved-ffa', secondaryDeck: 'chapter-approved', secondaryDeckOrders: Object.fromEntries(players.map((player) => [player.id, deck])) })
      ffa = dispatchBattleEvents(ffa, [
        { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'A-HOME', controllerPlayerId: 'p-a' } },
        { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'B-HOME', controllerPlayerId: 'p-b' } },
        { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'C-HOME', controllerPlayerId: 'p-c' } },
        { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'primary', delta: 15 } },
        { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-b', category: 'primary', delta: 13 } },
        { type: 'ROUND_STARTED', payload: { round: 3 } },
        { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } },
        { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'secondary', delta: 12 } },
        { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-b', category: 'secondary', delta: 11 } },
        { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-c', category: 'primary', delta: 21 } },
        { type: 'CP_GAINED', payload: { playerId: 'p-a', amount: 3 } },
        { type: 'CP_GAINED', payload: { playerId: 'p-b', amount: 2 } },
        { type: 'CP_GAINED', payload: { playerId: 'p-c', amount: 4 } },
        { type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: 'CENTER', controllerPlayerId: 'p-a' } },
        { type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: army.units.find((unit) => unit.startingModels > 1)!.id, amount: 1, destroyedByPlayerId: 'p-a', attackerUnitId: army.units[0].id } },
      ], { timestamp: '2026-10-13T10:30:00Z' })
      const duel = createCauldronGame({ gameId: 'ui2-demo-duel', armies: [army], players: players.slice(0, 2), guidanceLevel: 'fast', primaryDeck: 'chapter-approved-duel', secondaryDeck: 'chapter-approved', officialLayout: 3, secondaryDeckOrders: Object.fromEntries(players.slice(0, 2).map((player) => [player.id, deck])) })
      await saveBattle(duel)
      await saveBattle(ffa)
      return { ffa: ffa.setup.gameId, duel: duel.setup.gameId }
    })
}
