import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const dispositions = ['take-and-hold','purge-the-foe','disruption','reconnaissance','priority-assets']

test('all 45 terrain plans render independently, with all areas and source links', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 820, height: 1180 })
  let number=0
  for(let i=0;i<dispositions.length;i++) for(const b of dispositions.slice(i)) for(const variant of ['A','B','C']) {
    const a=dispositions[i]
    await page.goto(`/terrain-layouts?a=${a}&b=${b}&variant=${variant}`)
    const plan=page.getByRole('region',{name:'Official terrain plan'})
    await expect(plan).toHaveAttribute('data-layout-id',`${a}|${b}|${variant}`)
    await expect(page.locator('[data-terrain-id]')).toHaveCount(16)
    for(const [kind,count] of [['A',4],['B',2],['C',4],['D',4],['E',2]] as const)
      await expect(page.locator(`[data-footprint-type="${kind}"]`)).toHaveCount(count)
    await expect(page.getByRole('link',{name:/Open source diagram/})).toHaveAttribute('href',new RegExp(`#page=${9+number}$`))
    expect(await page.locator('[data-terrain-id] polygon').evaluateAll(elements=>elements.every(element=>element.getBoundingClientRect().width>10 && element.getBoundingClientRect().height>5))).toBe(true)
    if(process.env.CAPTURE_TERRAIN==='1') {
      mkdirSync('test-results/terrain',{recursive:true})
      await page.locator('.terrain-gallery-frame').screenshot({path:`test-results/terrain/${String(number+9).padStart(2,'0')}.png`})
    }
    number++
  }
})

for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:1440,height:1000}])
  test(`gallery layers, doubles and orientation at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport)
    await page.goto('/terrain-layouts')
    const first=page.locator('[data-terrain-id="D1"]')
    const transform=await first.getAttribute('transform')
    await page.getByRole('button',{name:'Rotate 180°'}).click()
    await expect(first).toHaveAttribute('transform',transform!)
    await expect(page.locator('.battlefield-map-svg > g')).toHaveAttribute('transform','rotate(180 55.88 76.2)')
    await page.getByLabel('Footprints',{exact:true}).uncheck()
    await expect(page.locator('[data-terrain-id]')).toHaveCount(0)
    await page.getByLabel('Footprints',{exact:true}).check()
    await page.getByLabel('Terrain features',{exact:true}).uncheck()
    await expect(page.locator('[data-terrain-feature]')).toHaveCount(0)
    await page.getByLabel('Objectives',{exact:true}).uncheck()
    await expect(page.locator('[data-plan-objective]')).toHaveCount(0)
    await page.getByLabel('Deployment zones',{exact:true}).uncheck()
    await expect(page.locator('[data-deployment-zone]')).toHaveCount(0)
    await page.getByLabel('Territory boundaries',{exact:true}).uncheck()
    await expect(page.locator('.battlefield-territory')).toHaveCount(0)
    await page.getByLabel('Deployment zones',{exact:true}).check()
    await page.getByLabel('Format',{exact:true}).selectOption('2v2')
    await expect(page.locator('[data-deployment-zone]')).toHaveCount(2)
    await expect(page.locator('.terrain-role-note')).toContainText('Team A (two players)')
    await expect(page.getByRole('link',{name:'Doubles Companion v1.1 · page 2'})).toBeVisible()
    await page.getByLabel('Inspect area',{exact:true}).selectOption('E1')
    await expect(page.getByRole('region',{name:'Footprint measurements'})).toContainText('E1')
    expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false)
    expect(await page.getByRole('button',{name:'Rotate 180°'}).evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
  })

test('print view retains source, physical plan and full measurement table',async({page})=>{
  await page.goto('/terrain-layouts?a=purge-the-foe&b=reconnaissance&variant=C')
  await page.emulateMedia({media:'print'})
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
  await expect(page.locator('.terrain-gallery-controls')).toBeHidden()
  await expect(page.locator('.terrain-layer-controls')).toBeHidden()
  await expect(page.locator('[data-terrain-id]')).toHaveCount(16)
  await expect(page.locator('.terrain-provenance')).toBeVisible()
  await expect(page.locator('.terrain-measurement-table tbody tr')).toHaveCount(16)
  await expect(page.locator('.terrain-source-hash')).toContainText('187253a9')
  if(process.env.CAPTURE_TERRAIN==='1') await page.pdf({ path: 'test-results/terrain/plan-A4.pdf', format: 'A4', printBackground: true })
})
