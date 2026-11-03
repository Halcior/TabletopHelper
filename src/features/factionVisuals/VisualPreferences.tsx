import { t as tr } from '../i18n/locale'
import type { Army } from '../../domain/army/types'
import { factionThemes } from './themes'
import { useVisualPreferences } from './preferences'
export function VisualPreferences({army}:{army?:Army}){
 const {preferences:p,update,error}=useVisualPreferences()
 const theme=army?p.armies[army.id]??p.theme:p.theme
 return <details className="visual-preferences no-print"><summary>{tr("Visual Preferences")}</summary><div className="visual-preferences__grid">
 <label>{tr("Appearance")}<select aria-label={tr("Appearance")} value={p.appearance} onChange={e=>update({appearance:e.target.value as typeof p.appearance})}><option value="minimal">{tr("Minimal")}</option><option value="themed">{tr("Themed")}</option><option value="custom">{tr("Custom")}</option></select></label>
 <label>{tr("Unit Icons")}<select aria-label={tr("Unit Icons")} value={p.portraits} onChange={e=>update({portraits:e.target.value as typeof p.portraits})}><option value="off">{tr("Off")}</option><option value="compact">{tr("Emblem · compact")}</option><option value="enhanced">{tr("Emblem · large")}</option></select></label>
 <label>{tr("Army Banner")}<select aria-label={tr("Army Banner")} value={String(p.banners)} onChange={e=>update({banners:e.target.value==='true'})}><option value="true">{tr("On")}</option><option value="false">{tr("Off")}</option></select></label>
 <label>{army?tr('Army theme'):tr('Default theme')}<select aria-label={army?tr('Army theme'):tr('Default theme')} value={theme} onChange={e=>update(army?{armies:{...p.armies,[army.id]:e.target.value}}:{theme:e.target.value})}><option value="auto">{tr("Auto-detect faction")}</option>{factionThemes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 </div><p>{tr("Saved on this device. Unit cards use original faction emblems instead of cropped banners. Custom shows your saved model photos when available and the emblem otherwise. Themed artwork stays on army banners. Minimal hides decoration. Player colours and game rules stay independent.")}</p>{error&&<p role="alert">{tr(error)}</p>}</details>
}
