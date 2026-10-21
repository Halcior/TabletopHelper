import { expect,test,type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import { importTestArmy,selectPanel } from './helpers'
async function seed(page:Page,sameFaction=false){
 await importTestArmy(page)
 return page.evaluate(async(sameFaction)=>{
  const {listArmies,saveArmy,saveBattle}=await import('/src/persistence/database.ts')
  const {createCauldronGame}=await import('/src/rulesets/cauldronFFA3/session.ts')
  const {dispatchBattleEvents}=await import('/src/domain/battle/engine.ts')
  const a=(await listArmies())[0].army
  // Visual fixture only: copied statistics are not a legal Necron roster.
  const b=structuredClone(a);b.id='visual-necrons';b.faction=sameFaction?'Adeptus Custodes':'Necrons';b.name='Emerald expedition';b.units=b.units.map((u,i)=>({...u,name:i===0?'Overlord (visual fixture)':`Warriors ${i+1} (visual fixture)`}))
  a.units[1].name=a.units[0].name
  await saveArmy(a);await saveArmy(b)
  let session=createCauldronGame({gameId:'faction-demo',armies:[a,b],players:[{id:'p-a',name:'Custodes',armyId:a.id,deploymentZone:'A',turnPosition:1,operationalPlanId:'WYNISZCZENIE'},{id:'p-b',name:'Necrons',armyId:b.id,deploymentZone:'B',turnPosition:2,operationalPlanId:'WYNISZCZENIE'}],guidanceLevel:'fast',primaryDeck:'cauldron',secondaryDeck:'cauldron'})
  session=dispatchBattleEvents(session,[{type:'PHASE_CHANGED',payload:{phase:'SHOOTING'}},{type:'SCORE_ADJUSTED',payload:{playerId:'p-a',category:'primary',delta:12}},{type:'SCORE_ADJUSTED',payload:{playerId:'p-b',category:'primary',delta:9}},{type:'UNIT_MODEL_DESTROYED',payload:{playerId:'p-b',unitId:b.units.find(u=>u.startingModels>1)!.id,amount:1,destroyedByPlayerId:'p-a',attackerUnitId:a.units[0].id}}])
  await saveBattle(session)
  return {armyId:a.id,unitId:a.units[0].id,battleId:session.setup.gameId}
 },sameFaction)
}
async function prefs(page:Page){await page.locator('.visual-preferences summary').click()}
const photo='public/faction-art/adeptus-custodes-portrait.webp'
async function editor(page:Page,id:string){await page.goto(`/army/${encodeURIComponent(id)}/appearance`);await expect(page.locator('.photo-editor').first()).toBeVisible()}
async function capture(page:Page,width:number,name:string){if(!process.env.FACTION_CAPTURE)return;await fs.mkdir('docs/faction-visuals/screenshots',{recursive:true});await page.screenshot({path:`docs/faction-visuals/screenshots/${width}-${name}.png`,animations:'disabled'})}
for(const [width,height] of [[375,812],[390,844],[768,1024],[1440,1000]])test(`faction surfaces and stable controls at ${width}px`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},isMobile:width<821,hasTouch:width<821,reducedMotion:'reduce'}),page=await context.newPage(),errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 try{
 const fixture=await seed(page)
 await editor(page,fixture.armyId)
 await page.locator('.photo-editor').nth(1).locator('input').setInputFiles(photo)
 await expect(page.locator('.photo-editor__preview')).toHaveCount(1)
 await page.goto(`/battle/${fixture.battleId}`)
 await expect(page.locator('.score-card')).toHaveCount(2)
 await page.getByRole('button',{name:'Gain 1 CP for Custodes'}).click()
 await expect(page.getByLabel(/Command points for Custodes:/)).toContainText('CP')
 await capture(page,width,'dashboard')
 await selectPanel(page,'army')
 await page.getByRole('button',{name:/Custodes.*Active/}).click()
 await expect(page.locator('.army-banner')).toContainText('Adeptus Custodes')
 await page.locator('.army-banner').scrollIntoViewIfNeeded();await capture(page,width,'army-custodes')
 const card=page.locator('.unit-grid .unit-card').first()
 await card.scrollIntoViewIfNeeded();const before=await card.boundingBox()
 const portrait=await card.locator('.unit-portrait').boundingBox(),heading=await card.locator('h3').boundingBox()
 expect(heading!.x).toBeGreaterThanOrEqual(portrait!.x+portrait!.width+8)
 const minus=card.getByRole('button',{name:'−1 W',exact:true})
 await expect(minus).toBeEnabled();await minus.click();await minus.click();const after=await card.boundingBox();expect(Math.abs(after!.y-before!.y)).toBeLessThan(2)
 await expect(card.locator('.combat-current')).toContainText('5 / 7 W')
 await capture(page,width,'unit-portraits')
 await page.getByRole('button',{name:/Necrons.*Rival/}).click();await page.locator('.army-banner').scrollIntoViewIfNeeded();await capture(page,width,'army-necrons')
 for(const panel of ['objectives','log','report'] as const){await selectPanel(page,panel);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);if(panel==='log'){await page.locator('.chronicle-timeline').scrollIntoViewIfNeeded();await capture(page,width,'chronicle')}if(panel==='report'){await page.locator('.report-ranking').scrollIntoViewIfNeeded();await capture(page,width,'report')}}
 if(width===1440&&process.env.FACTION_CAPTURE){await page.emulateMedia({media:'print'});await page.pdf({path:'docs/faction-visuals/screenshots/report-print.pdf',format:'A4',printBackground:false});await page.emulateMedia({media:'screen'})}
 await selectPanel(page,'army');await prefs(page);await page.getByLabel('Appearance',{exact:true}).selectOption('minimal');await expect(page.locator('.unit-portrait,.army-banner')).toHaveCount(0);await capture(page,width,'minimal');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
})
test('photos survive reload and reimport, duplicate names are independent, JSON stays private',async({page})=>{
 const f=await seed(page);await editor(page,f.armyId)
 const first=page.locator('.photo-editor').nth(1),second=page.locator('.photo-editor').nth(2)
 await first.locator('input').setInputFiles(photo);await expect(first.locator('.photo-editor__preview')).toBeVisible();await expect(second.locator('.photo-editor__preview')).toHaveCount(0)
 await second.locator('input').setInputFiles('public/faction-art/necrons-portrait.webp');await expect(page.locator('.photo-editor__preview')).toHaveCount(2)
 await page.reload();await expect(page.locator('.photo-editor__preview')).toHaveCount(2)
 const sizes=await page.evaluate(async()=>{const {database}=await import('/src/persistence/database.ts');return (await database.visualMedia.toArray()).map(x=>({type:x.blob.type,size:x.blob.size}))});expect(sizes.every(x=>x.type==='image/webp'&&x.size<2*1024*1024)).toBe(true)
 await importTestArmy(page);await editor(page,f.armyId);await expect(page.locator('.photo-editor__preview')).toHaveCount(2)
 await prefs(page);await page.getByLabel('Unit Icons',{exact:true}).selectOption('off');await expect(page.locator('.unit-portrait')).toHaveCount(0);await expect(page.locator('.photo-editor__preview')).toHaveCount(2)
 const serialized=await page.evaluate(async()=>{const {database}=await import('/src/persistence/database.ts');return JSON.stringify([await database.armies.toArray(),await database.battles.toArray()])});expect(serialized).not.toMatch(/blob:|data:image|visualMedia|faction-art/)
 await first.getByRole('button',{name:'Remove photo'}).click();await expect(page.locator('.photo-editor__preview')).toHaveCount(1)
})
test('manual theme, banner reset and persistent preferences preserve saved photos',async({page})=>{
 const f=await seed(page);await editor(page,f.armyId);await prefs(page);await page.getByLabel('Army theme',{exact:true}).selectOption('necrons');await page.locator('.photo-editor').first().locator('input').setInputFiles(photo);await expect(page.locator('.photo-editor__preview')).toHaveCount(1);await page.reload();await expect(page.locator('.army-banner')).toContainText('Necrons theme');await prefs(page);await page.getByLabel('Army Banner',{exact:true}).selectOption('false');await expect(page.locator('.army-banner')).toHaveCount(0);await expect(page.locator('.photo-editor__preview')).toHaveCount(1);await page.getByRole('button',{name:'Reset to faction default'}).click();await expect(page.locator('.photo-editor__preview')).toHaveCount(0);await page.getByRole('button',{name:'Reset army theme'}).click();await expect(page.getByLabel('Army theme',{exact:true})).toHaveValue('auto')
})
test('invalid and corrupt photos show errors; failed art has a role fallback',async({page})=>{
 const f=await seed(page);await editor(page,f.armyId);const input=page.locator('.photo-editor').nth(1).locator('input');await input.setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.getByRole('alert')).toContainText('JPEG');await input.setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('not an image')});await expect(page.getByRole('alert')).toContainText('decoded');await page.route('**/faction-art/**',r=>r.abort());await page.reload();await expect(page.locator('.unit-portrait').first().locator('svg')).toBeVisible()
})
test('local photo works offline and a fresh Minimal load requests no faction art',async({page,context})=>{
 const f=await seed(page);await editor(page,f.armyId);await page.locator('.photo-editor').nth(1).locator('input').setInputFiles(photo);await expect(page.locator('.photo-editor__preview')).toBeVisible();await context.setOffline(true);await prefs(page);await page.getByLabel('Unit Icons',{exact:true}).selectOption('enhanced');await expect.poll(()=>page.locator('.unit-portrait img').first().evaluate((im:HTMLImageElement)=>im.naturalWidth)).toBeGreaterThan(0);await page.getByLabel('Appearance',{exact:true}).selectOption('minimal');await context.setOffline(false);const requests:string[]=[];page.on('request',r=>{if(r.url().includes('/faction-art/'))requests.push(r.url())});await page.reload();await expect(page.locator('.photo-editor').first()).toBeVisible();expect(requests).toEqual([])
})
test('v1 saved armies and battles migrate unchanged; same factions keep player colours',async({page})=>{
 const f=await seed(page,true)
 const originalRows=await page.evaluate(async()=>{const {database}=await import('/src/persistence/database.ts');return {armies:await database.armies.toArray(),battles:await database.battles.toArray()}})
 // Unload the app to close every IndexedDB connection before constructing a legacy database.
 await page.route('**/_migration-fixture',r=>r.fulfill({contentType:'text/html',body:'<title>Legacy migration fixture</title>'}))
 await page.goto('/_migration-fixture')
 const before=await page.evaluate(async({armies,battles})=>{
  await new Promise<void>((resolve,reject)=>{const req=indexedDB.deleteDatabase('tabletop-companion');req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('Database blocked'))})
  await new Promise<void>((resolve,reject)=>{const req=indexedDB.open('tabletop-companion',10);req.onupgradeneeded=()=>{const a=req.result.createObjectStore('armies',{keyPath:'id'});a.createIndex('savedAt','savedAt');a.createIndex('army.faction','army.faction');const b=req.result.createObjectStore('battles',{keyPath:'id'});b.createIndex('status','status');b.createIndex('updatedAt','updatedAt')};req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction(['armies','battles'],'readwrite');for(const row of armies)tx.objectStore('armies').put(row);for(const row of battles)tx.objectStore('battles').put(row);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}})
  return JSON.stringify({armies,battles})
 },originalRows)
 await page.goto('/');await expect(page.getByRole('heading',{name:'Saved rosters'})).toBeVisible()
 const after=await page.evaluate(async()=>{const {database}=await import('/src/persistence/database.ts');return JSON.stringify({armies:await database.armies.toArray(),battles:await database.battles.toArray()})});expect(after).toBe(before)
 await page.goto(`/battle/${f.battleId}`);await expect(page.locator('.score-card')).toHaveCount(2)
 const colours=()=>page.locator('.score-card').evaluateAll(cards=>cards.map(c=>getComputedStyle(c).borderTopColor))
 const original=await colours();expect(original[0]).not.toBe(original[1]);await selectPanel(page,'army');await prefs(page);await page.getByLabel('Army theme',{exact:true}).selectOption('orks');expect(await colours()).toEqual(original)
})

test('themed unit cards use faction emblem icons rather than cropped environmental artwork',async({page})=>{
 const fixture=await seed(page)
 await page.goto('/battle/'+fixture.battleId)
 await selectPanel(page,'army')
 await page.getByRole('button',{name:/Custodes.*Active/}).click()
 const card=page.locator('.unit-grid .unit-card').first()
 await expect(card.locator('.unit-portrait .faction-sigil')).toBeVisible()
 await expect(card.locator('.unit-portrait img')).toHaveCount(0)
 await expect(page.locator('.unit-portrait img')).toHaveCount(0)
 await expect(card.locator('[data-faction-symbol="adeptus-custodes"]')).toBeVisible()
 await expect(card.locator('[data-emblem-source="sprite"]')).toBeVisible()
 await expect(page.locator('.army-banner__art img')).toBeVisible()
})
