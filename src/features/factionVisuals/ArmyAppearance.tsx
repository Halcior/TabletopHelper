import { useEffect,useState } from 'react'
import { Link,useParams,useSearchParams } from 'react-router-dom'
import type { Army,UnitDefinition } from '../../domain/army/types'
import { getArmy,getBattle } from '../../persistence/database'
import { ArmyBanner,UnitPortrait } from './components'
import { VisualPreferences } from './VisualPreferences'
import { mediaKey,usePhoto,savePhoto,removePhoto } from './media'
import { useVisualPreferences } from './preferences'
function PhotoEditor({army,unit}:{army:Army;unit?:UnitDefinition}){
 const custom=usePhoto(mediaKey(army,unit)),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const update=useVisualPreferences(s=>s.update)
 async function change(file?:File){if(!file)return;setBusy(true);setError('');try{await savePhoto(army,file,unit);update({appearance:'custom'})}catch(e){setError(e instanceof Error?e.message:'Photo could not be saved.')}finally{setBusy(false)}}
 async function remove(){setBusy(true);setError('');try{await removePhoto(army,unit)}catch{setError('Photo could not be removed.')}finally{setBusy(false)}}
 return <article className="photo-editor"><div className="photo-editor__identity">{unit?<UnitPortrait army={army} unit={unit}/>:null}<div><h3>{unit?.name??'Army banner'}</h3>{unit&&<small>{unit.points} pts · {unit.startingModels} models</small>}</div></div>{custom&&<img className="photo-editor__preview" src={custom} alt={`Saved custom photo: ${unit?.name??army.name}`} loading="lazy"/>}<label className="photo-upload">{unit?custom?'Change photo':'Add unit photo':'Change army banner'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void change(e.target.files?.[0]);e.target.value=''}}/></label>{custom&&<button disabled={busy} onClick={()=>void remove()}>{unit?'Remove photo':'Reset to faction default'}</button>}{busy&&<p role="status">Saving photo…</p>}{error&&<p role="alert">{error}</p>}</article>
}
export default function ArmyAppearance(){
 const {armyId}=useParams(),[query]=useSearchParams(),battleId=query.get('battleId')
 const [army,setArmy]=useState<Army>(),[error,setError]=useState('')
 const {preferences,update}=useVisualPreferences()
 useEffect(()=>{let active=true;setArmy(undefined);setError('');void(async()=>{try{const saved=armyId?await getArmy(armyId):undefined;const battle=!saved&&battleId?await getBattle(battleId):undefined;const found=saved??(armyId?battle?.setup.armies[armyId]:undefined);if(active){setArmy(found);if(!found)setError('Army not found on this device.')}}catch{if(active)setError('Saved army could not be loaded.')}})();return()=>{active=false}},[armyId,battleId])
 return <div className="page-shell appearance-page"><Link to={battleId?`/battle/${encodeURIComponent(battleId)}`:'/'}>← {battleId?'Back to battle':'Army Library'}</Link><h1>Appearance & photos</h1><p><Link to="/faction-icons">Browse faction emblems</Link></p><p>Photos stay private on this device. They are not uploaded, shared with opponents or included in JSON exports. JPEG, PNG or WebP, up to 12 MB and 40 megapixels; compressed before saving.</p>{error?<p role="alert">{error}</p>:!army?<p role="status">Loading army…</p>:<><ArmyBanner army={army}/><VisualPreferences army={army}/><button onClick={()=>update({armies:{...preferences.armies,[army.id]:'auto'}})}>Reset army theme</button><PhotoEditor army={army}/><div className="photo-editor-grid">{army.units.map(unit=><PhotoEditor key={unit.id} army={army} unit={unit}/>)}</div></>}</div>
}
