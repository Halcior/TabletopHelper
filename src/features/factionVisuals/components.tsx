import { useState } from 'react'
import type { Army,UnitDefinition } from '../../domain/army/types'
import type { BattleSession } from '../../domain/battle/types'
import type { ChronicleEntry } from '../../domain/battle/chronicle'
import { doublesForceForPlayer } from '../../domain/battle/doubles'
import { armyForPlayer,themeStyle,unitRole,factionArtUrl,factionArtSrcSet } from './themes'
import { useFactionTheme,useVisualPreferences } from './preferences'
import { mediaKey,usePhoto } from './media'
import { FactionSigil } from './FactionSigil'

const rolePaths:Record<string,string>={Character:'M12 3 9 9 3 10 7 15 6 21 12 18 18 21 17 15 21 10 15 9Z',Infantry:'M7 20V11l5-4 5 4v9M9 4h6M8 15h8',Terminator:'M5 8 12 3 19 8v11H5ZM9 11h6M9 15h6',Mounted:'M4 20 7 9 16 4 20 9 15 12 18 20M7 14h8',Cavalry:'M4 20 7 9 16 4 20 9 15 12 18 20M7 14h8',Vehicle:'M3 10h18v9H3ZM8 10V6h8v4M6 21v-2M18 21v-2',Monster:'M3 4 8 9 12 3 16 9 21 4 19 18 12 22 5 18Z',Walker:'M6 4h12v9H6ZM8 13 4 21M16 13 20 21M9 8h6',Aircraft:'M12 2 15 10 22 15 14 14 15 21 12 19 9 21 10 14 2 15 9 10Z',Unit:'M12 3 21 12 12 21 3 12Z'}
export function RoleIcon({role='Unit'}:{role?:string}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label={`${role} icon`} role="img"><path d={rolePaths[role]??rolePaths.Unit}/></svg>}
export function FactionMark({army}:{army?:Army}){const t=useFactionTheme(army);const minimal=useVisualPreferences(s=>s.preferences.appearance==='minimal');if(minimal)return null;return <span className="faction-mark" style={themeStyle(t)} title={`${t.name} theme`} role="img" aria-label={`${t.name} theme`}><FactionSigil themeId={t.id}/></span>}
function FallbackImage({custom,thematic,srcSet,alt,role='Unit'}:{custom?:string;thematic?:string;srcSet?:string;alt:string;role?:string}){
 const [failed,setFailed]=useState<string[]>([])
 const src=[custom,thematic].find((s):s is string=>!!s&&!failed.includes(s))
 return src?<img src={src} srcSet={src===thematic?srcSet:undefined} sizes={srcSet?'(max-width: 700px) 100vw, 640px':undefined} alt={src===custom?`Custom photo: ${alt}`:`Thematic environment for ${alt}; not a unit illustration`} loading="lazy" decoding="async" onError={()=>setFailed(v=>[...v,src])}/>:<RoleIcon role={role}/>
}
function UnitImage({custom,themeId,alt}:{custom?:string;themeId:string;alt:string}){
 const [failed,setFailed]=useState(false)
 if(custom&&!failed)return <img src={custom} alt={"Custom photo: "+alt} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>
 return <FactionSigil themeId={themeId}/>
}
export function UnitPortrait({army,unit}:{army:Army;unit:UnitDefinition}){
 const p=useVisualPreferences(s=>s.preferences),t=useFactionTheme(army)
 const enabled=p.appearance!=='minimal'&&p.portraits!=='off'
 const custom=usePhoto(enabled&&p.appearance==='custom'?mediaKey(army,unit):undefined)
 if(!enabled)return null
 return <span className={'unit-portrait unit-portrait--'+p.portraits} style={themeStyle(t)} role="img" aria-label={custom?'Custom unit photo or faction emblem: '+unit.name:'Faction emblem: '+t.name}>
  <UnitImage key={mediaKey(army,unit)+custom+t.id} custom={custom} themeId={t.id} alt={unit.name}/>
 </span>
}
export function ArmyBanner({army,label}:{army:Army;label?:string}){
 const p=useVisualPreferences(s=>s.preferences),t=useFactionTheme(army)
 const enabled=p.appearance!=='minimal'&&p.banners
 const custom=usePhoto(enabled&&p.appearance==='custom'?mediaKey(army):undefined)
 if(!enabled)return null
 return <div className="army-banner" style={themeStyle(t)}><div className="army-banner__art" aria-hidden="true"><FallbackImage key={mediaKey(army)+custom+t.id} custom={custom} thematic={factionArtUrl(t)} srcSet={factionArtSrcSet(t)} alt={t.name}/></div><div className="army-banner__copy"><span className="eyebrow">{label??'Army identity'}</span><strong>{army.faction}</strong><span>{army.name}</span><small>{army.totalPoints} pts · {army.units.length} units{t.id!=='neutral'&&t.name!==army.faction?` · ${t.name} theme`:''}</small></div></div>
}
export function PlayerFactionMarks({session,playerId}:{session:BattleSession;playerId:string}){const ids=doublesForceForPlayer(session.setup,playerId)?.memberPlayerIds??[playerId];return <span className="faction-marks">{ids.map(id=><FactionMark key={id} army={armyForPlayer(session,id)}/>)}</span>}
export function PlayerArmyBanner({session,playerId}:{session:BattleSession;playerId:string}){const ids=doublesForceForPlayer(session.setup,playerId)?.memberPlayerIds??[playerId];return <>{ids.map(id=>{const army=armyForPlayer(session,id);return army?<ArmyBanner key={id} army={army} label={session.state.players[id]?.name}/>:null})}</>}
export function PlayerUnitPortrait({session,playerId,unitId}:{session:BattleSession;playerId:string;unitId:string}){const army=armyForPlayer(session,playerId),unit=army?.units.find(u=>u.id===unitId);return army&&unit?<UnitPortrait army={army} unit={unit}/>:null}
export function ChronicleIdentity({session,entry}:{session:BattleSession;entry:ChronicleEntry}){const target=entry.unitChange?.target;if(target)return <PlayerUnitPortrait session={session} playerId={target.playerId} unitId={target.unitId}/>;const id=entry.scorePlayerId??entry.objectiveControllerPlayerId;return id?<PlayerFactionMarks session={session} playerId={id}/>:null}
