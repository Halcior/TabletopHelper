import { PostgresBackend } from './postgresBackend'
import { test, expect } from '@playwright/test'

test('private archive survives refresh, requires identity links and keeps FFA results separate', async ({ page }) => {
 await page.setViewportSize({ width: 390, height: 844 })
 await page.goto('/')
 await page.evaluate(async () => {
  const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
  const { completeBattle, dispatchBattleEvent } = await import('/src/domain/battle/engine.ts')
  const { saveBattle } = await import('/src/persistence/database.ts')
  let s = dispatchBattleEvent(testCauldronGame(), { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'adjustment', delta: 70 } })
  await saveBattle(completeBattle(s)); await saveBattle(completeBattle(s))
 })
 await page.goto('/archive')
 await expect(page.getByRole('link', { name: 'Open battle', exact: true })).toHaveCount(1)
 await page.getByRole('link', { name: 'Open battle', exact: true }).click()
 await page.getByLabel('Identity · Alpha', { exact: true }).selectOption('local:self')
 await expect(page.getByLabel('Identity · Alpha', { exact: true })).toHaveValue('local:self')
 await page.reload()
 await expect(page.getByLabel('Identity · Alpha', { exact: true })).toHaveValue('local:self')
 await page.getByRole('button', { name: 'Tactical Replay', exact: true }).click()
 await expect(page.getByText('No unit positions were recorded at this point in the battle.')).toBeVisible()
 await page.getByRole('link', { name: /All battles/ }).click()
 await page.getByRole('button', { name: 'Player Statistics', exact: true }).click()
 await expect(page.locator('.legacy-kpis article').first()).toHaveText('Battles0')
 await page.getByLabel('Format', { exact: true }).selectOption('FFA')
 await expect(page.locator('.legacy-kpis article').first()).toHaveText('Battles1')
 await expect(page.getByText(/FFA results describe/)).toBeVisible()
 await expect(page.locator('.legacy-table').first()).toContainText('70')
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
 await page.screenshot({ path: 'test-results/battle-archive-mobile.png', fullPage: true })
 await page.evaluate(async () => {
  const { useRosterScope } = await import('/src/features/armyLibrary/scope.ts')
  useRosterScope.setState({ userId: 'other-account' })
 })
 await page.getByRole('button', { name: 'Battles', exact: true }).click()
 await expect(page.getByText('No completed battles in this archive yet.')).toBeVisible()
})

test('rematch uses deleted roster snapshots, allows review and starts a fresh independent session', async ({ page }) => {
 await page.goto('/')
 const original = await page.evaluate(async () => {
  const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
  const { dispatchBattleEvent, completeBattle } = await import('/src/domain/battle/engine.ts')
  const { saveBattle } = await import('/src/persistence/database.ts')
  let s = dispatchBattleEvent(testCauldronGame(), { type: 'SCORE_ADJUSTED', payload: { playerId: 'p-a', category: 'adjustment', delta: 65 } })
  s = dispatchBattleEvent(s, { type: 'UNIT_DESTROYED', payload: { playerId: 'p-b', unitId: 'tank' } })
  s = completeBattle(s); await saveBattle(s)
  return { id: s.setup.gameId, serialized: JSON.stringify(s) }
 })
 await page.goto(`/battle/setup?rematch=${original.id}`)
 await expect(page.getByRole('heading', { name: 'Play Rematch', exact: true })).toBeVisible()
 await expect(page.getByText('Original roster missing. The recorded snapshot remains available.', { exact: true })).toHaveCount(3)
 await expect(page.getByRole('button', { name: 'FFA 3', exact: false })).toHaveAttribute('aria-pressed','true')
 await page.getByRole('button', { name: 'Next: Commanders', exact: true }).click()
 await expect(page.locator('#commander-0-name')).toHaveValue('Alpha')
 await page.getByRole('button', { name: /Battlefield & Start/ }).click()
 await page.getByRole('button', { name: 'Start locally', exact: true }).click()
 await expect(page).toHaveURL(/\/battle\/(?!setup)/)
 const current = await page.evaluate(async () => {
  const { useBattleStore } = await import('/src/stores/battleStore.ts')
  const { getBattle } = await import('/src/persistence/database.ts')
  const s = useBattleStore.getState().session!
  return { id: s.setup.gameId, vp: s.state.players['p-a'].score.adjustment, alive: !s.state.players['p-b'].units.tank.destroyed, original: JSON.stringify(await getBattle('cauldron-test')) }
 })
 expect(current.id).not.toBe(original.id); expect(current.vp).toBe(0); expect(current.alive).toBe(true); expect(current.original).toBe(original.serialized)
})

test('reviewing Tactical as Fixed seeds every player pair and saving preserves original Primary balance', async ({ page }) => {
 await page.goto('/')
 const id=await page.evaluate(async()=>{
  const { createCauldronGame }=await import('/src/rulesets/cauldronFFA3/session.ts')
  const { testArmy }=await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
  const { completeBattle }=await import('/src/domain/battle/engine.ts')
  const { saveBattle }=await import('/src/persistence/database.ts')
  const armies=['a','b','c'].map(id=>testArmy(id))
  const s=createCauldronGame({armies,guidanceLevel:'fast',primaryDeck:'chapter-approved-ffa',officialPrimaryBalance:'original',secondaryDeck:'chapter-approved',players:armies.map((a,i)=>({id:`p${i}`,name:`Player ${i}`,armyId:a.id,deploymentZone:'ABC'[i],turnPosition:i+1,operationalPlanId:'WYNISZCZENIE',officialPrimaryId:'battlefield-dominance'}))})
  await saveBattle(completeBattle(s));return s.setup.gameId
 })
 await page.goto(`/battle/setup?rematch=${id}`)
 await expect(page.getByRole('heading',{name:'Play Rematch',exact:true})).toBeVisible()
 await page.getByLabel('Secondary strategy',{exact:false}).selectOption('fixed')
 await page.getByRole('button',{name:'Next: Commanders',exact:true}).click()
 await expect(page.locator('#commander-0-fixed-1')).toHaveValue('OFFICIAL_A_GRIEVOUS_BLOW')
 await expect(page.locator('#commander-2-fixed-2')).toHaveValue('OFFICIAL_ENGAGE_ON_ALL_FRONTS')
 await page.getByLabel('Preset name',{exact:true}).fill('Original balance')
 await page.getByRole('button',{name:'Save battle preset',exact:true}).click()
 await expect(page.getByText('Preset saved on this device.',{exact:true})).toBeVisible()
 expect(await page.evaluate(async()=> (await (await import('/src/persistence/storage.ts')).database.battlePresets.toArray())[0].input.officialPrimaryBalance)).toBe('original')
})

test('online rematch waits for its first server clock snapshot and reaches the created lobby', async ({ browser }) => {
 const backend=new PostgresBackend();await backend.init()
 const context=await browser.newContext(),page=await context.newPage()
 try {
  await backend.attach(context)
  let delayed=false
  await context.route('**/rpc/battle_clock_action',async route=>{if(!delayed){delayed=true;await new Promise(resolve=>setTimeout(resolve,350))}await route.fallback()})
  await page.goto('/')
  const id=await page.evaluate(async()=>{
   const { testCauldronGame }=await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
   const { completeBattle }=await import('/src/domain/battle/engine.ts')
   const { clockConfig }=await import('/src/features/battleClock/model.ts')
   const { saveBattle }=await import('/src/persistence/database.ts')
   const s=completeBattle(testCauldronGame());s.setup.battleClock=clockConfig('casual');await saveBattle(s);return s.setup.gameId
  })
  await page.goto(`/battle/setup?rematch=${id}`)
  await expect(page.getByRole('heading',{name:'Play Rematch',exact:true})).toBeVisible()
  await page.getByRole('button',{name:/Online multiplayer/}).click()
  await page.getByRole('button',{name:'Create 3-player lobby',exact:true}).click()
  await expect(page).toHaveURL(/\/shared\?room=/)
  await expect(page.getByLabel('Clock mode')).toHaveValue('casual')
  expect(await page.evaluate(async()=> (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().clockSnapshot?.config.limitMs)).toBe(7200000)
 } finally {await context.close();await backend.close()}
})
