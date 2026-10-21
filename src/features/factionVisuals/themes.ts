import type { CSSProperties } from 'react'
import type { Army, UnitDefinition } from '../../domain/army/types'
import type { BattleSession } from '../../domain/battle/types'
// Presentation-only catalogue snapshot. The test checks every ID against bundled rules metadata.
// Keep visual preferences independent from loading the rules-data / Stratagem pipeline.
const catalogue = [{"id":"adepta-sororitas","name":"Adepta Sororitas"},{"id":"adeptus-astartes","name":"Adeptus Astartes"},{"id":"adeptus-custodes","name":"Adeptus Custodes"},{"id":"adeptus-mechanicus","name":"Adeptus Mechanicus"},{"id":"aeldari","name":"Aeldari"},{"id":"agents-of-the-imperium","name":"Agents of the Imperium"},{"id":"astra-militarum","name":"Astra Militarum"},{"id":"black-templars","name":"Black Templars"},{"id":"blood-angels","name":"Blood Angels"},{"id":"chaos-daemons","name":"Chaos Daemons"},{"id":"chaos-knights","name":"Chaos Knights"},{"id":"chaos-space-marines","name":"Chaos Space Marines"},{"id":"crimson-fists","name":"Crimson Fists"},{"id":"dark-angels","name":"Dark Angels"},{"id":"death-guard","name":"Death Guard"},{"id":"deathwatch","name":"Deathwatch"},{"id":"drukhari","name":"Drukhari"},{"id":"emperors-children","name":"Emperor’s Children"},{"id":"genestealer-cults","name":"Genestealer Cults"},{"id":"grey-knights","name":"Grey Knights"},{"id":"imperial-fists","name":"Imperial Fists"},{"id":"imperial-knights","name":"Imperial Knights"},{"id":"iron-hands","name":"Iron Hands"},{"id":"leagues-of-votann","name":"Leagues of Votann"},{"id":"necrons","name":"Necrons"},{"id":"orks","name":"Orks"},{"id":"raven-guard","name":"Raven Guard"},{"id":"salamanders","name":"Salamanders"},{"id":"space-wolves","name":"Space Wolves"},{"id":"tau-empire","name":"T’au Empire"},{"id":"thousand-sons","name":"Thousand Sons"},{"id":"tyranids","name":"Tyranids"},{"id":"ultramarines","name":"Ultramarines"},{"id":"white-scars","name":"White Scars"},{"id":"world-eaters","name":"World Eaters"}]

export type FactionVisualTheme = { id: string; name: string; accent: string; secondary: string; surface: string; pattern: string; art?: string; artType?: 'webp' | 'svg'; aliases: string[] }
const palettes: Record<string, [string, string, string]> = {
  'adeptus-custodes': ['#e5c478','#713447','#211e18'], 'adeptus-astartes': ['#89b5ed','#bd9c54','#151e2d'],
  'astra-militarum': ['#c0c991','#69784b','#1c2119'], 'adepta-sororitas': ['#ede0c7','#9d4d65','#25191e'],
  'adeptus-mechanicus': ['#ee9c84','#aa6049','#281b19'], 'imperial-knights': ['#c6cdd8','#ad934d','#1b212b'],
  'chaos-space-marines': ['#e8a58c','#a03b3b','#261918'], 'death-guard': ['#c3cc88','#7f7949','#24251a'],
  'thousand-sons': ['#6edbd5','#b79b51','#152729'], 'world-eaters': ['#f19a85','#9f3d36','#291918'],
  'chaos-daemons': ['#d5a2ed','#a13c68','#27192e'], 'chaos-knights': ['#dfad94','#934c39','#261d1a'],
  necrons: ['#9ce9b6','#479c7b','#16251f'], aeldari: ['#a8ece8','#9d7abc','#19272b'],
  drukhari: ['#d2b1f0','#809647','#231c2b'], orks: ['#c2db88','#b28a40','#24261b'],
  tyranids: ['#e1b4e7','#aa577c','#281c2b'], 'tau-empire': ['#efc2a0','#ca7f45','#29221c'],
  'leagues-of-votann': ['#9bdad7','#b77e54','#1b2526'], 'genestealer-cults': ['#c7b2e6','#9f5966','#231e2b'],
  'black-templars': ['#ded9c9','#938375','#21211f'], 'blood-angels': ['#efa19e','#b14951','#291b1f'],
  'dark-angels': ['#a6c9ab','#4e785e','#19251f'], 'space-wolves': ['#aec9db','#a79e78','#1c242b'],
  'imperial-fists': ['#eed888','#ac913f','#29251b'], 'salamanders': ['#aad793','#698b49','#202719'],
  'raven-guard': ['#ced3de','#70798d','#1e2128'], 'white-scars': ['#e0e2dc','#af6264','#252525'],
  'iron-hands': ['#bdc9d1','#6b7c8b','#202529'], 'deathwatch': ['#d2c7c4','#96565c','#251f21'],
  'grey-knights': ['#c9dbeb','#9b886b','#1e252b'], 'crimson-fists': ['#a8bee7','#ad5b69','#1c2330'],
  'ultramarines': ['#9abfed','#bb9b5c','#1a2433'], 'agents-of-the-imperium': ['#d9cba7','#9b735b','#25221c'],
  'emperors-children': ['#e6b0e2','#a77b43','#2b1c2b'],
}
const artAlias: Record<string,string> = { 'adeptus-astartes':'space-marines' }
// Original illustrated SVG environments supplement the 20 full-resolution WebP
// paintings; avoid recolouring one painting for unrelated chapters/factions.
const svgArtworkIds = new Set(["custodes-shadowkeepers","agents-of-the-imperium","emperors-children","black-templars","blood-angels","crimson-fists","dark-angels","deathwatch","grey-knights","imperial-fists","iron-hands","raven-guard","salamanders","space-wolves","ultramarines","white-scars"])
export const neutralTheme: FactionVisualTheme = { id:'neutral', name:'Neutral', accent:'#c3cedc', secondary:'#697586', surface:'#1b212b', pattern:'linear-gradient(135deg, transparent 48%, #ffffff08 49%, transparent 51%)', aliases:[] }
export const factionThemes: FactionVisualTheme[] = [neutralTheme, ...catalogue.map(({id,name}, index) => ({
  id, name, accent:palettes[id][0], secondary:palettes[id][1], surface:palettes[id][2],
  pattern:`repeating-linear-gradient(${index % 2 ? 135 : 45}deg, transparent 0 22px, #ffffff06 23px 24px)`,
  art:artAlias[id] ?? id,
  artType: svgArtworkIds.has(id) ? 'svg' : 'webp',
  aliases:[name,id, ...(id === 'adeptus-astartes' ? ['Space Marines'] : []), ...(id === 'agents-of-the-imperium' ? ['Imperial Agents'] : [])],
})), {
  id:'custodes-shadowkeepers', name:'Custodes · Shadowkeepers',
  accent:'#d3b678', secondary:'#8d4b49', surface:'#15151a',
  pattern:'repeating-linear-gradient(90deg, transparent 0 28px, #98775110 29px 30px)',
  art:'custodes-shadowkeepers', artType:'svg',
  // Explicit appearance variant: imported Custodes remain generic until the player selects it.
  aliases:['Shadowkeepers','Custodes Shadowkeepers','Adeptus Custodes Shadowkeepers'],
}]
export function normalizeFaction(value:string):string { return value.normalize('NFKD').toLowerCase().replace(/[’‘']/g,'').replace(/^(imperium|chaos|aeldari)\s+-\s+/, '').replace(/[^a-z0-9]+/g,' ').trim() }
export function detectTheme(faction?:string):FactionVisualTheme { const key=normalizeFaction(faction ?? ''); return factionThemes.find(t=>t.aliases.some(a=>normalizeFaction(a)===key)) ?? neutralTheme }
export function themeById(id:string):FactionVisualTheme { return factionThemes.find(t=>t.id===id) ?? neutralTheme }
export function factionArtUrl(theme:FactionVisualTheme, variant:'banner'|'portrait'='banner'):string|undefined {
  if(!theme.art)return undefined
  if(theme.artType==='svg')return `/faction-art/${theme.art}.svg`
  return `/faction-art/${theme.art}${variant==='portrait'?'-portrait':''}.webp`
}
export function factionArtSrcSet(theme:FactionVisualTheme):string|undefined {
  return theme.art && theme.artType!=='svg'
    ? `/faction-art/${theme.art}-small.webp 640w, /faction-art/${theme.art}.webp 1280w`
    : undefined
}
export function themeStyle(theme:FactionVisualTheme):CSSProperties { return { '--faction-accent':theme.accent, '--faction-secondary':theme.secondary, '--faction-surface':theme.surface, '--faction-pattern':theme.pattern } as CSSProperties }
export function armyForPlayer(session:BattleSession, playerId:string):Army|undefined { const id=session.setup.players.find(p=>p.id===playerId)?.armyId; return id ? session.setup.armies[id] : undefined }
export function unitRole(unit:UnitDefinition):string { const tags=new Set([...unit.keywords,...unit.categories].map(t=>t.toUpperCase())); return ['CHARACTER','AIRCRAFT','WALKER','MONSTER','VEHICLE','MOUNTED','CAVALRY','TERMINATOR','INFANTRY'].find(t=>tags.has(t))?.toLowerCase().replace(/^./, s=>s.toUpperCase()) ?? 'Unit' }
