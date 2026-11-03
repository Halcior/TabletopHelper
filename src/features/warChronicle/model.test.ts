import { expect, it } from 'vitest'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { completeBattle, dispatchBattleEvent } from '../../domain/battle/engine'
import { newArchive } from '../battleLegacy/repository'
import { freshChronicleDraft, narrationBrief, validChronicleDraft, warDocument } from './model'
import { chroniclePrintHtml, frameSvg } from './print'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import { unitMapChangeInput } from '../../domain/battlefield/unitTracking'
it('uses factions and recorded attribution, excluding account names, notes and guessed units',()=>{
 let s=testCauldronGame();s.setup.players[0].name='PRIVATE-PLAYER';s.state.players['p-a'].name='PRIVATE-PLAYER';s.state.players['p-a'].units.infantry.notes='PRIVATE-NOTE'
 s=dispatchBattleEvent(s,{type:'UNIT_DESTROYED',payload:{playerId:'p-b',unitId:'tank',destroyedByPlayerId:'p-a',note:'PRIVATE-COMBAT-NOTE'}})
 const r=newArchive(completeBattle(s),'PRIVATE-ACCOUNT'),d=warDocument(r,'war-chronicle','pl'),brief=narrationBrief(d)
 expect(brief).not.toContain('PRIVATE');expect(brief).toContain('nieustalony oddział armii army-a faction');expect(d.units.filter(u=>u.faction==='army-a faction').every(u=>u.kills===0&&u.damage===null)).toBe(true)
})
it('does not describe partial losses as a full elimination, or infer Wounds',()=>{
 let s=dispatchBattleEvent(testCauldronGame(),{type:'UNIT_MODEL_DESTROYED',payload:{playerId:'p-b',unitId:'infantry',amount:1,destroyedByPlayerId:'p-a',attackerUnitId:'tank'}})
 const d=warDocument(newArchive(completeBattle(s),'guest'),'tactical','pl')
 expect(d.paragraphs.join(' ')).toContain('1 model netto');expect(d.paragraphs.join(' ')).not.toContain('całkowicie wyeliminowany')
 expect(d.units.find(u=>u.faction==='army-a faction'&&u.name==='Single-model tank')?.damage).toBeNull()
})
it('removes restored kills from factual narration and keeps the original history untouched',()=>{
 let s=dispatchBattleEvent(testCauldronGame(),{type:'UNIT_DESTROYED',payload:{playerId:'p-b',unitId:'tank',destroyedByPlayerId:'p-a',attackerUnitId:'tank'}})
 s=dispatchBattleEvent(s,{type:'UNIT_MODEL_RESTORED',payload:{playerId:'p-b',unitId:'tank',amount:1}})
 const r=newArchive(completeBattle(s),'guest'),original=JSON.stringify(r.session),d=warDocument(r,'war-chronicle','en')
 expect(d.paragraphs.join(' ')).not.toContain('Full elimination');expect(JSON.stringify(r.session)).toBe(original)
})
it('uses reserve entries only when their canonical position event was accepted',()=>{
 let s=dispatchBattleEvent(testCauldronGame(),{type:'UNIT_TRACKING_CHANGED',payload:{enabled:true}})
 s=dispatchBattleEvent(s,unitMapChangeInput(s.state,'p-a','infantry','reserves',null))
 s=dispatchBattleEvent(s,unitMapChangeInput(s.state,'p-a','infantry','battlefield',{x:.3,y:.4}))
 const d=warDocument(newArchive(completeBattle(s),'guest'),'war-chronicle','pl')
 expect(d.paragraphs.join(' ')).toContain('wszedł z rezerw')
})
it('labels incomplete history as unverified and preserves unknown positions',()=>{
 const r=newArchive(completeBattle(testCauldronGame()),'guest');r.session.state.events=[]
 const d=warDocument(r,'tactical','en');expect(d.reliable).toBe(false);expect(d.units).toEqual([]);expect(d.paragraphs.join(' ')).toContain('unverified')
 const normal=testCauldronGame(),frame=buildBattlefieldReplay(normal).at(-1)!
 expect(frameSvg(normal,frame)).not.toContain('<line ')
})
it('exports safe, self-contained printable HTML and a separate factual section',()=>{
 const r=newArchive(completeBattle(testCauldronGame()),'guest'),d=warDocument(r,'tactical','pl'),draft=freshChronicleDraft(r,'tactical','pl')
 draft.title='<img src=x onerror=alert(1)>';draft.text='Zażółć gęślą jaźń.\n\n<script>alert(2)</script>'
 const html=chroniclePrintHtml(d,draft,r.session,[buildBattlefieldReplay(r.session).at(-1)!])
 expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');expect(html).not.toContain('<img src=x');expect(html).toContain('data:image/svg+xml');expect(html).toContain('Zarejestrowany wkład jednostek');expect(html).toContain('Zażółć')
 expect(validChronicleDraft({...draft,locale:'<script>'})).toBe(false);expect(validChronicleDraft(draft)).toBe(true)
})
it('campaign narrative states only supplied campaign effects and leaves manual text out of the AI brief',()=>{
 const r=newArchive(completeBattle(testCauldronGame()),'guest'),context={name:'Vespera',location:'Vespera Prime',applied:false,previous:[],current:[]}
 const d=warDocument(r,'campaign-chronicle','en',context),draft=freshChronicleDraft(r,'campaign-chronicle','en',context);draft.text='PRIVATE-EDITED-STORY'
 expect(d.paragraphs.join(' ')).toContain('currently causes no campaign control transfer');expect(narrationBrief(d)).not.toContain(draft.text)
})
