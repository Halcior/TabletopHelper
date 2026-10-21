import { describe,it,expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import catalogue from '../../rulesData/40kdc/generated/factions-0.json'
import type { Army,UnitDefinition } from '../../domain/army/types'
import { detectTheme,factionThemes,unitRole,factionArtUrl,factionArtSrcSet,themeById } from './themes'
import { defaults,resolveTheme,validatePreferences } from './preferences'
import { mediaKey,validatePhoto } from './media'
import { factionSigilPaths,illustratedEmblemIds,factionEmblemCells,ILLUSTRATED_EMBLEM_ASSET } from './FactionSigil'
const army={id:'army-a',faction:'Necrons',units:[]} as unknown as Army
const unit={id:'u1',name:'Same unit',keywords:[],categories:[]} as unknown as UnitDefinition

describe('faction metadata',()=>{
 for(const faction of catalogue)it(`recognizes ${faction.id}`,()=>{expect(detectTheme(faction.id).id).toBe(faction.id);expect(detectTheme(faction.name).id).toBe(faction.id)})
 it('normalizes importer prefixes and punctuation',()=>{expect(detectTheme('Imperium - Adeptus Custodes').id).toBe('adeptus-custodes');expect(detectTheme("T'au Empire").id).toBe('tau-empire');expect(detectTheme('Space Marines').id).toBe('adeptus-astartes');expect(detectTheme("Chaos - Emperor’s Children").id).toBe('emperors-children')})
 it('never guesses faction from unit names or loose text',()=>{expect(detectTheme('My Necrons and Orks').id).toBe('neutral');expect(resolveTheme({...army,faction:'Custom',units:[{...unit,name:'Necron Warrior'}]},defaults).id).toBe('neutral')})
 it('keeps same-faction army overrides independent',()=>{const p={...defaults,armies:{'army-a':'orks'}};expect(resolveTheme(army,p).id).toBe('orks');expect(resolveTheme({...army,id:'army-b'},p).id).toBe('necrons');expect(resolveTheme(army,{...p,appearance:'minimal'}).id).toBe('neutral')})
 it('validates persisted preferences and keeps auto overrides',()=>{expect(validatePreferences({appearance:'bad',portraits:'giant',banners:1,theme:'bad',armies:{a:'orks',b:'bad',c:'auto'}})).toEqual({...defaults,armies:{a:'orks',c:'auto'}})})
 it('keeps an optional Shadowkeepers appearance separate from normal Custodes',()=>{
   expect(detectTheme('Adeptus Custodes').id).toBe('adeptus-custodes')
   expect(themeById('custodes-shadowkeepers').art).toBe('custodes-shadowkeepers')
   expect(resolveTheme({...army,id:'keeper-army',faction:'Adeptus Custodes'},{
      ...defaults,armies:{'keeper-army':'custodes-shadowkeepers'}
   }).id).toBe('custodes-shadowkeepers')
   expect(detectTheme('Shadowkeepers').id).toBe('custodes-shadowkeepers')
 })
 it('uses one distinct environment per known catalogue faction',()=>{
   const fromCatalogue=factionThemes.filter(t=>t.id!=='neutral' && t.id!=='custodes-shadowkeepers')
   expect(new Set(fromCatalogue.map(t=>t.art)).size).toBe(fromCatalogue.length)
 })
 it('ships every referenced banner and unit-portrait artwork, with correct SVG handling',()=>{
   for(const theme of factionThemes){
     if(!theme.art)continue
     const banner=factionArtUrl(theme)
     const portrait=factionArtUrl(theme,'portrait')
     expect(banner).toBeTruthy()
     expect(portrait).toBeTruthy()
     expect(existsSync(join(process.cwd(),'public',banner!.slice(1))),theme.id).toBe(true)
     expect(existsSync(join(process.cwd(),'public',portrait!.slice(1))),theme.id).toBe(true)
     if(theme.artType==='svg'){
       expect(banner).toBe(portrait)
       expect(factionArtSrcSet(theme)).toBeUndefined()
     }
   }
 })
 it('uses only explicit role tags',()=>{expect(unitRole({...unit,name:'Aircraft Commander'})).toBe('Unit');expect(unitRole({...unit,keywords:['CHARACTER','INFANTRY']})).toBe('Character');expect(unitRole({...unit,categories:['VEHICLE']})).toBe('Vehicle')})
 it('has readable accents on each surface',()=>{const lum=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};for(const t of factionThemes)expect((lum(t.accent)+.05)/(lum(t.surface)+.05),t.id).toBeGreaterThanOrEqual(4.5)})
})
describe('private local media identity',()=>{
 it('separates duplicate names and armies',()=>{expect(mediaKey(army,unit)).not.toBe(mediaKey(army,{...unit,id:'u2'}));expect(mediaKey(army,unit)).not.toBe(mediaKey({...army,id:'b'},unit));expect(mediaKey(army)).not.toBe(mediaKey(army,unit))})
 it('retains importer selection identity after reimport',()=>{expect(mediaKey(army,{...unit,id:'old',sourceMetadata:{importer:'nr',nrSelectionId:'selection'}})).toBe(mediaKey(army,{...unit,id:'new',sourceMetadata:{importer:'nr',nrSelectionId:'selection'}}))})
 it('rejects unsupported formats and oversized input',()=>{expect(()=>validatePhoto({type:'image/svg+xml',size:20} as File)).toThrow(/JPEG/);expect(()=>validatePhoto({type:'image/jpeg',size:13*1024*1024} as File)).toThrow(/12 MB/);expect(()=>validatePhoto({type:'image/webp',size:100} as File)).not.toThrow()})
})

describe('original faction icon coverage',()=>{
 it('has one nonempty icon for every catalogue faction and Shadowkeepers',()=>{
   for(const theme of factionThemes){
     const [outline,detail]=factionSigilPaths[theme.id]??[]
     expect(outline?.length,theme.id).toBeGreaterThan(12)
     expect(detail?.length,theme.id).toBeGreaterThan(8)
   }
 })
 it('does not reuse a faction emblem silhouette across themes',()=>{
   const glyphs=factionThemes.map(t=>factionSigilPaths[t.id].join('|'))
   expect(new Set(glyphs).size).toBe(glyphs.length)
 })
})

describe('approved illustrated emblem atlas',()=>{
 it('ships the 20 unique images in one local atlas',()=>{
   expect(illustratedEmblemIds).toHaveLength(20)
   expect(new Set(illustratedEmblemIds).size).toBe(20)
   for(const [index,id] of illustratedEmblemIds.entries()) {
     expect(factionEmblemCells[id]).toBe(index)
     expect(factionThemes.some(theme=>theme.id===id)).toBe(true)
   }
   expect(existsSync(join(process.cwd(),'public',ILLUSTRATED_EMBLEM_ASSET.slice(1)))).toBe(true)
 })
 it('keeps vector fallback paths for every other faction',()=>{
   for(const theme of factionThemes)expect(factionSigilPaths[theme.id]?.length).toBe(2)
 })
})
