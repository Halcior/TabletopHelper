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

test('campaign assigns factual results once, retains fiction separately and rolls back a conquest', async ({ page }) => {
 await page.setViewportSize({ width:390,height:844 }); await page.goto('/')
 await page.evaluate(async () => {
  const { testCauldronGame } = await import('/src/rulesets/cauldronFFA3/cauldronTestUtils.ts')
  const { dispatchBattleEvent, completeBattle } = await import('/src/domain/battle/engine.ts')
  const { saveBattle } = await import('/src/persistence/database.ts')
  const { database } = await import('/src/persistence/storage.ts')
  let s=dispatchBattleEvent(testCauldronGame(),{type:'SCORE_ADJUSTED',payload:{playerId:'p-a',category:'adjustment',delta:70}})
  s=completeBattle(s);await saveBattle(s)
  const r=(await database.battleArchive.get(['guest',s.setup.gameId]))!
  r.identities={'p-a':{id:'local:self',label:'Me'},'p-b':{id:'local:enemy',label:'Enemy'},'p-c':{id:'local:third',label:'Third'}}
  await database.battleArchive.put(r)
 })
 await page.goto('/campaigns');await page.getByRole('button',{name:'Create campaign',exact:true}).click()
 await page.getByLabel('Campaign name',{exact:true}).fill('The Vespera War')
 await page.getByRole('checkbox',{name:'Enemy',exact:true}).check();await page.getByRole('checkbox',{name:'Third',exact:true}).check()
 await page.getByRole('button',{name:'Create private campaign',exact:true}).click()
 await expect(page.getByRole('heading',{name:'The Vespera War',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Vespera Prime',exact:true}).click()
 await page.getByLabel('Archived battle',{exact:true}).selectOption('cauldron-test')
 await page.getByRole('button',{name:'Confirm campaign result',exact:true}).click()
 await expect(page.locator('.sector-location dd').first()).toHaveText('army-a faction')
 await page.getByLabel('Chapter title',{exact:true}).fill('The Golden Intervention')
 await page.getByLabel('Fictional narrative · separate from recorded battle facts',{exact:true}).fill('A fictional dawn over Vespera.')
 await page.getByRole('button',{name:'Save chapter',exact:true}).click()
 await expect(page.getByText('Fiction · manual chapter',{exact:false})).toBeVisible()
 await page.reload();await expect(page.locator('.sector-location dd').first()).toHaveText('army-a faction')
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).toBe(true)
 await page.screenshot({path:'test-results/campaign-mobile.png',fullPage:true})
 await page.getByRole('button',{name:'Withdraw campaign result',exact:true}).click()
 await expect(page.locator('.sector-location dd').first()).toHaveText('Neutral')
 await expect(page.getByText('The Golden Intervention',{exact:true})).toBeVisible()
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

test('private campaign sync grants a member read-only access and removes it after revocation',async({browser})=>{
 const backend=new PostgresBackend();await backend.init()
 const a=await browser.newContext(),b=await browser.newContext(),host=await a.newPage(),member=await b.newPage()
 async function login(page: typeof host,email:string){
  await page.goto('/account');await page.getByRole('textbox',{name:'Email',exact:true}).fill(email)
  await page.getByRole('button',{name:'Send sign-in link'}).click();await page.getByText('Enter email code',{exact:true}).click()
  await page.getByRole('textbox',{name:'Email code'}).fill('123456');await page.getByRole('button',{name:'Verify code'}).click()
  await expect(page.getByRole('heading',{name:email,exact:true})).toBeVisible()
 }
 try {
  await backend.attach(a);await backend.attach(b);await login(host,'a@example.test');await login(member,'b@example.test')
  const id=await host.evaluate(async()=>{
   const { createCampaign }=await import('/src/features/campaigns/model.ts')
   const { saveCampaign }=await import('/src/features/campaigns/repository.ts')
   const c=createCampaign({ownerId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Private sector',description:'Members only',participants:[{id:'host',name:'Host',faction:'Custodes',profileId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{id:'member',name:'Member',faction:'Necrons',profileId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}],locationCount:3,victory:{type:'points',target:10}})
   await saveCampaign(c);return c.id
  })
  await host.goto(`/campaigns/${id}`);await host.getByRole('button',{name:'Sync private campaign',exact:true}).click()
  await expect.poll(async()=>await host.evaluate(async()=> (await (await import('/src/persistence/storage.ts')).database.campaigns.toArray())[0].revision)).toBe(1)
  await member.goto(`/campaigns/${id}`);await expect(member.getByRole('heading',{name:'Private sector',exact:true})).toBeVisible()
  await expect(member.getByRole('heading',{name:'Assign an archived battle',exact:true})).toHaveCount(0)
  expect(await member.evaluate(async()=> (await (await import('/src/persistence/storage.ts')).database.campaigns.toArray()).length)).toBe(0)
  await host.getByText('Participant account access',{exact:true}).click()
  await host.getByLabel('Account access · Member',{exact:true}).selectOption('')
  await host.getByRole('button',{name:'Sync private campaign',exact:true}).click()
  await expect.poll(async()=>await host.evaluate(async()=> (await (await import('/src/persistence/storage.ts')).database.campaigns.toArray())[0].revision)).toBe(2)
  await member.getByRole('button',{name:'Refresh shared campaigns',exact:true}).click()
  await expect(member.getByText('Campaign unavailable in this account or connection.',{exact:true})).toBeVisible()
  await expect(member.getByRole('heading',{name:'Private sector',exact:true})).toHaveCount(0)
  await host.evaluate(async()=> (await import('/src/features/i18n/locale.ts')).useLocale.getState().setLocale('pl'))
  await host.setViewportSize({width:390,height:844})
  await expect(host.getByRole('heading',{name:'Kampanie fabularne',exact:true})).toBeVisible()
  expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await host.evaluate(()=>window.scrollTo(0,0))
  await host.screenshot({path:'test-results/campaign-mobile.png',fullPage:true})
  await host.setViewportSize({width:1440,height:1000})
  await host.screenshot({path:'test-results/campaign-desktop.png',fullPage:true})
 } finally {await a.close();await b.close();await backend.close()}
})
