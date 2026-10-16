import { setupBattlefield } from './helpers'
import { expect, test, type Page } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone, scoreCard } from './helpers'
import { MockSupabase } from './mockSupabase'
import fs from 'node:fs/promises'

async function captureLobby(page: Page, name: string) {
  if (process.env.CAPTURE_UI2 !== '1') return
  await fs.mkdir('docs/ui-2/after', { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.screenshot({ path: `docs/ui-2/after/${name}.png`, fullPage: true })
}

async function joinLobby(page: Page, roomCode: string, playerId: string): Promise<void> {
  await page.goto(`/shared?room=${roomCode}`)
  await expect(page.getByRole('heading', { name: 'Choose your commander' })).toBeVisible()
  await page.locator(`input[name="shared-seat"][value="${playerId}"]`).check()
  await page.getByRole('button', { name: 'Join lobby' }).click()
  await expect(page.getByText('Waiting room')).toBeVisible()
}

test('three phones start, synchronize and recover one idempotent offline action', async ({ browser }) => {
  const backend = new MockSupabase()
  const alpha = await phone(browser, backend)
  const bravo = await phone(browser, backend)
  const charlie = await phone(browser, backend)

  try {
    await importTestArmy(alpha.page)
    await alpha.page.getByRole('button', { name: /FFA 3/ }).click()
    await setupBattlefield(alpha.page)
    await alpha.page.getByLabel('Guidance level').selectOption('fast')
    await setupBattlefield(alpha.page)
    await alpha.page.getByRole('button', { name: 'Create 3-player lobby' }).click()
    await expect(alpha.page.getByText('Waiting room')).toBeVisible()
    await expect(alpha.page.locator('.shared-lobby-seat')).toHaveCount(3)
    await expect(alpha.page.locator('.shared-lobby-seat__marker')).toHaveText(['01', '02', '03'])
    await captureLobby(alpha.page, 'lobby-waiting-mobile')
    await alpha.page.getByRole('button', { name: 'Enlarge QR invite' }).click()
    await expect(alpha.page.getByRole('dialog', { name: 'QR room invite' })).toBeVisible()
    await captureLobby(alpha.page, 'lobby-qr-mobile')
    await alpha.page.getByRole('button', { name: 'Close QR invite' }).click()
    const roomCode = (await alpha.page.locator('.shared-room-focus__code strong').textContent())?.trim()
    expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)

    await joinLobby(bravo.page, roomCode!, 'player-b')
    await joinLobby(charlie.page, roomCode!, 'player-c')

    for (const page of [alpha.page, bravo.page, charlie.page]) {
      const ready = page.getByRole('button', { name: 'I am ready' })
      await expect(ready).toBeEnabled()
      await ready.click()
    }

    await expect(alpha.page.locator('.shared-lobby-seat.is-ready')).toHaveCount(3)
    await captureLobby(alpha.page, 'lobby-ready-mobile')
    if (process.env.CAPTURE_UI === '1') await alpha.page.screenshot({ path: 'test-results/visual-lobby.png', fullPage: true })

    const start = alpha.page.getByRole('button', { name: 'Start battle' })
    await expect(start).toBeEnabled()
    await start.click()
    await Promise.all([alpha.page, bravo.page, charlie.page].map((page) => expect(page).toHaveURL(/\/battle\//)))
    await dismissSecondaryReveal(alpha.page)
    await expect(alpha.page.locator('.shared-secondary-card__icon')).toHaveCount(2)

    await expect(alpha.page.getByRole('button', { name: 'Gain 1 CP for Player II' })).toHaveCount(0)
    await alpha.page.getByRole('button', { name: 'Gain 1 CP for Player I' }).click()
    await expect(scoreCard(bravo.page, 'Player I').locator('.score-card__numbers strong').nth(1)).toHaveText('3')

    await bravo.context.setOffline(true)
    await expect(bravo.page.getByText('This phone is offline')).toBeVisible()

    await bravo.page.getByRole('button', { name: 'Gain 1 CP for Player II' }).click()
    await expect(scoreCard(bravo.page, 'Player II').locator('.score-card__numbers strong').nth(1)).toHaveText('3')

    backend.failNextEventInsertAfterCommitForPlayerId = 'player-b'
    await bravo.context.setOffline(false)
    await expect(scoreCard(alpha.page, 'Player II').locator('.score-card__numbers strong').nth(1)).toHaveText('3')

    const stored = backend.storedEvents('CP_GAINED', 'player-b')
    expect(stored).toHaveLength(1)
    await expect.poll(() => backend.attemptsFor(stored[0].event_id)).toBeGreaterThanOrEqual(2)
    expect(backend.storedEvents('CP_GAINED', 'player-b')).toHaveLength(1)
    await expect(bravo.page.getByText('This phone is offline')).toBeHidden()

    const target = await alpha.page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      const session = useBattleStore.getState().session!
      const armyId = session.state.players['player-b'].armyId!
      const unit = session.setup.armies[armyId].units.find((unit) => unit.startingModels > 1 && (unit.stats?.wounds ?? 0) >= 3)!
      return { id: unit.id, wounds: unit.stats!.wounds!, models: unit.startingModels }
    })
    // Resolve the Vite module while each browser is ONLINE. A dynamic import
    // after setOffline() can race a dev-client navigation on CI and destroy the
    // page.evaluate execution context before combat gets recorded.
    await Promise.all([alpha.page, bravo.page, charlie.page].map(async (page) => {
      await page.evaluate(async () => {
        const { useBattleStore } = await import('/src/stores/battleStore.ts')
        Object.assign(window, { __combatTestStore: useBattleStore })
      })
      await expect(page).toHaveURL(/\/battle\//)
    }))
    await Promise.all([alpha.context.setOffline(true), bravo.context.setOffline(true)])
    const recordWound = async (page: Page) => {
      // The guard also makes a transient evaluate/navigation retry safe: a
      // successful dispatch must never record the same Wound a second time.
      await expect(async () => {
        const result = await page.evaluate(({ unitId, before }) => {
          const store = (window as typeof window & {
            __combatTestStore?: {
              getState: () => {
                session: { state: { players: Record<string, { units: Record<string, { currentModelWounds?: number }> }> } } | null
                dispatch: (event: unknown) => void
              }
            }
          }).__combatTestStore
          const session = store?.getState().session
          const unit = session?.state.players['player-b']?.units[unitId]
          if (!unit) return 'not-ready'
          if (unit.currentModelWounds === before - 1) return 'recorded'
          if (unit.currentModelWounds !== before) return 'unexpected-state'
          store!.getState().dispatch({
            type: 'UNIT_COMBAT_RESOLVED',
            payload: {
              playerId: 'player-b', unitId, kind: 'damage',
              destroyedByPlayerId: 'player-a',
              allocations: [{ profileId: 'unit', wounds: 1 }],
            },
          })
          return store!.getState().session?.state.players['player-b']?.units[unitId]?.currentModelWounds === before - 1
            ? 'recorded' : 'not-recorded'
        }, { unitId: target.id, before: target.wounds })
        expect(result).toBe('recorded')
      }).toPass({ timeout: 10_000, intervals: [150, 350, 700] })
    }
    await recordWound(alpha.page)
    await recordWound(bravo.page)
    backend.failNextEventInsertAfterCommitForPlayerId = 'player-b'
    await Promise.all([alpha.context.setOffline(false), bravo.context.setOffline(false)])
    for (const page of [alpha.page, bravo.page, charlie.page]) {
      await expect.poll(() => page.evaluate(async (unitId) => {
        const { useBattleStore } = await import('/src/stores/battleStore.ts')
        const state = useBattleStore.getState().session!.state.players['player-b'].units[unitId]
        return { wounds: state.currentModelWounds, models: state.modelsAlive }
      }, target.id)).toEqual({ wounds: target.wounds - 2, models: target.models })
    }
    expect(backend.storedEvents('UNIT_COMBAT_RESOLVED', 'player-b')).toHaveLength(2)
    expect(new Set(backend.storedEvents('UNIT_COMBAT_RESOLVED', 'player-b').map((event) => event.event_id)).size).toBe(2)
    const rejected = await charlie.page.evaluate(async (unitId) => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      const before = useBattleStore.getState().session!.state.events.length
      useBattleStore.getState().dispatch({ type: 'UNIT_COMBAT_RESOLVED', payload: { playerId: 'player-b', unitId, kind: 'damage', destroyedByPlayerId: 'player-c', allocations: [{ profileId: 'unit', wounds: 1 }] } })
      return { unchanged: before === useBattleStore.getState().session!.state.events.length, error: useBattleStore.getState().error }
    }, target.id)
    expect(rejected.unchanged).toBe(true)
    expect(rejected.error).toContain('only change their own')

  } finally {
    await Promise.all([alpha.context.close(), bravo.context.close(), charlie.context.close()])
  }
})
