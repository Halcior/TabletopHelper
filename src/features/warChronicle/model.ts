import type { BattleSession } from '../../domain/battle/types'
import { buildBattleChronicle } from '../../domain/battle/chronicle'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import { unitMapKey } from '../../domain/battlefield/unitTracking'
import { archiveFacts, type ArchiveRecord } from '../battleLegacy/archive'
import { archiveSourceSignature } from '../campaigns/model'
import { doublesScorekeeperId } from '../../domain/battle/doubles'
import type { Locale } from '../i18n/locale'

export type ChronicleStyle = 'tactical' | 'war-chronicle' | 'campaign-chronicle'
export type ChronicleDraft = { campaignId?:string; version:1; style:ChronicleStyle; locale:Locale; title:string; text:string; sourceSignature:string }
export type ChronicleCampaignContext = { id?:string; points?:string[]; name:string; location:string; applied:boolean; previous:string[]; current:string[] }
export type WarDocument = {
 title:string; locale:Locale; style:ChronicleStyle; date:string; format:string; reliable:boolean
 sides:Array<{id:string;faction:string;vp:number}>
 paragraphs:string[]; highlights:string[]
 units:Array<{name:string;faction:string;damage:number|null;models:number;kills:number;points:number;actions:number;missionVp:number|null;survived:boolean}>
 campaign?:ChronicleCampaignContext
}
export function factionLabel(session:BattleSession,playerId:string) {
 const p=session.setup.players.find(p=>p.id===playerId)
 const force=session.setup.doubles?.forces.find(f=>f.captainPlayerId===playerId)
 return force ? force.memberPlayerIds.map(id=>factionLabelForCommander(session,id)).join(' + ') : p ? factionLabelForCommander(session,p.id) : 'Unknown faction'
}
export function factionLabelForCommander(session:BattleSession,id:string) {
 const p=session.setup.players.find(p=>p.id===id)
 return p?.faction ?? session.setup.armies[p?.armyId ?? '']?.faction ?? 'Unknown faction'
}
const quantity=(n:number,pl:boolean)=>pl?`${n} ${n===1?'model':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'modele':'modeli'}`:`${n} ${n===1?'model':'models'}`
const amount=(n:number)=>String(Math.round(n*10)/10)
/** Deterministic public-fact narration. No notes, account labels or hidden card state. */
export function warDocument(record:ArchiveRecord,style:ChronicleStyle,locale:Locale,campaign?:ChronicleCampaignContext):WarDocument {
 const {session,report,reliable,endedAt,format}=archiveFacts(record),pl=locale==='pl'
 const sides=report.ranking.map(r=>({id:r.playerId,faction:factionLabel(session,r.playerId),vp:r.vp}))
 const scoreLine=sides.map(s=>`${s.faction}: ${s.vp} VP`).join(' / ')
 const paragraphs:string[]=[],highlights:string[]=[]
 if(style==='campaign-chronicle'&&campaign) paragraphs.push(pl?`Kampania „${campaign.name}”. Rozdział o ${campaign.location}.`:`Campaign “${campaign.name}”. The battle for ${campaign.location}.`)
 paragraphs.push(style==='tactical'?(pl?`Raport operacyjny. ${format}. Zapisano rund: ${report.roundsPlayed}. ${scoreLine}.`:`Operational report. ${format}. Recorded rounds: ${report.roundsPlayed}. ${scoreLine}.`):(pl?`${sides.map(s=>s.faction).join(' przeciw ')}. Kronika zachowuje to, co zostało zapisane. Wynik: ${scoreLine}.`:`${sides.map(s=>s.faction).join(' against ')}. This chronicle preserves what was recorded. Result: ${scoreLine}.`))
 if(!reliable) {
  paragraphs.push(pl?'Zachowano historyczny stan bitwy bez kompletnej historii. Wynik i przebieg nie zostały zweryfikowane; nie odtwarzamy brakujących starć.':'This historical snapshot has no complete event history. Its result and course are unverified; missing engagements are not reconstructed.')
 } else {
  for(const e of report.performance.engagements.filter(e=>e.modelsDestroyed>0||e.kills>0||e.loggedWounds>0)) {
   const source=e.attacker?`${e.attacker.name} (${factionLabelForCommander(session,e.attacker.playerId)})`:e.attackerPlayerId?(pl?`nieustalony oddział armii ${factionLabelForCommander(session,e.attackerPlayerId)}`:`an unidentified unit of ${factionLabelForCommander(session,e.attackerPlayerId)}`):(pl?'nieustalone źródło':'an unknown source')
   const target=`${e.target.name} (${factionLabelForCommander(session,e.target.playerId)})`
   const line=pl?`Zarejestrowane starcie: ${source} przeciw oddziałowi ${target}. Straty celu: ${quantity(e.modelsDestroyed,true)} netto; szacowana wartość ${amount(e.enemyPointsDestroyed)} pkt.${e.loggedWounds>0?` Potwierdzone obrażenia: ${e.loggedWounds} Wounds; zapis częściowy.`:''}${e.kills>0?' Oddział został całkowicie wyeliminowany.':''}`:`Recorded engagement: ${source} against ${target}. Target losses: ${quantity(e.modelsDestroyed,false)} net; estimated value ${amount(e.enemyPointsDestroyed)} pts.${e.loggedWounds>0?` Confirmed damage: ${e.loggedWounds} Wounds, partial record.`:''}${e.kills>0?' The unit was fully eliminated.':''}`
   const story=style==='tactical'?line:pl?`W kronice strat pojawia się oddział ${target}. Straty netto: ${quantity(e.modelsDestroyed,true)}. Sprawca wskazany w zapisie: ${source}.${e.loggedWounds>0?` Potwierdzono ${e.loggedWounds} Wounds; to zapis częściowy.`:''}${e.kills>0?' Dla tego oddziału bitwa dobiegła końca. Pełna eliminacja została zapisana.':' Na tym urywa się zapis tego starcia.'}`:`The casualty record names ${target}. ${quantity(e.modelsDestroyed,false)} lost net. Recorded source: ${source}.${e.loggedWounds>0?` Confirmed damage: ${e.loggedWounds} Wounds, partial record.`:''}${e.kills>0?' For this unit, the battle ended here. Full elimination was recorded.':' Here the record of this engagement stops.'}`
   paragraphs.push(story);if(e.kills>0)highlights.push(line)
  }
  const frames=buildBattlefieldReplay(session)
  const moves:string[]=[]
  for(let i=1;i<frames.length;i++) {
   const event=session.state.events.find(e=>e.id===frames[i].eventId)
   if(event?.type!=='UNIT_MAP_CHANGED')continue
   const key=unitMapKey(event.payload.playerId,event.payload.unitId),entry=frames[i].unitTracking?.units[key]
   if(entry?.revision!==event.id||entry.status!=='battlefield')continue
   const previous=frames[i-1].unitTracking?.units[key],p=session.setup.players.find(p=>p.id===event.payload.playerId)
   const name=session.setup.armies[p?.armyId ?? '']?.units.find(u=>u.id===event.payload.unitId)?.name ?? event.payload.unitId
   const line=previous?.status==='reserves'?(pl?`Oddział ${name} (${factionLabelForCommander(session,event.payload.playerId)}) wszedł z rezerw w rundzie ${frames[i].round}.`:`${name} (${factionLabelForCommander(session,event.payload.playerId)}) entered from reserves in round ${frames[i].round}.`):(pl?`Zapisano zmianę pozycji oddziału ${name} w rundzie ${frames[i].round}.`:`A position change for ${name} was recorded in round ${frames[i].round}.`)
   moves.push(line);if(previous?.status==='reserves')highlights.push(line)
  }
  if(moves.length)paragraphs.push(moves.slice(0,8).join(' '))
  else paragraphs.push(pl?'Nie odtwarzamy niezapisanych ruchów. Lokalizacje i drogi podejścia pozostają nieznane.':'Unrecorded movements are not reconstructed. Missing locations and approaches remain unknown.')
  const controlled=Object.values(session.state.objectives).filter(o=>o.controllerPlayerId)
  if(controlled.length)paragraphs.push((pl?'Kontrola celów według końcowego zapisu: ':'Objective control in the final record: ')+controlled.map(o=>`${o.name}: ${factionLabel(session,doublesScorekeeperId(session.setup,o.controllerPlayerId!))}`).join('; ')+'.')
  for(const unit of report.performance.units.filter(u=>!u.survived)) {
   const p=session.setup.players.find(p=>p.id===unit.playerId)
   if(session.setup.armies[p?.armyId ?? '']?.units.find(u=>u.id===unit.unitId)?.isWarlord) highlights.push(pl?`Warlord ${unit.name} (${factionLabelForCommander(session,unit.playerId)}) został wyeliminowany.`:`Warlord ${unit.name} (${factionLabelForCommander(session,unit.playerId)}) was eliminated.`)
  }
  const entries=buildBattleChronicle(session)
  const lastRoundScores=entries.filter(e=>e.round===session.state.round&&e.scoreDelta!==undefined&&e.event.type!=='STATE_CORRECTED')
  if(!entries.some(e=>e.event.type==='STATE_CORRECTED'&&e.event.payload.correction.kind==='SCORE'&&e.category!=='other')&&lastRoundScores.some(e=>Math.abs(e.scoreDelta??0)>=5)) highlights.push(pl?`W ostatniej rozegranej rundzie zarejestrowano zmianę wyniku o co najmniej 5 VP. Końcowy wynik: ${scoreLine}.`:`A score change of at least 5 VP was recorded in the last played round. Final result: ${scoreLine}.`)
  const winners=sides.filter(s=>report.winnerPlayerIds.includes(s.id))
  paragraphs.push(winners.length>1?(pl?`Bitwa zakończyła się remisem: ${winners.map(s=>s.faction).join(' / ')}. ${scoreLine}.`:`The battle ended in a tie: ${winners.map(s=>s.faction).join(' / ')}. ${scoreLine}.`):(pl?`Końcowy zapis przyznaje zwycięstwo stronie ${winners[0]?.faction ?? '—'}. ${scoreLine}.`:`The final record awards victory to ${winners[0]?.faction ?? '—'}. ${scoreLine}.`))
 }
 if(style==='campaign-chronicle'&&campaign)paragraphs.push(campaign.applied?(pl?`Skutek kampanijny dla ${campaign.location}: ${campaign.previous.join(' + ')||'neutralna'} → ${campaign.current.join(' + ')||'neutralna'}.`:`Campaign effect at ${campaign.location}: ${campaign.previous.join(' + ')||'neutral'} → ${campaign.current.join(' + ')||'neutral'}.`):(pl?'Ta bitwa nie powoduje obecnie zmiany kontroli w kampanii.':'This battle currently causes no campaign control transfer.'))
 if(style==='campaign-chronicle'&&campaign?.points?.length)paragraphs.push((pl?'Punkty kampanii: ':'Campaign points: ')+campaign.points.join(' / ')+'.')
 if(style!=='tactical'&&reliable)paragraphs.push(pl?'Na tym kończy się zapis tej bitwy. Pozostają straty, utrzymane pozycje i wynik, którego kronika nie zmienia.':'Here the record of this battle closes. Losses, held positions and the recorded result remain.')
 return {title:sides.map(s=>s.faction).join(' — '),locale,style,date:endedAt,format,reliable,sides,paragraphs,highlights:highlights.slice(0,10),campaign,units:reliable?report.performance.units.map(u=>({name:u.name,faction:factionLabelForCommander(session,u.playerId),damage:u.damageDealt,models:u.modelsDestroyed,kills:u.kills,points:u.enemyPointsDestroyed,actions:u.completedMissionActions,missionVp:u.missionVp,survived:u.survived})):[]}
}
export function freshChronicleDraft(record:ArchiveRecord,style:ChronicleStyle,locale:Locale,campaign?:ChronicleCampaignContext):ChronicleDraft {
 const document=warDocument(record,style,locale,campaign)
 return {campaignId:campaign?.id,version:1,style,locale,title:document.title.slice(0,200),text:document.paragraphs.join('\n\n'),sourceSignature:archiveSourceSignature(record)}
}
export function narrationBrief(document:WarDocument) {
 return JSON.stringify({purpose:'Write a narrative from these recorded facts only. Preserve unit/faction names. Never invent movements, casualties, attackers or locations. Distinguish literary atmosphere from verified events.',language:document.locale,style:document.style,format:document.format,verified:document.reliable,sides:document.sides.map(({faction,vp})=>({faction,vp})),facts:document.paragraphs,recordedUnitContribution:document.units,campaign:document.campaign?{name:document.campaign.name,location:document.campaign.location,applied:document.campaign.applied,previous:document.campaign.previous,current:document.campaign.current,points:document.campaign.points}:undefined},null,2)
}

export function validChronicleDraft(value:unknown):value is ChronicleDraft {
 if(!value||typeof value!=='object')return false
 const d=value as Record<string,unknown>
 return d.version===1&&typeof d.style==='string'&&['tactical','war-chronicle','campaign-chronicle'].includes(d.style)&&typeof d.locale==='string'&&['pl','en'].includes(d.locale)&&typeof d.title==='string'&&d.title.length<=200&&typeof d.text==='string'&&d.text.length<=100000&&typeof d.sourceSignature==='string'
}
