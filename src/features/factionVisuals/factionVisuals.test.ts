import { describe,it,expect } from 'vitest'
import catalogue from '../../rulesData/40kdc/generated/factions-0.json'
import type { Army,UnitDefinition } from '../../domain/army/types'
import { detectTheme,factionThemes,unitRole } from './themes'
import { defaults,resolveTheme,validatePreferences } from './preferences'
import { mediaKey,validatePhoto } from './media'
const army={id:'army-a',faction:'Necrons',units:[]} as unknown as Army
const unit={id:'u1',name:'Same unit',keywords:[],categories:[]} as unknown as UnitDefinition

describe('faction metadata',()=>{
 for(const faction of catalogue)it(`recognizes ${faction.id}`,()=>{expect(detectTheme(faction.id).id).toBe(faction.id);expect(detectTheme(faction.name).id).toBe(faction.id)})
 it('normalizes importer prefixes and punctuation',()=>{expect(detectTheme('Imperium - Adeptus Custodes').id).toBe('adeptus-custodes');expect(detectTheme("T'au Empire").id).toBe('tau-empire');expect(detectTheme('Space Marines').id).toBe('adeptus-astartes');expect(detectTheme("Chaos - Emperor’s Children").id).toBe('emperors-children')})
 it('never guesses faction from unit names or loose text',()=>{expect(detectTheme('My Necrons and Orks').id).toBe('neutral');expect(resolveTheme({...army,faction:'Custom',units:[{...unit,name:'Necron Warrior'}]},defaults).id).toBe('neutral')})
 it('keeps same-faction army overrides independent',()=>{const p={...defaults,armies:{'army-a':'orks'}};expect(resolveTheme(army,p).id).toBe('orks');expect(resolveTheme({...army,id:'army-b'},p).id).toBe('necrons');expect(resolveTheme(army,{...p,appearance:'minimal'}).id).toBe('neutral')})
 it('validates persisted preferences and keeps auto overrides',()=>{expect(validatePreferences({appearance:'bad',portraits:'giant',banners:1,theme:'bad',armies:{a:'orks',b:'bad',c:'auto'}})).toEqual({...defaults,armies:{a:'orks',c:'auto'}})})
 it('uses only explicit role tags',()=>{expect(unitRole({...unit,name:'Aircraft Commander'})).toBe('Unit');expect(unitRole({...unit,keywords:['CHARACTER','INFANTRY']})).toBe('Character');expect(unitRole({...unit,categories:['VEHICLE']})).toBe('Vehicle')})
 it('has readable accents on each surface',()=>{const lum=(hex:string)=>{const c=hex.slice(1).match(/../g)!.map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722};for(const t of factionThemes)expect((lum(t.accent)+.05)/(lum(t.surface)+.05),t.id).toBeGreaterThanOrEqual(4.5)})
})
describe('private local media identity',()=>{
 it('separates duplicate names and armies',()=>{expect(mediaKey(army,unit)).not.toBe(mediaKey(army,{...unit,id:'u2'}));expect(mediaKey(army,unit)).not.toBe(mediaKey({...army,id:'b'},unit));expect(mediaKey(army)).not.toBe(mediaKey(army,unit))})
 it('retains importer selection identity after reimport',()=>{expect(mediaKey(army,{...unit,id:'old',sourceMetadata:{importer:'nr',nrSelectionId:'selection'}})).toBe(mediaKey(army,{...unit,id:'new',sourceMetadata:{importer:'nr',nrSelectionId:'selection'}}))})
 it('rejects unsupported formats and oversized input',()=>{expect(()=>validatePhoto({type:'image/svg+xml',size:20} as File)).toThrow(/JPEG/);expect(()=>validatePhoto({type:'image/jpeg',size:13*1024*1024} as File)).toThrow(/12 MB/);expect(()=>validatePhoto({type:'image/webp',size:100} as File)).not.toThrow()})
})
