import { test, expect, type Page } from '@playwright/test'
import { selectPanel, dismissSecondaryReveal, phone, PHONE } from './helpers'
import { MockSupabase } from './mockSupabase'
import { PostgresBackend } from './postgresBackend'

async function seed(page: Page, id = 'tracking-e2e') {
  await page.goto('/')
  await page.evaluate(async id => {
    const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
    const { saveBattle } = await import('/src/persistence/database.ts')
    const session = testCauldronGame()
    session.setup.gameId = id; session.state.gameId = id
    await saveBattle(session)
  }, id)
  await page.goto(`/battle/${id}`)
  await expect(page.getByRole('button', { name: 'Keep cards', exact: true })).toBeVisible()
  await dismissSecondaryReveal(page)
}
async function tactical(page: Page) {
  await selectPanel(page, 'objectives')
  await page.getByRole('button', { name: 'Tactical Map', exact: true }).click()
}
const token = (page: Page, player = 'p-a', unit = 'infantry') => page.locator(`.unit-map-token[data-player-id="${player}"][data-unit-id="${unit}"]`)
const tray = (page: Page, player = 'p-a', unit = 'infantry') => page.locator(`[data-tray-unit='["${player}","${unit}"]']`)
async function coordinatePlace(page: Page, player = 'p-a', unit = 'infantry', x = '25', y = '30') {
  const panel = page.locator('.tactical-tray')
  if (!await panel.evaluate(node => (node as HTMLDetailsElement).open)) await panel.locator(':scope > summary').click()
  const row = tray(page, player, unit)
  const group = row.locator('..')
  if (!await group.evaluate(node => (node as HTMLDetailsElement).open)) await group.locator(':scope > summary').click()
  await row.click()
  const details = page.getByRole('region', { name: 'Selected unit details' })
  const coordinates = details.locator('details').filter({ has: page.getByText('Keyboard / coordinate placement', { exact: true }) })
  if (!await coordinates.evaluate(node => (node as HTMLDetailsElement).open)) await coordinates.locator('summary').click()
  await details.getByLabel('Map X (%)').fill(x)
  await details.getByLabel('Map Y (%)').fill(y)
  await details.getByRole('button', { name: 'Save position', exact: true }).click()
}
async function countMoves(page: Page) {
  return page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.state.events.filter(event => event.type === 'UNIT_MAP_CHANGED').length)
}

test('desktop tracks deployment, drag once, reserves, refresh, historical combat and replay controls', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await seed(page)
  await tactical(page)
  await expect(page.locator('.unit-map-token')).toHaveCount(0)
  await page.getByRole('button', { name: 'Enable Unit Tracking', exact: true }).click()
  await coordinatePlace(page)
  await expect(token(page)).toHaveAttribute('data-board-x', '0.25')
  await expect(token(page)).toHaveAttribute('data-board-y', '0.3')
  await token(page).click()
  await page.locator('.battlefield-canvas').scrollIntoViewIfNeeded()
  const from = (await token(page).boundingBox())!, board = (await page.locator('.battlefield-canvas').boundingBox())!
  const count = await countMoves(page)
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(board.x + board.width * .7, board.y + board.height * .65, { steps: 15 })
  expect(await countMoves(page)).toBe(count)
  await expect(page.locator('.unit-map-preview')).toBeVisible()
  await page.mouse.up()
  expect(await countMoves(page)).toBe(count + 1)
  await expect(token(page)).toHaveAttribute('data-board-x', /0\.7/)
  const x = await token(page).getAttribute('data-board-x'), y = await token(page).getAttribute('data-board-y')
  await page.getByRole('button', { name: 'Rotate 180°', exact: true }).click()
  await expect(token(page)).toHaveAttribute('data-board-x', x!)
  await expect(token(page)).toHaveAttribute('data-board-y', y!)
  await token(page).focus(); await page.keyboard.press('ArrowRight')
  expect(Number(await token(page).getAttribute('data-board-x'))).toBeCloseTo(Number(x) - .01, 2)
  await page.getByRole('button', { name: 'Return to Reserves', exact: true }).click()
  await expect(token(page)).toHaveCount(0)
  await coordinatePlace(page)
  await page.getByRole('button', { name: 'Set as Unplaced', exact: true }).click()
  await expect(token(page)).toHaveCount(0)
  await coordinatePlace(page)
  await page.reload(); await tactical(page)
  await expect(token(page)).toHaveCount(1)
  const beforeCombat = await token(page).getAttribute('data-board-x')
  await coordinatePlace(page, 'p-b', 'infantry', '75', '70')
  await page.evaluate(async () => {
    const store = (await import('/src/stores/battleStore.ts')).useBattleStore
    store.getState().dispatch({ type: 'UNIT_MODEL_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', amount: 2, destroyedByPlayerId: 'p-a', attackerUnitId: 'infantry' } })
    store.getState().dispatch({ type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'infantry', destroyedByPlayerId: 'p-a', attackerUnitId: 'infantry' } })
  })
  await expect(token(page, 'p-b')).toHaveCount(0)
  await selectPanel(page, 'log')
  await page.locator('.chronicle-entry').filter({ hasText: 'Unit eliminated' }).getByRole('button', { name: 'Show on Tactical Map', exact: true }).first().click()
  await expect(page.locator('.battlefield-replay')).toBeVisible()
  await expect(page.locator('[data-attack-line]')).toHaveCount(1)
  await expect(page.locator('.combat-elimination')).toHaveCount(1)
  await expect(token(page)).toHaveAttribute('data-board-x', beforeCombat!)
  const live = await page.evaluate(async () => JSON.stringify((await import('/src/stores/battleStore.ts')).useBattleStore.getState().session))
  await page.getByRole('button', { name: 'Previous Event', exact: true }).click()
  await expect(token(page, 'p-b')).toHaveCount(1)
  await page.getByRole('button', { name: 'Next Event', exact: true }).click()
  await expect(token(page, 'p-b')).toHaveCount(0)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByLabel('Playback speed', { exact: true }).selectOption('4')
  await page.getByLabel('Replay event', { exact: true }).fill('0')
  await expect(page.locator('.unit-map-token')).toHaveCount(0)
  await page.getByRole('button', { name: 'Return to live', exact: true }).click()
  expect(await page.evaluate(async () => JSON.stringify((await import('/src/stores/battleStore.ts')).useBattleStore.getState().session))).toBe(live)
  await page.getByRole('button', { name: 'Disable Unit Tracking', exact: true }).click()
  await expect(page.locator('.unit-map-token')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('phone supports selected-token touch drag, tap placement, objective access and responsive views', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await seed(page, 'touch-tracking')
    await tactical(page)
    await page.getByRole('button', { name: 'Enable Unit Tracking', exact: true }).tap()
    await coordinatePlace(page)
    await token(page).tap()
    await page.locator('.battlefield-canvas').evaluate(node => window.scrollBy({ top: node.getBoundingClientRect().top - 130, behavior: 'instant' }))
    const from = (await token(page).boundingBox())!, board = (await page.locator('.battlefield-canvas').boundingBox())!
    const cdp = await context.newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + 22, y: from.y + 22, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: board.x + board.width * .65, y: board.y + board.height * .45, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    expect(Number(await token(page).getAttribute('data-board-x'))).toBeCloseTo(.65, 2)
    expect(await countMoves(page)).toBe(2)
    await page.getByRole('button', { name: 'Move unit', exact: true }).tap()
    await expect(page.locator('.tactical-placement')).toBeVisible()
    await page.locator('.battlefield-canvas').scrollIntoViewIfNeeded()
    const target = (await page.locator('.battlefield-canvas').boundingBox())!
    await page.touchscreen.tap(target.x + target.width * .13, target.y + target.height * .73)
    await expect.poll(async () => Number(await token(page).getAttribute('data-board-x'))).toBeCloseTo(.13, 2)
    expect(await countMoves(page)).toBe(3)
    await page.locator('.objective-node[data-objective-id="N1"]').tap()
    await expect(page.getByRole('region', { name: 'Objective controls for N1' })).toBeVisible()
    await page.getByRole('button', { name: 'Close objective controls', exact: true }).tap()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.setViewportSize({ width: 844, height: 390 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: 'test-results/tactical-phone-landscape.png', fullPage: true })
  } finally { await context.close() }
})

test('three clients synchronize owned units and retry offline movement once after a lost acknowledgement', async ({ browser }) => {
  const backend = new MockSupabase()
  const phones = await Promise.all([phone(browser, backend), phone(browser, backend), phone(browser, backend)])
  const [host, guest, third] = phones
  try {
    await seed(host.page, 'shared-tracking')
    const membership = await host.page.evaluate(async () => (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().hostCurrentBattle('p-a'))
    await host.page.goto(`/shared?room=${membership.roomCode}`)
    for (const [client, seat] of [[guest, 'p-b'], [third, 'p-c']] as const) {
      await client.page.goto(`/shared?room=${membership.roomCode}`)
      await client.page.locator(`input[name="shared-seat"][value="${seat}"]`).check()
      await client.page.getByRole('button', { name: 'Join lobby', exact: true }).click()
    }
    for (const client of phones) await client.page.getByRole('button', { name: 'I am ready', exact: true }).click()
    await host.page.getByRole('button', { name: 'Start battle', exact: true }).click()
    for (const client of phones) { await expect(client.page).toHaveURL(/\/battle\//); await dismissSecondaryReveal(client.page); await tactical(client.page) }
    await host.page.getByRole('button', { name: 'Enable Unit Tracking', exact: true }).click()
    await expect(guest.page.getByRole('button', { name: 'Disable Unit Tracking', exact: true })).toBeDisabled()
    await coordinatePlace(guest.page, 'p-b')
    await coordinatePlace(third.page, 'p-c', 'tank', '70', '60')
    for (const client of phones) { await expect(token(client.page, 'p-b')).toHaveCount(1); await expect(token(client.page, 'p-c', 'tank')).toHaveCount(1) }
    await token(guest.page, 'p-c', 'tank').click()
    await expect(guest.page.getByRole('region', { name: 'Selected unit details' })).toContainText('belongs to another commander')
    await token(guest.page, 'p-b').click()
    await guest.context.setOffline(true)
    await guest.page.getByRole('button', { name: 'Return to Reserves', exact: true }).click()
    await expect(token(guest.page, 'p-b')).toHaveCount(0)
    backend.failNextEventInsertAfterCommitForPlayerId = 'p-b'
    await guest.context.setOffline(false)
    await guest.page.reload(); await dismissSecondaryReveal(guest.page); await tactical(guest.page)
    for (const client of phones) await expect(token(client.page, 'p-b')).toHaveCount(0)
    await expect.poll(() => backend.storedEvents('UNIT_MAP_CHANGED', 'p-b').length).toBe(2)
    await expect.poll(() => backend.failNextEventInsertAfterCommitForPlayerId).toBeNull()
    await expect.poll(() => guest.page.evaluate(async () => (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().pendingEventCount)).toBe(0)
    expect(backend.storedEvents('UNIT_MAP_CHANGED', 'p-b')).toHaveLength(2)
  } finally { await Promise.all(phones.map(client => client.context.close())) }
})


test('deployment tray drag and dense unit grouping preserve objective access and exact coordinates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 })
  await seed(page, 'tracking-density')
  await tactical(page)
  await page.getByRole('button', { name: 'Enable Unit Tracking', exact: true }).click()
  await page.locator('.tactical-tray > summary').click()
  const row = tray(page)
  await row.click()
  const from = (await row.boundingBox())!, board = (await page.locator('.battlefield-canvas').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(board.x + board.width * .8, board.y + board.height * .2, { steps: 10 })
  await page.mouse.up()
  await expect(token(page)).toHaveCount(1)
  expect(await countMoves(page)).toBe(1)
  await page.evaluate(async () => {
    const { rehydrateBattleSession, dispatchBattleEvents } = await import('/src/domain/battle/engine.ts')
    const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
    const { useBattleStore } = await import('/src/stores/battleStore.ts')
    const base = testCauldronGame()
    base.setup.gameId = 'tracking-density'
    base.setup.players[0].name = 'Horde'
    base.setup.objectives.push({ id: 'CENTER', name: 'Center', type: 'neutral' })
    const army = base.setup.armies['army-a']
    army.units = Array.from({ length: 60 }, (_, index) => ({ ...structuredClone(army.units[0]), id: `horde-${index}`, name: 'Rubric Marines' }))
    let session = rehydrateBattleSession(base)
    session = dispatchBattleEvents(session, [{ type: 'UNIT_TRACKING_CHANGED', payload: { enabled: true } }])
    session = dispatchBattleEvents(session, army.units.map(unit => ({ type: 'UNIT_MAP_CHANGED' as const, payload: { playerId: 'p-a', unitId: unit.id, status: 'battlefield' as const, position: { x: .5, y: .5 }, expectedRevision: null } })))
    useBattleStore.setState({ session })
  })
  await expect(page.getByRole('button', { name: '60 overlapping units', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '60 overlapping units', exact: true }).click()
  const groupList = page.getByRole('region', { name: 'Overlapping units', exact: true })
  expect(await groupList.evaluate(node => node.clientHeight < node.scrollHeight)).toBe(true)
  await page.getByRole('region', { name: 'Overlapping units', exact: true }).getByRole('button', { name: 'Rubric Marines 60 · Horde', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Selected unit details' })).toContainText('Rubric Marines 60')
  await expect(token(page, 'p-a', 'horde-59')).toHaveAttribute('data-board-x', '0.5')
  await expect(page.locator('[data-unit-anchor]')).toHaveCount(2)
  const point = page.locator('.objective-node[data-objective-id="CENTER"]')
  await point.click()
  await expect(page.getByRole('region', { name: 'Objective controls for CENTER' })).toBeVisible()
  await page.getByRole('button', { name: 'Close objective controls', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await page.locator('.battlefield-frame').screenshot({ path: 'test-results/tactical-sixty-units.png' })
})

for (const count of [2, 4]) test(`${count === 4 ? 'Doubles' : 'Duel'}: PostgreSQL synchronizes owned positions and rejects allied or enemy movement`, async ({ browser }) => {
  test.setTimeout(120_000)
  const backend = new PostgresBackend()
  await backend.init()
  const clients = await Promise.all(Array.from({ length: count }, async () => {
    const context = await browser.newContext(PHONE)
    await backend.attach(context)
    return { context, page: await context.newPage() }
  }))
  const host = clients[0].page, peer = clients[1].page
  try {
    await host.goto('/')
    const id = await host.evaluate(async count => {
      const { createCauldronGame } = await import('/src/rulesets/cauldronFFA3/session.ts')
      const { testArmy } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const army = testArmy('tracking-army')
      const doubles = count === 4 ? { rulesVersion: 'GW-Doubles-1.0', forces: [
        { id: 'alpha', name: 'Team Alpha', memberPlayerIds: ['p0', 'p1'], captainPlayerId: 'p0', forceDisposition: 'take-and-hold', forceType: 'convenience', warlord: { playerId: 'p0', unitId: 'remainder' } },
        { id: 'bravo', name: 'Team Bravo', memberPlayerIds: ['p2', 'p3'], captainPlayerId: 'p2', forceDisposition: 'purge-the-foe', forceType: 'convenience', warlord: { playerId: 'p2', unitId: 'remainder' } },
      ] } : undefined
      const session = createCauldronGame({ doubles, gameId: `tracking-${count}`, mode: count === 4 ? 'doubles2v2' : 'duel', armies: [army], guidanceLevel: 'fast', primaryDeck: 'chapter-approved-duel', secondaryDeck: 'chapter-approved', officialLayout: 1,
        players: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Commander ${i}`, armyId: army.id, deploymentZone: count === 4 ? i < 2 ? 'A' : 'B' : i === 0 ? 'A' : 'B', turnPosition: count === 4 ? i < 2 ? 1 : 2 : i + 1, operationalPlanId: 'WYNISZCZENIE', forceDisposition: i < 1 ? 'take-and-hold' : 'purge-the-foe' })) })
      await saveBattle(session)
      return session.setup.gameId
    }, count)
    await host.goto(`/battle/${id}`)
    await expect(host.getByRole('button', { name: 'Keep cards', exact: true })).toBeVisible()
    await dismissSecondaryReveal(host)
    const membership = await host.evaluate(async () => (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().hostCurrentBattle('p0'))
    await host.goto(`/shared?room=${membership.roomCode}`)
    for (let i = 1; i < count; i++) {
      await clients[i].page.goto(`/shared?room=${membership.roomCode}`)
      await clients[i].page.locator(`input[name="shared-seat"][value="p${i}"]`).check()
      await clients[i].page.getByRole('button', { name: 'Join lobby', exact: true }).click()
    }
    for (const { page } of clients) await page.getByRole('button', { name: 'I am ready', exact: true }).click()
    await host.getByRole('button', { name: 'Start battle', exact: true }).click()
    for (const { page } of clients) {
      await expect(page).toHaveURL(/\/battle\//)
      await dismissSecondaryReveal(page)
      await tactical(page)
    }
    await host.getByRole('button', { name: 'Enable Unit Tracking', exact: true }).click()
    await expect(peer.getByRole('button', { name: 'Disable Unit Tracking', exact: true })).toBeDisabled()
    await Promise.all([coordinatePlace(host, 'p0', 'infantry', '20', '25'), coordinatePlace(peer, 'p1', 'infantry', '70', '75')])
    for (const { page } of clients) {
      // Official source diagrams are portrait; the landscape view applies a quarter turn.
      await expect(token(page, 'p0')).toHaveAttribute('data-board-x', '0.25')
      await expect(token(page, 'p0')).toHaveAttribute('data-board-y', '0.8')
      await expect(token(page, 'p1')).toHaveAttribute('data-board-x', '0.75')
      await expect(token(page, 'p1')).toHaveAttribute('data-board-y', /0\.3/)
      await expect(page.locator('[data-deployment-zone]')).toHaveCount(2)
    }
    await token(peer, 'p0').click()
    await expect(peer.getByRole('region', { name: 'Selected unit details' })).toContainText('belongs to another commander')
    if (count === 4) {
      await coordinatePlace(clients[2].page, 'p2', 'tank', '80', '20')
      await expect(token(peer, 'p2', 'tank')).toHaveCount(1)
      await token(peer, 'p2', 'tank').click()
      await expect(peer.getByRole('region', { name: 'Selected unit details' })).toContainText('belongs to another commander')
    }
    await peer.reload(); await dismissSecondaryReveal(peer); await tactical(peer)
    await expect(token(peer, 'p0')).toHaveAttribute('data-board-x', '0.25')
    await expect(token(peer, 'p1')).toHaveAttribute('data-board-x', '0.75')
    if (count === 4) {
      let blockPhasePosts = true
      await peer.route('https://mock.supabase.test/rest/v1/shared_events**', route =>
        blockPhasePosts && route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.fallback())
      await clients[1].context.setOffline(true)
      await peer.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().nextPhase())
      await expect.poll(() => peer.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.state.phase)).toBe('MOVEMENT')
      await expect.poll(() => peer.evaluate(async () => (await (await import('/src/persistence/database.ts')).getBattle('tracking-4'))?.state.events.at(-1)?.actorPlayerId)).toBe('p1')
      await clients[1].context.setOffline(false)
      await peer.reload(); await dismissSecondaryReveal(peer)
      await expect.poll(() => peer.evaluate(async () => (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().pendingEventCount)).toBeGreaterThan(0)
      await expect.poll(() => peer.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.state.phase)).toBe('MOVEMENT')
      blockPhasePosts = false
      await expect.poll(() => host.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.state.phase)).toBe('MOVEMENT')
      await expect.poll(() => peer.evaluate(async () => (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().pendingEventCount)).toBe(0)
      expect(await host.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!.state.events.filter(event => event.type === 'PHASE_CHANGED' && event.payload.phase === 'MOVEMENT' && event.actorPlayerId === 'p1').length)).toBe(1)
    }
  } finally {
    await Promise.allSettled(clients.map(client => client.context.close()))
    await backend.close()
  }
})
