import { expect, test, type Page } from '@playwright/test'
import { PostgresBackend } from './postgresBackend'
import { PHONE, selectPanel, dismissSecondaryReveal } from './helpers'

async function seed(page: Page, count = 2, enabled = true) {
  await page.goto('/')
  return page.evaluate(async ({ count, enabled }) => {
    const { createCauldronGame } = await import('/src/rulesets/cauldronFFA3/session.ts')
    const { testArmy } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
    const { createBattleClock, clockConfig } = await import('/src/features/battleClock/model.ts')
    const { saveBattle } = await import('/src/persistence/database.ts')
    const { useBattleStore } = await import('/src/stores/battleStore.ts')
    const army=testArmy('clock-army')
    const doubles=count===4 ? {rulesVersion:'GW-Doubles-1.0',forces:[{id:'alpha',name:'Team Alpha',memberPlayerIds:['p0','p1'],captainPlayerId:'p0',forceDisposition:'take-and-hold',forceType:'convenience',warlord:{playerId:'p0',unitId:'remainder'}},{id:'bravo',name:'Team Bravo',memberPlayerIds:['p2','p3'],captainPlayerId:'p2',forceDisposition:'purge-the-foe',forceType:'convenience',warlord:{playerId:'p2',unitId:'remainder'}}]} : undefined
    const session = createCauldronGame({ doubles, gameId:`clock-${crypto.randomUUID()}`, mode:count===4?'doubles2v2':count===3?'ffa3':'duel', armies:[army], guidanceLevel:'fast', primaryDeck:count===4?'chapter-approved-duel':'cauldron', secondaryDeck:count===4?'chapter-approved':'cauldron', officialLayout:1, players:Array.from({length:count},(_,i)=>({id:`p${i}`,name:['Custodes','Death Guard','Necrons','Thousand Sons'][i],armyId:army.id,deploymentZone:count===4 ? i<2?'A':'B':'ABC'[i],turnPosition:count===4?i<2?1:2:i+1,operationalPlanId:'WYNISZCZENIE'})) })
    if (enabled) {
      session.setup.battleClock=clockConfig('custom',0.05)
      session.battleClock=createBattleClock(session.setup,session.setup.battleClock,Date.now())
    }
    await saveBattle(session)
    useBattleStore.setState({ session })
    return session.setup.gameId
  }, { count, enabled })
}
async function clockState(page: Page) {
  return page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session?.battleClock)
}
async function dismissHelp(page: Page) {
  const button=page.getByRole('button',{name:'Rozumiem',exact:true})
  await expect(button).toBeVisible()
  await button.click()
  await dismissSecondaryReveal(page)
}

test('phone: local clock, tutorial, handoffs, pause, expiry, refresh, Chronicle and final report', async ({browser})=>{
  const context=await browser.newContext(PHONE)
  const page=await context.newPage()
  try {
    const id=await seed(page)
    await page.goto(`/battle/${id}`)
    await expect(page.getByRole('dialog',{name:'Jak używać zegara?'})).toBeVisible()
    await page.getByRole('button',{name:'Rozumiem',exact:true}).click()
    await dismissSecondaryReveal(page)
    const clock=page.getByTestId('battle-clock')
    await clock.getByRole('button',{name:'Uruchom zegar',exact:true}).click()
    await clock.getByRole('button',{name:/Przekaż czas/}).click()
    expect((await clockState(page))?.activeBudgetId).toBe('p1')
    expect(await page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().session?.state.activePlayerId)).toBe('p0')
    await clock.getByRole('button',{name:'Pauza',exact:true}).click()
    const paused=(await clockState(page))!
    await page.reload()
    await expect(clock).toBeVisible()
    await dismissSecondaryReveal(page)
    await expect(page.getByRole('dialog',{name:'Jak używać zegara?'})).toHaveCount(0)
    expect((await clockState(page))?.budgets).toEqual(paused.budgets)
    await clock.getByRole('button',{name:'Wznów',exact:true}).click()
    await expect(clock.locator('.clock-warning--expired')).toHaveCount(1,{timeout:10000})
    // Clock expiry leaves ordinary battle actions available.
    await page.evaluate(async () => (await import('/src/stores/battleStore.ts')).useBattleStore.getState().nextPhase())
    expect(await page.evaluate(async ()=>(await import('/src/stores/battleStore.ts')).useBattleStore.getState().session?.state.phase)).toBe('MOVEMENT')
    await clock.getByRole('button',{name:'Zwiń zegar',exact:true}).click()
    await expect(clock).toHaveClass(/is-collapsed/)
    await clock.getByRole('button',{name:'Rozwiń zegar',exact:true}).click()
    await selectPanel(page,'log')
    await page.getByText('Battle Clock · statystyki',{exact:true}).click()
    await expect(page.getByRole('region',{name:'Time Statistics'})).toBeVisible()
    await page.screenshot({path:'test-results/battle-clock-phone.png',fullPage:true})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.evaluate(async ()=>(await import('/src/stores/battleStore.ts')).useBattleStore.getState().endBattle())
    await page.getByRole('button',{name:'View Battle Report',exact:true}).click()
    await expect(page.getByRole('region',{name:'Time Statistics'})).toBeVisible()
    expect((await clockState(page))?.endedAt).not.toBeNull()
  } finally {await context.close()}
})

test('FFA: explicit recipient, safe Space shortcut and clock-disabled game',async({page})=>{
  const id=await seed(page,3)
  await page.goto(`/battle/${id}`); await dismissHelp(page)
  const clock=page.getByTestId('battle-clock')
  await clock.getByRole('button',{name:'Uruchom zegar'}).click()
  await page.getByLabel('Komu przekazać czas?').selectOption('p2')
  // Space in a form control must retain normal control behavior.
  await page.getByLabel('Komu przekazać czas?').focus()
  await page.keyboard.press('Space')
  expect((await clockState(page))?.activeBudgetId).toBe('p0')
  await page.keyboard.press('Escape')
  await clock.getByRole('button',{name:'Przekaż czas',exact:true}).click()
  expect((await clockState(page))?.activeBudgetId).toBe('p2')
  await page.getByLabel('Komu przekazać czas?').selectOption('p1')
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur()})
  await page.keyboard.press('Space')
  expect((await clockState(page))?.activeBudgetId).toBe('p1')
  const disabled=await seed(page,2,false)
  await page.goto(`/battle/${disabled}`)
  await expect(page.getByRole('navigation',{name:'Battle panels'})).toBeVisible()
  await expect(page.getByTestId('battle-clock')).toHaveCount(0)
  await page.evaluate(async ()=>(await import('/src/stores/battleStore.ts')).useBattleStore.getState().nextPhase())
  expect(await page.evaluate(async ()=>(await import('/src/stores/battleStore.ts')).useBattleStore.getState().session?.state.phase)).toBe('MOVEMENT')
})

test('2v2: two force clocks cover four commanders without allied handoffs',async({page})=>{
  const id=await seed(page,4)
  await page.goto(`/battle/${id}`); await dismissHelp(page)
  const clock=page.getByTestId('battle-clock')
  await expect(clock.locator('.battle-clock__budget')).toHaveCount(2)
  await clock.getByRole('button',{name:'Uruchom zegar'}).click()
  await clock.getByRole('button',{name:'Przekaż czas → Team Bravo',exact:true}).click()
  const state=await clockState(page)
  expect(state?.budgets[0].playerIds).toEqual(['p0','p1'])
  expect(state?.budgets[1].playerIds).toEqual(['p2','p3'])
  expect(state?.activeBudgetId).toBe('bravo')
  expect(state?.budgets.reduce((n,b)=>n+b.manualPasses,0)).toBe(1)
  await page.evaluate(async()=> (await import('/src/stores/battleStore.ts')).useBattleStore.getState().dispatch({type:'TURN_STARTED',payload:{playerId:'p2'}}))
  expect((await clockState(page))?.turnBudgetId).toBe('bravo')
  expect((await clockState(page))?.budgets.reduce((n,b)=>n+b.manualPasses,0)).toBe(1)
})

test('two independent devices: real PostgreSQL RPC, host config, races, clock skew, disconnect and refresh',async({browser})=>{
  test.setTimeout(120000)
  const backend=new PostgresBackend(); await backend.init()
  const a=await browser.newContext(PHONE), b=await browser.newContext({viewport:{width:1440,height:1000}})
  const host=await a.newPage(), guest=await b.newPage()
  try {
    await backend.attach(a); await backend.attach(b)
    const id=await seed(host,2,false)
    const membership=await host.evaluate(async()=> (await import('/src/multiplayer/sharedSessionStore.ts')).useSharedSessionStore.getState().hostCurrentBattle('p0'))
    await host.goto(`/shared?room=${membership.roomCode}`)
    await expect(host.getByRole('region',{name:'Lobby Battle Clock'})).toBeVisible()
    await host.getByLabel('Tryb zegara').selectOption('competitive')
    await host.getByRole('button',{name:'Zapisz zegar',exact:true}).click()
    await expect(host.getByText(/Ustawienia zegara zapisane/)).toBeVisible()
    await guest.goto(`/shared?room=${membership.roomCode}`)
    await guest.locator('input[name="shared-seat"][value="p1"]').check()
    await guest.getByRole('button',{name:'Join lobby',exact:true}).click()
    await expect(guest.getByLabel('Tryb zegara')).toBeDisabled()
    for(const p of [host,guest]) await p.getByRole('button',{name:'I am ready',exact:true}).click()
    await expect(host.getByRole('button',{name:'Start battle',exact:true})).toBeEnabled()
    await host.getByRole('button',{name:'Start battle',exact:true}).click()
    for(const p of [host,guest]) {await expect(p).toHaveURL(new RegExp(`/battle/${id}`)); await expect(p.getByTestId('battle-clock')).toBeVisible(); await dismissHelp(p)}
    const hc=host.getByTestId('battle-clock'), gc=guest.getByTestId('battle-clock')
    await hc.getByRole('button',{name:'Uruchom zegar'}).click()
    await expect.poll(async()=> (await clockState(guest))?.running).toBe(true)
    await hc.getByRole('button',{name:/Przekaż czas/}).click()
    await expect.poll(async()=> (await clockState(guest))?.activeBudgetId).toBe('p1')
    // Change one device wall clock by four hours. Server samples use performance.now.
    await guest.evaluate(()=>{const now=Date.now.bind(Date);Date.now=()=>now()+4*60*60*1000})
    await expect(gc.locator('time').first()).toHaveText(/1:29:5\d|1:30:00/)
    const revision=(await clockState(host))!.revision
    const target='p0'
    const results=await Promise.all([host,guest].map(p=>p.evaluate(async({revision,target})=>{
      const { useSharedSessionStore }=await import('/src/multiplayer/sharedSessionStore.ts')
      const { sharedSessionTransport }=await import('/src/multiplayer/supabaseRestTransport.ts')
      const m=useSharedSessionStore.getState().membership!
      return (await sharedSessionTransport.battleClock(m.roomId,m.clientId,{type:'pass',targetId:target},revision)).applied
    },{revision,target})))
    expect(results.filter(Boolean)).toHaveLength(1)
    await expect.poll(async()=> (await clockState(guest))?.activeBudgetId).toBe('p0')
    await expect.poll(async()=> (await clockState(host))?.revision).toBe(revision+1)
    await b.setOffline(true)
    await expect(gc.getByRole('button',{name:/Przekaż czas/})).toBeDisabled()
    await hc.getByRole('button',{name:/Przekaż czas/}).click()
    await b.setOffline(false)
    await expect.poll(async()=> (await clockState(guest))?.activeBudgetId).toBe('p1')
    await expect(gc.getByRole('button',{name:/Przekaż czas/})).toBeEnabled()
    const beforeReload=(await clockState(guest))!
    await guest.reload()
    await expect(gc).toBeVisible()
    await dismissSecondaryReveal(guest)
    await expect.poll(async()=> (await clockState(guest))?.revision).toBe(beforeReload.revision)
    await gc.getByRole('button',{name:'Pauza',exact:true}).click()
    await expect.poll(async()=> (await clockState(host))?.running).toBe(false)
    expect((await clockState(host))?.budgets.reduce((sum,b)=>sum+b.manualPasses,0)).toBe(3)
    await guest.screenshot({path:'test-results/battle-clock-desktop.png',fullPage:true})
    expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    // Existing actual engine turn progression controls automatic handoff.
    await host.evaluate(async()=>{
      const { useBattleStore }=await import('/src/stores/battleStore.ts')
      useBattleStore.getState().dispatch({type:'TURN_STARTED',payload:{playerId:'p1'}})
    })
    await expect.poll(async()=> (await clockState(guest))?.turnBudgetId).toBe('p1')
    await expect.poll(async()=> (await clockState(guest))?.activeBudgetId).toBe('p1')
    expect((await clockState(guest))?.running).toBe(false)
  } finally {await a.close();await b.close();await backend.close()}
})
