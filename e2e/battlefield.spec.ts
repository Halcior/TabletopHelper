import { setupCommanders } from './helpers'
import { selectPanel, setupBattlefield, setupRules, chooseCauldronPreset } from './helpers'
import { expect, test, type Page } from '@playwright/test'
import { dismissSecondaryReveal, importTestArmy, phone } from './helpers'
import { MockSupabase } from './mockSupabase'

const marker = (page: Page, id: string) =>
  page.locator(`.objective-node[data-objective-id="${id}"]`)
async function openBoard(page: Page) {
  await selectPanel(page, 'objectives')
  await expect(
    page.getByRole('button', { name: 'Board', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
}
async function touchDrag(page: Page, id: string, x: number, y: number) {
  await page.locator('.battlefield-canvas').evaluate((element) =>
    window.scrollBy({
      top: element.getBoundingClientRect().top - 140,
      behavior: 'instant',
    }),
  )
  const node = (await marker(page, id).boundingBox())!
  const field = (await page.locator('.battlefield-canvas').boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: node.x + node.width / 2, y: node.y + node.height / 2, id: 1 },
    ],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: field.x + field.width * x, y: field.y + field.height * y, id: 1 },
    ],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await cdp.detach()
}

for (const layout of [1, 2, 3])
  test(`official Layout ${'ABC'[layout - 1]} starts automatically with source geometry and mobile control`, async ({
    browser,
  }) => {
    const { context, page } = await phone(browser)
    try {
      await importTestArmy(page)
      await setupRules(page)
      await setupCommanders(page)
      await expect(
        page.getByRole('combobox', { name: 'Force Disposition', exact: true }),
      ).toHaveCount(2)
      for (const select of await page
        .getByRole('combobox', { name: 'Force Disposition', exact: true })
        .all())
        await select.selectOption('take-and-hold')
      await setupBattlefield(page)
      await page.getByLabel('Pairing layout').selectOption(String(layout))
      await setupBattlefield(page)
      await page.getByLabel('Attacker HOME assignment').selectOption('B')
      await setupBattlefield(page)
      await page.getByLabel('Guidance level').selectOption('fast')
      await setupBattlefield(page)
      await page
        .getByRole('button', { name: 'Start locally', exact: true })
        .click()
      await expect(
        page.getByRole('button', { name: 'Keep cards', exact: true }),
      ).toBeVisible()
      await dismissSecondaryReveal(page)
      await openBoard(page)
      await expect(page.locator('.battlefield-heading')).toContainText(
        `Official Duel · Layout ${'ABC'[layout - 1]}`,
      )
      await expect(page.locator('.battlefield-source a')).toHaveAttribute(
        'href',
        new RegExp(`#page=${8 + layout}$`),
      )
      await expect(page.locator('.battlefield-canvas')).toHaveAttribute(
        'data-width-cm',
        '111.76',
      )
      await expect(page.locator('.battlefield-canvas')).toHaveAttribute(
        'data-height-cm',
        '152.4',
      )
      await expect(page.locator('.objective-node')).toHaveCount(5)
      await expect(page.locator('[data-terrain-id]')).toHaveCount(16)
      await expect(page.locator('.objective-footprint')).toHaveCount(0)
      await page.getByLabel('Footprints', { exact: true }).uncheck()
      await expect(page.locator('[data-terrain-id]')).toHaveCount(0)
      await expect(page.locator('.objective-node')).toHaveCount(5)
      await page.getByLabel('Footprints', { exact: true }).check()
      await page.getByRole('checkbox', { name: 'Objectives', exact: true }).uncheck()
      await expect(page.locator('.objective-node')).toHaveCount(0)
      await page.getByRole('checkbox', { name: 'Objectives', exact: true }).check()
      await expect(page.locator('.battlefield-unplaced button')).toHaveCount(0)
      await expect(page.locator('[data-deployment-zone]')).toHaveCount(2)
      await expect(page.locator('.battlefield-territory')).not.toHaveCount(0)
      const savedX = Number(
        await marker(page, 'B-HOME').getAttribute('data-board-x'),
      )
      const savedY = Number(await marker(page, 'B-HOME').getAttribute('data-board-y'))
      const canvas = (await page.locator('.battlefield-canvas').boundingBox())!
      expect(canvas.width / canvas.height).toBeCloseTo(60 / 44, 2)
      const displayPoint = () => marker(page, 'B-HOME').evaluate(node => ({
        x: parseFloat((node as HTMLElement).style.left),
        y: parseFloat((node as HTMLElement).style.top),
      }))
      expect((await displayPoint()).x).toBeCloseTo((1 - savedY) * 100)
      expect((await displayPoint()).y).toBeCloseTo(savedX * 100)
      if (layout === 1) expect(savedX).toBeCloseTo(0.374741, 6)
      await page.getByRole('button', { name: 'Rotate 180°' }).click()
      expect(
        await marker(page, 'B-HOME').evaluate((node) =>
          parseFloat((node as HTMLElement).style.left),
        ),
      ).toBeCloseTo(savedY * 100)
      expect((await displayPoint()).y).toBeCloseTo((1 - savedX) * 100)
      await expect(marker(page, 'B-HOME')).toHaveAttribute(
        'data-board-x',
        String(savedX),
      )
      await expect(marker(page, 'B-HOME')).toHaveAttribute('data-board-y', String(savedY))
      const beforeColor = await marker(page, 'CENTER-1').evaluate(
        (node) => getComputedStyle(node).borderColor,
      )
      await marker(page, 'CENTER-1').tap()
      const sheet = page.getByRole('region', {
        name: 'Objective controls for CENTER-1',
      })
      await sheet
        .getByRole('button', { name: 'Player II', exact: true })
        .click()
      await expect(marker(page, 'CENTER-1')).toHaveAttribute(
        'data-controller-id',
        'player-b',
      )
      await expect
        .poll(() =>
          marker(page, 'CENTER-1').evaluate(
            (node) => getComputedStyle(node).borderColor,
          ),
        )
        .not.toBe(beforeColor)
      await page.getByRole('button', { name: 'List', exact: true }).click()
      const listObjective = page.locator('.objective-card').filter({
        has: page.getByRole('heading', { name: 'CENTER-1', exact: true }),
      })
      await expect(
        listObjective.getByRole('button', { name: 'Player II', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await listObjective
        .getByRole('button', { name: 'None', exact: true })
        .click()
      await page.getByRole('button', { name: 'Board', exact: true }).click()
      await expect(marker(page, 'CENTER-1')).toHaveAttribute(
        'data-controller-id',
        'none',
      )
      await marker(page, 'CENTER-1').tap()
      await page
        .getByRole('button', { name: 'Open OC Mode', exact: true })
        .click()
      await expect(listObjective.locator('.oc-mode')).toHaveAttribute(
        'open',
        '',
      )
      await page.getByRole('button', { name: 'Board', exact: true }).click()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false)
      if (process.env.CAPTURE_UI === '1') {
        await page
          .locator('.battlefield-frame')
          .evaluate((element) =>
            window.scrollBy(0, element.getBoundingClientRect().top - 110),
          )
        await page.screenshot({
          path: `test-results/board-official-${'ABC'[layout - 1]}-mobile.png`,
        })
      }
    } finally {
      await context.close()
    }
  })

test('FFA touch editor persists seven IDs, supports reset and undo, and replays exact read-only states', async ({
  browser,
}) => {
  const { context, page } = await phone(browser)
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await importTestArmy(page)
    await page.getByRole('button', { name: /FFA 3/ }).click()
    await chooseCauldronPreset(page)
    await setupRules(page)
    await page
      .getByRole('combobox', { name: 'Secondary deck', exact: true })
      .selectOption('chapter-approved')
    await setupRules(page)
    await page
      .getByRole('combobox', { name: 'Secondary strategy', exact: true })
      .selectOption('fixed')
    await setupBattlefield(page)
    await page.getByLabel('Guidance level').selectOption('fast')
    await setupBattlefield(page)
    await page
      .getByRole('button', { name: 'Start locally', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Keep cards', exact: true }),
    ).toBeVisible()
    await dismissSecondaryReveal(page)
    await openBoard(page)
    await expect(page.locator('.objective-node')).toHaveCount(7)
    await page.getByRole('button', { name: 'Edit Layout', exact: true }).click()
    await page.getByLabel('Field width (cm)', { exact: true }).fill('0')
    await page.getByRole('button', { name: 'Save Layout', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('between 60 and 400')
    expect(
      await page
        .locator('.battlefield-canvas')
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThan(900)
    await page
      .getByRole('button', { name: '160 × 120 cm', exact: true })
      .click()
    await touchDrag(page, 'CENTER', 0.6, 0.52)
    expect(
      Number(await marker(page, 'CENTER').getAttribute('data-board-x')),
    ).toBeCloseTo(0.6, 2)
    await page
      .getByRole('button', { name: 'Reset default layout', exact: true })
      .click()
    await expect(marker(page, 'CENTER')).toHaveAttribute('data-board-x', '0.5')
    await page
      .getByRole('button', { name: '160 × 120 cm', exact: true })
      .click()
    await touchDrag(page, 'CENTER', 0.6, 0.52)
    const movedX = await marker(page, 'CENTER').getAttribute('data-board-x')
    await page.getByLabel('Lock positions', { exact: true }).check()
    await touchDrag(page, 'CENTER', 0.4, 0.5)
    await expect(marker(page, 'CENTER')).toHaveAttribute(
      'data-board-x',
      movedX!,
    )
    if (process.env.CAPTURE_UI === '1') {
      await page
        .locator('.battlefield-editor')
        .evaluate((element) =>
          window.scrollBy({
            top: element.getBoundingClientRect().top - 88,
            behavior: 'instant',
          }),
        )
      await page
        .locator('.battlefield-editor')
        .screenshot({ path: 'test-results/board-ffa-editor-mobile.png' })
    }
    await page.getByRole('button', { name: 'Save Layout', exact: true }).click()
    await expect(page.locator('.battlefield-editor')).toHaveCount(0)
    await page.reload()
    await openBoard(page)
    await expect(page.locator('.battlefield-canvas')).toHaveAttribute(
      'data-width-cm',
      '160',
    )
    await expect(marker(page, 'CENTER')).toHaveAttribute(
      'data-board-x',
      movedX!,
    )
    await page
      .getByRole('button', { name: 'Open battle menu', exact: true })
      .click()
    await page
      .getByRole('menuitem', { name: 'Undo last action', exact: true })
      .click()
    await expect(page.locator('.battlefield-canvas')).toHaveAttribute(
      'data-width-cm',
      '180',
    )
    await page
      .getByRole('button', { name: 'Open battle menu', exact: true })
      .click()
    await page
      .getByRole('menuitem', { name: 'Redo action', exact: true })
      .click()
    await expect(marker(page, 'CENTER')).toHaveAttribute(
      'data-board-x',
      movedX!,
    )
    await marker(page, 'CENTER').tap()
    await page
      .getByRole('region', { name: 'Objective controls for CENTER' })
      .getByRole('button', { name: 'Player I', exact: true })
      .click()
    await page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      useBattleStore.getState().dispatch({
        type: 'SCORE_ADJUSTED',
        payload: { playerId: 'player-a', category: 'primary', delta: 5 },
      })
    })
    await marker(page, 'CENTER').tap()
    await page
      .getByRole('region', { name: 'Objective controls for CENTER' })
      .getByRole('button', { name: 'Player III', exact: true })
      .click()
    expect(
      await marker(page, 'CENTER')
        .locator('.objective-node__symbol')
        .evaluate((node) => getComputedStyle(node).animationName),
    ).toBe('none')
    const live = await page.evaluate(async () =>
      JSON.stringify(
        (await import('/src/stores/battleStore.ts')).useBattleStore.getState()
          .session,
      ),
    )
    await page.getByRole('button', { name: 'Replay', exact: true }).click()
    await expect(page.locator('.battlefield-replay__scores')).toContainText(
      '5 VP',
    )
    const slider = page.getByLabel('Replay event', { exact: true })
    const end = Number(await slider.getAttribute('max'))
    await slider.fill(String(end - 1))
    await expect(marker(page, 'CENTER')).toHaveAttribute(
      'data-controller-id',
      'player-a',
    )
    await slider.fill(String(end - 2))
    await expect(page.locator('.battlefield-replay__scores')).not.toContainText(
      '5 VP',
    )
    await slider.fill('0')
    await expect(marker(page, 'CENTER')).toHaveAttribute(
      'data-controller-id',
      'none',
    )
    await expect(page.locator('.battlefield-canvas')).toHaveAttribute(
      'data-width-cm',
      '180',
    )
    await expect(
      page.getByRole('button', { name: 'Edit Layout', exact: true }),
    ).toBeDisabled()
    await marker(page, 'CENTER').tap()
    await expect(
      page
        .getByRole('region', { name: 'Objective controls for CENTER' })
        .getByRole('button', { name: 'Player I', exact: true }),
    ).toBeDisabled()
    await page
      .getByRole('button', { name: 'Close objective controls', exact: true })
      .click()
    await slider.fill(String(end))
    if (process.env.CAPTURE_UI === '1')
      await page
        .locator('.battlefield-replay')
        .screenshot({ path: 'test-results/board-replay-mobile.png' })
    await page
      .getByRole('button', { name: 'Return to live', exact: true })
      .click()
    expect(
      await page.evaluate(async () =>
        JSON.stringify(
          (await import('/src/stores/battleStore.ts')).useBattleStore.getState()
            .session,
        ),
      ),
    ).toBe(live)
    await expect(marker(page, 'CENTER')).toHaveAttribute(
      'data-controller-id',
      'player-c',
    )
    if (process.env.CAPTURE_UI === '1') {
      await page
        .locator('.battlefield-frame')
        .evaluate((element) =>
          window.scrollBy(0, element.getBoundingClientRect().top - 110),
        )
      await page.screenshot({ path: 'test-results/board-ffa-mobile.png' })
    }
  } finally {
    await context.close()
  }
})

test('three phones share host geometry and control, rejecting non-host edits and recovering one offline layout', async ({
  browser,
}) => {
  const backend = new MockSupabase()
  const phones = await Promise.all([
    phone(browser, backend),
    phone(browser, backend),
    phone(browser, backend),
  ])
  const [alpha, bravo, charlie] = phones
  try {
    await importTestArmy(alpha.page)
    await alpha.page.getByRole('button', { name: /FFA 3/ }).click()
    await chooseCauldronPreset(alpha.page)
    await setupBattlefield(alpha.page)
    await alpha.page.getByLabel('Guidance level').selectOption('fast')
    await setupRules(alpha.page)
    await alpha.page
      .getByRole('combobox', { name: 'Secondary deck', exact: true })
      .selectOption('chapter-approved')
    await setupRules(alpha.page)
    await alpha.page
      .getByRole('combobox', { name: 'Secondary strategy', exact: true })
      .selectOption('fixed')
    await setupBattlefield(alpha.page)
    await alpha.page
      .getByRole('button', { name: 'Create 3-player lobby', exact: true })
      .click()
    const code = (await alpha.page
      .locator('.shared-room-focus__code strong')
      .textContent())!.trim()
    for (const [phone, seat] of [
      [bravo, 'player-b'],
      [charlie, 'player-c'],
    ] as const) {
      await phone.page.goto(`/shared?room=${code}`)
      await phone.page
        .locator(`input[name="shared-seat"][value="${seat}"]`)
        .check()
      await phone.page
        .getByRole('button', { name: 'Join lobby', exact: true })
        .click()
    }
    for (const { page } of phones)
      await page
        .getByRole('button', { name: 'I am ready', exact: true })
        .click()
    await alpha.page
      .getByRole('button', { name: 'Start battle', exact: true })
      .click()
    await expect(
      alpha.page.getByRole('button', { name: 'Keep cards', exact: true }),
    ).toBeVisible()
    for (const { page } of phones) {
      await expect(page).toHaveURL(/\/battle\//)
      await dismissSecondaryReveal(page)
      await openBoard(page)
    }
    await expect(
      bravo.page.getByRole('button', { name: 'Edit Layout', exact: true }),
    ).toBeDisabled()
    await expect(
      charlie.page.getByRole('button', { name: 'Edit Layout', exact: true }),
    ).toBeDisabled()
    const rejected = await bravo.page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      const { useSharedSessionStore } =
        await import('/src/multiplayer/sharedSessionStore.ts')
      const session = useBattleStore.getState().session!
      const membership = useSharedSessionStore.getState().membership!
      const response = await fetch(
        'https://mock.supabase.test/rest/v1/shared_events',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-client-id': membership.clientId,
            'x-room-code': membership.roomCode,
          },
          body: JSON.stringify([
            {
              room_id: membership.roomId,
              event_id: 'forbidden-edit',
              actor_player_id: membership.playerId,
              event_payload: {
                type: 'BATTLEFIELD_LAYOUT_CHANGED',
                actorPlayerId: membership.playerId,
                payload: {
                  geometry: { ...session.state.battlefield, widthCm: 100 },
                },
              },
            },
          ]),
        },
      )
      return response.status
    })
    expect(rejected).toBe(403)
    await alpha.page
      .getByRole('button', { name: 'Edit Layout', exact: true })
      .click()
    await alpha.page
      .getByRole('button', { name: '160 × 120 cm', exact: true })
      .click()
    await touchDrag(alpha.page, 'CENTER', 0.6, 0.52)
    const x = await marker(alpha.page, 'CENTER').getAttribute('data-board-x')
    await alpha.page
      .getByRole('button', { name: 'Save Layout', exact: true })
      .click()
    for (const { page } of phones) {
      await expect(page.locator('.battlefield-canvas')).toHaveAttribute(
        'data-width-cm',
        '160',
      )
      await expect(marker(page, 'CENTER')).toHaveAttribute('data-board-x', x!)
    }
    await marker(charlie.page, 'CENTER').tap()
    await charlie.page
      .getByRole('region', { name: 'Objective controls for CENTER' })
      .getByRole('button', { name: 'Player III', exact: true })
      .click()
    for (const { page } of phones)
      await expect(marker(page, 'CENTER')).toHaveAttribute(
        'data-controller-id',
        'player-c',
      )
    await alpha.context.setOffline(true)
    await alpha.page
      .getByRole('button', { name: 'Edit Layout', exact: true })
      .click()
    await alpha.page
      .getByRole('button', { name: '180 × 120 cm', exact: true })
      .click()
    await alpha.page
      .getByRole('button', { name: 'Save Layout', exact: true })
      .click()
    // IndexedDB and the outbox retain the geometry even when the acknowledgement is lost.
    backend.failNextEventInsertAfterCommitForPlayerId = 'player-a'
    await alpha.context.setOffline(false)
    await alpha.page.reload()
    await expect(alpha.page.getByRole('navigation', { name: 'Battle panels' })).toBeVisible()
    await openBoard(alpha.page)
    for (const { page } of phones)
      await expect(page.locator('.battlefield-canvas')).toHaveAttribute(
        'data-width-cm',
        '180',
      )
    await expect
      .poll(() => backend.storedEvents('BATTLEFIELD_LAYOUT_CHANGED').length)
      .toBe(2)
    const last = backend.storedEvents('BATTLEFIELD_LAYOUT_CHANGED').at(-1)!
    await expect
      .poll(() => backend.attemptsFor(last.event_id))
      .toBeGreaterThanOrEqual(2)
    expect(backend.storedEvents('BATTLEFIELD_LAYOUT_CHANGED')).toHaveLength(2)
    await bravo.page.reload()
    await expect(bravo.page.getByRole('navigation', { name: 'Battle panels' })).toBeVisible()
    await openBoard(bravo.page)
    await expect(marker(bravo.page, 'CENTER')).toHaveAttribute(
      'data-board-x',
      x!,
    )
    await expect(marker(bravo.page, 'CENTER')).toHaveAttribute(
      'data-controller-id',
      'player-c',
    )
  } finally {
    await Promise.all(phones.map(({ context }) => context.close()))
  }
})

test('Battlefield 2.0 edits terrain footprints without changing objective control or replay history', async ({ browser }) => {
  const { context, page } = await phone(browser)
  try {
    await page.goto('/')
    await page.evaluate(async () => {
      const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
      const { saveBattle } = await import('/src/persistence/database.ts')
      const { dispatchBattleEvent } = await import('/src/domain/battle/engine.ts')
      const session = testCauldronGame()
      session.setup.gameId = 'battlefield-footprints'
      await saveBattle(dispatchBattleEvent(session, { type: 'PHASE_CHANGED', payload: { phase: 'SHOOTING' } }))
    })
    await page.goto('/battle/battlefield-footprints')
    await dismissSecondaryReveal(page)
    await openBoard(page)
    await expect(page.locator('.objective-footprint')).toHaveCount(6)
    await expect(marker(page, 'N1')).toBeVisible()
    const beforeState = await page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      return structuredClone(useBattleStore.getState().session!.state.objectives)
    })
    await page.getByRole('button', { name: 'Edit Layout', exact: true }).click()
    await page.getByLabel('Footprint objective').selectOption('N1')
    await page.getByLabel('Footprint shape').selectOption('rectangle')
    await page.getByLabel('Footprint width (cm)').fill('24')
    await page.getByLabel('Footprint height (cm)').fill('16')
    await page.getByLabel('Footprint rotation').fill('45')
    await expect(page.locator('.objective-footprint[data-footprint-id="N1"]')).toHaveAttribute('data-footprint-width-cm', '24')
    await page.getByRole('button', { name: 'Save Layout', exact: true }).click()
    await page.reload()
    await openBoard(page)
    await expect(page.locator('.objective-footprint[data-footprint-id="N1"]')).toHaveAttribute('data-footprint-kind', 'rectangle')
    await expect(page.locator('.objective-footprint[data-footprint-id="N1"]')).toHaveAttribute('data-footprint-height-cm', '16')
    const afterState = await page.evaluate(async () => {
      const { useBattleStore } = await import('/src/stores/battleStore.ts')
      return structuredClone(useBattleStore.getState().session!.state.objectives)
    })
    expect(afterState).toEqual(beforeState)
    await page.getByRole('button', { name: 'Hide footprints', exact: true }).click()
    await expect(page.locator('.objective-footprint')).toHaveCount(0)
    await expect(marker(page, 'N1')).toBeVisible()
    await page.getByRole('button', { name: 'Show footprints', exact: true }).click()
    await page.getByRole('button', { name: 'Replay', exact: true }).click()
    const slider = page.getByLabel('Replay event', { exact: true })
    await slider.fill('0')
    await expect(page.locator('.objective-footprint[data-footprint-id="N1"]')).toHaveAttribute('data-footprint-kind', 'chamfered')
    await slider.fill(await slider.getAttribute('max') ?? '0')
    await expect(page.locator('.objective-footprint[data-footprint-id="N1"]')).toHaveAttribute('data-footprint-kind', 'rectangle')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  } finally { await context.close() }
})
