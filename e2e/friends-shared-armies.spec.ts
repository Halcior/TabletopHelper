import { expect, test, type Page } from '@playwright/test'
import { phone } from './helpers'
import { PostgresBackend } from './postgresBackend'
test.use({ actionTimeout: 15_000 })

async function login(page: Page, email: string) {
  await page.goto('/account')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await page.getByText('Enter email code', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Email code' }).fill('123456')
  await page.getByRole('button', { name: 'Verify code' }).click()
  await expect(
    page.getByRole('heading', { name: email, exact: true }),
  ).toBeVisible()
  await expect(page.locator('.friend-code')).toBeVisible()
}
async function seedArmy(page: Page, name: string) {
  await page.evaluate(async (name) => {
    const { saveArmy } = await import('/src/features/armyLibrary/repository.ts')
    const { syncArmies } = await import('/src/features/armyLibrary/sync.ts')
    await saveArmy({
      id: crypto.randomUUID(),
      name,
      faction: name.includes('Necron') ? 'Necrons' : 'Adeptus Custodes',
      totalPoints: 100,
      detachments: [{ id: 'test', name: 'Test Detachment' }],
      units: [
        {
          id: 'same-unit',
          name: 'Captain',
          points: 100,
          startingModels: 1,
          modelGroups: [
            { name: 'Captain', startingCount: 1, equipment: ['Spear'] },
          ],
          categories: ['CHARACTER'],
          keywords: ['CHARACTER'],
          rangedWeapons: [],
          meleeWeapons: [],
          abilities: [],
          enhancements: [],
          wargear: [],
          isWarlord: true,
          leaderOfUnitId: null,
          ledByUnitIds: [],
        },
      ],
    })
    await syncArmies()
  }, name)
}
async function chooseArmy(page: Page) {
  const picker = page.getByRole('region', { name: 'Your lobby army' })
  await picker.getByLabel('Saved army').selectOption({ index: 1 })
  await picker.getByRole('button', { name: 'Select army', exact: true }).click()
  await expect(
    picker.getByRole('button', { name: 'Change Army', exact: true }),
  ).toBeEnabled()
}
async function newLobby(page: Page, mode = 'duel') {
  await page.goto(`/battle/setup?play=shared&mode=${mode}`)
  await expect(page.getByRole('button', { name: /Online multiplayer/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Next: Commanders' }).click()
  await expect(page.getByRole('region', { name: 'Commanders' }).getByLabel('Saved army')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next: Battlefield' }).click()
  await page.getByRole('button', { name: /Create .* lobby/ }).click()
  await expect(page.getByText('Waiting room', { exact: true })).toBeVisible()
  const hostSnapshot = await page.evaluate(async () =>
    (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().inspection?.room.sessionSnapshot)
  expect(hostSnapshot?.setup.armies).toEqual({})
  expect(hostSnapshot?.setup.players.every(player => !player.armyId)).toBe(true)
}

test('two accounts: profile, friendship, read-only shared list, invite and independent battle snapshots', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const backend = new PostgresBackend()
  await backend.init()
  const a = await phone(browser),
    b = await phone(browser)
  try {
    await backend.attach(a.context)
    await backend.attach(b.context)
    await login(a.page, 'a@example.test')
    await login(b.page, 'b@example.test')
    await a.page.getByRole('button', { name: 'Change name / initials' }).click()
    await a.page
      .getByLabel('Display name', { exact: true })
      .fill('Golden Commander')
    await a.page.getByRole('button', { name: 'Save profile' }).click()
    await expect(
      a.page.getByRole('heading', { name: 'Golden Commander', exact: true }),
    ).toBeVisible()
    const code = await a.page.locator('.friend-code').innerText()
    await seedArmy(a.page, 'Custodes roster')
    await seedArmy(b.page, 'Necron roster')
    await a.page.goto('/armies')
    await a.page.getByRole('button', { name: 'Share with Friends' }).click()
    await expect(
      a.page.getByRole('button', { name: 'Make Private' }),
    ).toBeEnabled()
    await b.page.goto('/friends')
    await b.page.getByLabel('Friend code', { exact: true }).fill(code)
    await b.page.getByRole('button', { name: 'Find commander' }).click()
    await b.page
      .getByRole('button', { name: 'Add Friend', exact: true })
      .click()
    await a.page.goto('/friends')
    await a.page.getByRole('button', { name: 'Accept', exact: true }).click()
    await b.page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await b.page.getByRole('link', { name: 'View Armies' }).click()
    await expect(
      b.page.getByRole('heading', { name: 'Custodes roster', exact: true }),
    ).toBeVisible()
    await b.page.getByText('View units', { exact: true }).click()
    await expect(
      b.page.getByText('1 × Captain · Spear', { exact: true }),
    ).toBeVisible()
    await expect(
      b.page.getByRole('button', { name: /Delete army|Save roster|Edit/ }),
    ).toHaveCount(0)
    await b.page.screenshot({
      path: 'test-results/friends-shared-mobile.png',
      fullPage: true,
    })
    expect(
      await b.page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    // Revoking sharing also clears an already-open friend's viewer on refresh.
    await a.page.goto('/armies')
    await a.page
      .getByRole('button', { name: 'Make Private', exact: true })
      .click()
    await expect(
      a.page.getByRole('button', { name: 'Share with Friends' }),
    ).toBeEnabled()
    await b.page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(
      b.page.getByRole('heading', { name: 'Custodes roster', exact: true }),
    ).toHaveCount(0)
    await a.page.getByRole('button', { name: 'Share with Friends' }).click()
    await expect(
      a.page.getByRole('button', { name: 'Make Private' }),
    ).toBeEnabled()
    await a.page.setViewportSize({ width: 1440, height: 960 })
    await a.page.goto('/friends')
    await expect(
      a.page.getByRole('link', { name: 'View Armies' }),
    ).toBeVisible()
    await a.page.screenshot({
      path: 'test-results/friends-desktop.png',
      fullPage: true,
    })
    await newLobby(a.page)
    await a.page
      .getByRole('combobox', { name: 'Friend', exact: true })
      .selectOption({ label: 'Commander' })
    await a.page
      .getByRole('button', { name: 'Invite to Game', exact: true })
      .click()
    await b.page.goto('/friends')
    await b.page.getByRole('link', { name: 'Join', exact: true }).click()
    await b.page
      .getByRole('button', { name: 'Join lobby', exact: true })
      .click()
    await expect(
      b.page.getByText('Waiting room', { exact: true }),
    ).toBeVisible()
    await expect(
      a.page.getByRole('button', { name: 'I am ready', exact: true }),
    ).toBeDisabled()
    await chooseArmy(a.page)
    await chooseArmy(b.page)
    await a.page
      .getByRole('button', { name: 'I am ready', exact: true })
      .click()
    await b.page
      .getByRole('button', { name: 'I am ready', exact: true })
      .click()
    const provisionalGuest = await b.page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session!)
    await expect(
      a.page.getByRole('button', { name: 'Start battle', exact: true }),
    ).toBeEnabled()
    await a.page
      .getByRole('button', { name: 'Start battle', exact: true })
      .click()
    await expect(a.page).toHaveURL(/\/battle\//)
    await expect(b.page).toHaveURL(/\/battle\//)
    const snapshot = await a.page.evaluate(
      async () =>
        (await import('/src/stores/battleStore.ts')).useBattleStore.getState()
          .session!.setup,
    )
    expect(
      Object.values(snapshot.armies)
        .map((x: any) => x.name)
        .sort(),
    ).toEqual(['Custodes roster', 'Necron roster'])
    const other = await b.page.evaluate(
      async () =>
        (await import('/src/stores/battleStore.ts')).useBattleStore.getState()
          .session!.setup,
    )
    expect(other).toEqual(snapshot)
    // Simulate a browser that closed in the lobby and whose disk still has the
    // provisional setup. No battle events exist yet to accidentally repair it.
    await b.page.evaluate(async stale => (await import('/src/persistence/database.ts')).saveBattle(stale), provisionalGuest)
    await b.page.reload()
    await expect.poll(async () => b.page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session?.setup)).toEqual(snapshot)

    const cpBefore = await a.page.evaluate(
      async () =>
        (await import('/src/stores/battleStore.ts')).useBattleStore.getState()
          .session!.state.players['player-b'].cp,
    )
    await b.context.setOffline(true)
    await b.page.evaluate(async () =>
      (await import('/src/stores/battleStore.ts')).useBattleStore
        .getState()
        .dispatch({
          type: 'CP_GAINED',
          payload: { playerId: 'player-b', amount: 1 },
        }),
    )
    await b.context.setOffline(false)
    await b.page.evaluate(async () =>
      (
        await import('/src/multiplayer/sharedSessionStore.ts')
      ).useSharedSessionStore
        .getState()
        .forceSync(),
    )
    await expect
      .poll(async () =>
        a.page.evaluate(
          async () =>
            (
              await import('/src/stores/battleStore.ts')
            ).useBattleStore.getState().session!.state.players['player-b'].cp,
        ),
      )
      .toBe(cpBefore + 1)
    await a.page.evaluate(async () => {
      const repo = await import('/src/features/armyLibrary/repository.ts')
      const [row] = await repo.listArmies()
      await repo.saveRoster({ ...row.army, name: 'Edited after battle start' })
      await (await import('/src/features/armyLibrary/sync.ts')).syncArmies()
      await repo.deleteRoster(row.id)
      await (await import('/src/features/armyLibrary/sync.ts')).syncArmies()
    })
    await b.page.reload()
    await expect
      .poll(async () =>
        b.page.evaluate(async () =>
          Object.values(
            (
              await import('/src/stores/battleStore.ts')
            ).useBattleStore.getState().session?.setup.armies ?? {},
          )
            .map((x: any) => x.name)
            .sort(),
        ),
      )
      .toEqual(['Custodes roster', 'Necron roster'])
    // Both local library deletion and cloud tombstone leave the creation snapshot intact.
    expect(
      await a.page.evaluate(async () =>
        Object.values(
          (await import('/src/stores/battleStore.ts')).useBattleStore.getState()
            .session!.setup.armies,
        ).map((x: any) => x.name),
      ),
    ).toContain('Custodes roster')
    await b.page.goto('/account')
    await b.page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await b.page.goto('/friends/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    await expect(
      b.page.getByRole('heading', { name: 'Custodes roster', exact: true }),
    ).toHaveCount(0)
  } finally {
    await a.context.close()
    await b.context.close()
    await backend.close()
  }
})

for (const mode of ['ffa3', 'doubles2v2'])
  test(`Bring Your Army ${mode}: all seats, change selection, premature start, reconnect`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const backend = new PostgresBackend()
    await backend.init()
    const clients = await Promise.all(
      Array.from({ length: mode === 'ffa3' ? 3 : 4 }, () => phone(browser)),
    )
    try {
      for (const c of clients) {
        await backend.attach(c.context)
        await c.page.goto('/')
        await seedArmy(c.page, `Roster ${clients.indexOf(c) + 1}`)
      }
      await newLobby(clients[0].page, mode)
      const code = new URL(clients[0].page.url()).searchParams.get('room')!
      for (const c of clients.slice(1)) {
        await c.page.goto(`/shared?room=${code}`)
        await c.page
          .getByRole('button', { name: 'Join lobby', exact: true })
          .click()
      }
      for (const c of clients) await chooseArmy(c.page)
      for (const c of clients)
        await c.page
          .getByRole('button', { name: 'I am ready', exact: true })
          .click()
      // A new variant must revoke this seat's previous readiness.
      await seedArmy(clients[1].page, 'Changed roster')
      const picker = clients[1].page.getByRole('region', {
        name: 'Your lobby army',
      })
      await picker
        .getByLabel('Saved army')
        .selectOption({ label: 'Changed roster · 100 pts' })
      await picker
        .getByRole('button', { name: 'Change Army', exact: true })
        .click()
      await expect(
        clients[1].page.getByRole('button', {
          name: 'I am ready',
          exact: true,
        }),
      ).toBeEnabled()
      await clients[0].page
        .getByRole('button', { name: 'Sync now', exact: true })
        .click()
      await expect(
        clients[0].page.getByRole('button', {
          name: 'Start battle',
          exact: true,
        }),
      ).toHaveCount(0)
      await clients[1].page
        .getByRole('button', { name: 'I am ready', exact: true })
        .click()
      await expect(
        clients[0].page.getByRole('button', {
          name: 'Start battle',
          exact: true,
        }),
      ).toBeEnabled()
      await clients[0].page.setViewportSize({ width: 375, height: 812 })
      expect(
        await clients[0].page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
      await clients[0].page.screenshot({
        path: `test-results/bya-${mode}-mobile.png`,
        fullPage: true,
      })
      await clients[0].page
        .getByRole('button', { name: 'Start battle', exact: true })
        .click()
      for (const c of clients) await expect(c.page).toHaveURL(/\/battle\//)
      const setups = await Promise.all(
        clients.map((c) =>
          c.page.evaluate(
            async () =>
              (
                await import('/src/stores/battleStore.ts')
              ).useBattleStore.getState().session!.setup,
          ),
        ),
      )
      for (const setup of setups) expect(setup).toEqual(setups[0])
      expect(Object.keys(setups[0].armies)).toHaveLength(clients.length)
      expect(
        Object.values(setups[0].armies).some(
          (x: any) => x.name === 'Changed roster',
        ),
      ).toBe(true)
      if (mode === 'doubles2v2')
        for (const force of setups[0].doubles!.forces)
          expect(
            setups[0].armies[`seat:${force.warlord.playerId}`].units.some(
              (u: any) => u.id === force.warlord.unitId,
            ),
          ).toBe(true)
      await clients[1].page.reload()
      await expect
        .poll(async () =>
          clients[1].page.evaluate(
            async () =>
              Object.keys(
                (
                  await import('/src/stores/battleStore.ts')
                ).useBattleStore.getState().session?.setup.armies ?? {},
              ).length,
          ),
        )
        .toBe(clients.length)
    } finally {
      for (const c of clients) await c.context.close()
      await backend.close()
    }
  })
