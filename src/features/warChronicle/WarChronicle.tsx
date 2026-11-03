import { useMemo, useState } from 'react'
import type { ArchiveRecord } from '../battleLegacy/archive'
import { archiveFacts } from '../battleLegacy/archive'
import { saveArchiveMetadata } from '../battleLegacy/repository'
import { activeCampaignBattles, archiveSourceSignature, campaignProjection, type Campaign } from '../campaigns/model'
import { useLocale, t as tr } from '../i18n/locale'
import { errorText } from '../social/api'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import { freshChronicleDraft, narrationBrief, warDocument, validChronicleDraft, type ChronicleCampaignContext, type ChronicleDraft, type ChronicleStyle } from './model'
import { chroniclePrintHtml, openChroniclePrint } from './print'

const STYLES: Array<[ChronicleStyle,string]>=[['tactical','Tactical Report'],['war-chronicle','War Chronicle'],['campaign-chronicle','Campaign Chronicle']]
export function WarChronicle({record,campaigns}:{record:ArchiveRecord;campaigns:Campaign[]}) {
 const locale=useLocale(s=>s.locale)
 const contexts=useMemo(()=>campaigns.flatMap(c=>{
  const event=activeCampaignBattles(c).find(e=>e.battleId===record.id&&e.sourceSignature===archiveSourceSignature(record))
  if(!event)return[]
  const p=campaignProjection(c),change=p.history.find(h=>h.eventId===event.id),location=c.locations.find(l=>l.id===event.locationId)
  if(!location)return[]
  const factions=(ids:string[])=>ids.map(id=>c.participants.find(p=>p.id===id)?.faction??id)
  const rule=c.rules[event.format]
  return[{id:c.id,name:c.name,location:location.name,applied:!!change&&!p.suppressed.includes(event.id),previous:factions(change?.previous??[]),current:factions(change?.current??[]),points:p.suppressed.includes(event.id)?[]:event.winnerIds.map(id=>`${c.participants.find(p=>p.id===id)?.faction??id}: +${event.outcome==='victory'?rule.winPoints*location.value:rule.drawPoints}`)} satisfies ChronicleCampaignContext]
 }),[record,campaigns])
 const saved=validChronicleDraft(record.chronicleDraft)?record.chronicleDraft:null
 const [draft,setDraft]=useState<ChronicleDraft>(()=>saved??freshChronicleDraft(record,'war-chronicle',locale,contexts[0]))
 const [baseMutationId,setBaseMutationId]=useState(record.mutationId)
 const [previous,setPrevious]=useState<ChronicleDraft|null>(null),[contextId,setContextId]=useState(saved?(saved.campaignId??''):(contexts[0]?.id??''))
 const context=contexts.find(c=>c.id===contextId)
 const document=useMemo(()=>warDocument(record,draft.style,draft.locale,context),[record,draft.style,draft.locale,context])
 const session=useMemo(()=>archiveFacts(record).session,[record])
 const frames=useMemo(()=>buildBattlefieldReplay(session),[session])
 const [selectedFrames,setSelectedFrames]=useState<number[]>(()=>[...new Set([[...frames].reverse().find(f=>f.combat)?.index,frames.at(-1)?.index].filter((n):n is number=>n!==undefined))].slice(-3))
 const [includeMaps,setIncludeMaps]=useState(true),[inkSaver,setInkSaver]=useState(true),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 function regenerate(style=draft.style,nextContext:ChronicleCampaignContext|null=context??null) {setPrevious(draft);setDraft(freshChronicleDraft(record,style,locale,nextContext??undefined));setBaseMutationId(record.mutationId);setStatus('Offline draft generated. Previous draft can be restored.');setError('')}
 async function save(){setBusy(true);setError('');try{if(record.mutationId!==baseMutationId)throw new Error('Archive changed. Regenerate or reopen before saving; your text is retained.');const saved=await saveArchiveMetadata({...record,chronicleDraft:draft});setBaseMutationId(saved.mutationId);setStatus('Private draft saved.')}catch(e){setError(errorText(e))}finally{setBusy(false)}}
 const brief=narrationBrief(document)
 return <section className="panel war-chronicle" aria-label={tr('War Chronicle 2.0')}>
  <div className="section-heading"><div><span className="eyebrow">{tr('Recorded facts · editable narrative · available offline')}</span><h2>War Chronicle 2.0</h2></div></div>
  <p>{tr('The narrator uses recorded net losses, confirmed damage and final scores. Missing movements and unknown attacking units stay unknown. Editorial changes never alter battle history.')}</p>
  {error&&<p role="alert">{tr(error)}</p>}{status&&<p role="status">{tr(status)}</p>}
  {draft.sourceSignature!==archiveSourceSignature(record)&&<p role="alert">{tr('The source result changed. Review this draft or regenerate it before export.')}</p>}
  <div className="legacy-actions">{STYLES.map(([style,label])=><button key={style} aria-pressed={draft.style===style} onClick={()=>regenerate(style)}>{tr(label)}</button>)}<button onClick={()=>regenerate()}>{tr('Generate offline')}</button>{previous&&<button onClick={()=>{setDraft(previous);setContextId(previous.campaignId??'');setPrevious(null)}}>{tr('Restore previous draft')}</button>}</div>
  {contexts.length>0&&<label>{tr('Campaign context')}<select aria-label={tr('Campaign context')} value={contextId} onChange={e=>{setContextId(e.target.value);regenerate(draft.style,contexts.find(c=>c.id===e.target.value)??null)}}><option value="">{tr('No linked campaign')}</option>{contexts.map(c=><option key={c.id} value={c.id}>{c.name} · {c.location}</option>)}</select></label>}
  <small>{tr('Draft language')}: {draft.locale.toUpperCase()}</small><label>{tr('Battle chronicle title')}<input value={draft.title} maxLength={200} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label><label>{tr('Editable chronicle')}<textarea aria-label={tr('Editable chronicle')} className="chronicle-editor" value={draft.text} maxLength={100000} onChange={e=>setDraft(d=>({...d,text:e.target.value}))}/></label>
  <p className="context-note">{tr('Your narrative is editorial text. Recorded highlights and statistics are exported separately so fiction is not presented as verified battle data.')}</p>
  <details><summary>{tr('Recorded facts used by this draft')}</summary>{document.highlights.map((h,i)=><p key={i}>{h}</p>)}<p>{document.sides.map(s=>`${s.faction}: ${s.vp} VP`).join(' / ')}</p></details>
  <details><summary>{tr('PDF settings & recorded snapshots')}</summary><label><input type="checkbox" checked={inkSaver} onChange={e=>setInkSaver(e.target.checked)}/>{tr('Printer-friendly PDF')}</label><label><input type="checkbox" checked={includeMaps} onChange={e=>setIncludeMaps(e.target.checked)}/>{tr('Include recorded battlefield snapshots')}</label>{includeMaps&&<><p>{tr('Choose up to three recorded frames. Unknown unit positions are never drawn.')}</p><div className="legacy-actions"><select aria-label={tr('Add recorded snapshot')} defaultValue="" onChange={e=>{const n=Number(e.target.value);if(e.target.value!==''&&selectedFrames.length<3)setSelectedFrames(v=>[...new Set([...v,n])]);e.target.value=''}}><option value="">{tr('Choose recorded event')}</option>{frames.map(f=><option key={f.index} value={f.index}>R{f.round} · {f.phase} · #{f.index}</option>)}</select></div>{selectedFrames.map(index=><button key={index} onClick={()=>setSelectedFrames(v=>v.filter(n=>n!==index))}>{tr('Remove snapshot')} #{index}</button>)}</>}</details>
  <div className="legacy-actions"><button disabled={busy} onClick={()=>void save()}>{tr('Save private draft')}</button><button className="button--gold" onClick={()=>{try{openChroniclePrint(chroniclePrintHtml(document,draft,session,includeMaps?selectedFrames.map(i=>frames[i]).filter(Boolean):[],inkSaver));setError('')}catch(e){setError(errorText(e))}}}>{tr('Export Chronicle PDF')}</button></div><small>{tr('PDF opens a print preview. Choose Print / Save as PDF in your browser.')}</small>
  <details className="chronicle-ai-brief"><summary>{tr('Optional AI narration brief')}</summary><p>{tr('No external AI service is connected. You can review and copy this factual brief into a service you choose. The app sends nothing automatically. It excludes player identities, private notes, full rosters and hidden cards.')}</p><textarea aria-label={tr('Factual AI brief')} readOnly value={brief}/><button onClick={()=>void(async()=>{try{if(!navigator.clipboard?.writeText)throw new Error('Select and copy the brief below.');await navigator.clipboard.writeText(brief);setStatus('Factual brief copied.')}catch(e){setError(errorText(e))}})()}>{tr('Copy factual AI brief')}</button></details>
 </section>
}
