import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { testArmy } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { expect, it } from 'vitest'
import { completeBattle, dispatchBattleEvent } from '../../domain/battle/engine'
import { testCauldronGame } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { newArchive } from '../battleLegacy/repository'
import { setParticipant } from '../battleLegacy/archive'
import { appendCampaignEvent, archiveSourceSignature, campaignBattle, campaignProjection, createCampaign } from './model'
const participants = ['a','b','c'].map(id => ({ id, name:id, faction:`Faction ${id}` }))
const campaign = (unlockNeighbours=false) => createCampaign({ ownerId:'guest', name:'Vespera', description:'A sector', participants, locationCount:6, victory:{type:'points',target:3},unlockNeighbours })
function record(values=[60,50,40]) {
 let s=testCauldronGame();s.setup.gameId=`battle-${values.join('-')}`;s.state.gameId=s.setup.gameId
 for (const [i,score] of values.entries()) s=dispatchBattleEvent(s,{type:'SCORE_ADJUSTED',payload:{playerId:`p-${'abc'[i]}`,category:'adjustment',delta:score}})
 let r=newArchive(completeBattle(s),'guest'); for(const [i,p] of participants.entries())r=setParticipant(r,`p-${'abc'[i]}`,p.id,p.name)
 return r
}
it('applies a canonical FFA result once and records actual control transitions', () => {
 let c=campaign();const r=record(),location=c.locations[0],event=campaignBattle(c,r,location.id)
 c=appendCampaignEvent(c,event);c=appendCampaignEvent(c,event)
 expect(c.events).toHaveLength(1);expect(campaignProjection(c).control[location.id]).toEqual(['a']);expect(campaignProjection(c).points.a).toBe(3)
 expect(() => campaignBattle(c,r,location.id)).toThrow(/already/)
 const next=record([40,70,20]);c=appendCampaignEvent(c,campaignBattle(c,next,location.id))
 expect(campaignProjection(c).history.at(-1)).toMatchObject({previous:['a'],current:['b']})
 expect(campaignProjection(c).winners).toEqual(['a','b'])
})
it('ties award top participants draw points and never transfer control', () => {
 let c=campaign();c=appendCampaignEvent(c,campaignBattle(c,record([60,60,40]),c.locations[0].id))
 expect(campaignProjection(c).control[c.locations[0].id]).toEqual([]);expect(campaignProjection(c).points).toEqual({a:1,b:1,c:0})
})
it('enforces locked sectors and unlocks only linked locations after a victory', () => {
 let c=campaign(true);expect(() => campaignBattle(c,record(),c.locations[4].id)).toThrow(/locked/)
 c=appendCampaignEvent(c,campaignBattle(c,record(),c.locations[0].id))
 expect(campaignProjection(c).unlocked).toContain(c.locations[1].id);expect(campaignProjection(c).unlocked).not.toContain(c.locations[5].id)
})
it('recomputes ownership and points after revocation, retaining the audit timeline', () => {
 let c=campaign();const r=record();c=appendCampaignEvent(c,campaignBattle(c,r,c.locations[0].id))
 c=appendCampaignEvent(c,{id:'revoke',type:'revoke',battleId:r.id,reason:'Corrected source',date:new Date().toISOString()})
 expect(campaignProjection(c).points.a).toBe(0);expect(campaignProjection(c).control[c.locations[0].id]).toEqual([]);expect(c.events).toHaveLength(2)
})
it('shares only public summary facts and never a roster, note or hidden card', () => {
 const r=record();r.session.state.events[0].actorPlayerId='PRIVATE-ACCOUNT';r.session.state.players['p-a'].units.infantry.notes='PRIVATE-NOTE'
 const c=campaign(),e=campaignBattle(c,r,c.locations[0].id)
 const json=JSON.stringify(e);expect(json).not.toContain('PRIVATE');expect(json).not.toContain('armies');expect(json).not.toContain('notes');expect(json).not.toContain('cards')
})
it('rejects partial data and unlinked participants and fingerprints source corrections', () => {
 const c=campaign(),r=record(),old=archiveSourceSignature(r)
 r.identities['p-a'].id='unknown';expect(archiveSourceSignature(r)).not.toBe(old)
 expect(() => campaignBattle(c,r,c.locations[0].id)).toThrow(/Link every/)
 r.withdrawn=true;expect(() => campaignBattle(c,r,c.locations[0].id)).toThrow(/complete/)
})

for (const doubles of [false,true]) it(`uses ${doubles ? '2v2 coalition' : '1v1'} results without inventing pairwise victories`, () => {
 const ids=doubles?['a','b','c','d']:['a','b'],armies=ids.map(id=>testArmy(id))
 let s=createCauldronGame({armies,guidanceLevel:'fast',mode:doubles?'doubles2v2':'duel',primaryDeck:doubles?'chapter-approved-duel':'cauldron',secondaryDeck:doubles?'chapter-approved':'cauldron',
 players:ids.map((id,i)=>({id,name:id,armyId:id,deploymentZone:doubles?i<2?'A':'B':i===0?'A':'B',turnPosition:(doubles?i<2?1:2:i+1) as 1|2|3,operationalPlanId:'WYNISZCZENIE'})),
 doubles:doubles?{rulesVersion:'GW-Doubles-1.0',forces:[{id:'one',name:'One',memberPlayerIds:['a','b'],captainPlayerId:'a',forceDisposition:'take-and-hold',forceType:'convenience',warlord:{playerId:'a',unitId:'remainder'}},{id:'two',name:'Two',memberPlayerIds:['c','d'],captainPlayerId:'c',forceDisposition:'purge-the-foe',forceType:'convenience',warlord:{playerId:'c',unitId:'remainder'}}]}:undefined})
 s=dispatchBattleEvent(s,{type:'SCORE_ADJUSTED',payload:{playerId:'a',category:'adjustment',delta:75}})
 let r=newArchive(completeBattle(s),'guest');ids.forEach(id=>{r=setParticipant(r,id,id,id)})
 const c=createCampaign({ownerId:'guest',name:'Test',description:'',participants:ids.map(id=>({id,name:id,faction:id})),locationCount:3,victory:{type:'points',target:9}})
 const next=appendCampaignEvent(c,campaignBattle(c,r,c.locations[0].id))
 expect(campaignProjection(next).control[c.locations[0].id]).toEqual(doubles?['a','b']:['a'])
 expect(campaignProjection(next).points.a).toBe(3)
 if(doubles)expect(campaignProjection(next).points.b).toBe(3)
})

it('marks dependent conquests as suppressed after an unlocking battle is revoked',()=>{
 let c=campaign(true),r=record();c=appendCampaignEvent(c,campaignBattle(c,r,c.locations[0].id))
 const next=campaignBattle(c,record([30,80,20]),c.locations[1].id);c=appendCampaignEvent(c,next)
 c=appendCampaignEvent(c,{id:'withdraw-unlock',type:'revoke',battleId:r.id,reason:'Correction',date:new Date().toISOString()})
 expect(campaignProjection(c).suppressed).toContain(next.id)
 expect(campaignProjection(c).points.b).toBe(0)
})
