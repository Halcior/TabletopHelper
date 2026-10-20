import type { Army } from '../../domain/army/types'
import { factionThemes } from './themes'
import { useVisualPreferences } from './preferences'
export function VisualPreferences({army}:{army?:Army}){
 const {preferences:p,update,error}=useVisualPreferences()
 const theme=army?p.armies[army.id]??p.theme:p.theme
 return <details className="visual-preferences no-print"><summary>Visual Preferences</summary><div className="visual-preferences__grid">
 <label>Appearance<select aria-label="Appearance" value={p.appearance} onChange={e=>update({appearance:e.target.value as typeof p.appearance})}><option value="minimal">Minimal</option><option value="themed">Themed</option><option value="custom">Custom</option></select></label>
 <label>Unit Portraits<select aria-label="Unit Portraits" value={p.portraits} onChange={e=>update({portraits:e.target.value as typeof p.portraits})}><option value="off">Off</option><option value="compact">Compact</option><option value="enhanced">Enhanced</option></select></label>
 <label>Army Banner<select aria-label="Army Banner" value={String(p.banners)} onChange={e=>update({banners:e.target.value==='true'})}><option value="true">On</option><option value="false">Off</option></select></label>
 <label>{army?'Army theme':'Default theme'}<select aria-label={army?'Army theme':'Default theme'} value={theme} onChange={e=>update(army?{armies:{...p.armies,[army.id]:e.target.value}}:{theme:e.target.value})}><option value="auto">Auto-detect faction</option>{factionThemes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 </div><p>Saved on this device. Themed uses faction art; Custom includes your own photos. Minimal hides decoration. Player colours and game rules stay independent.</p>{error&&<p role="alert">{error}</p>}</details>
}
