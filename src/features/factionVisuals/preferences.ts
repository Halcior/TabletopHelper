import { create } from 'zustand'
import type { Army } from '../../domain/army/types'
import { detectTheme, factionThemes, neutralTheme, themeById } from './themes'
export type VisualPreferences = { appearance:'minimal'|'themed'|'custom'; portraits:'off'|'compact'|'enhanced'; banners:boolean; theme:string; armies:Record<string,string> }
export const PREFERENCES_KEY='tabletop-visual-preferences-v1'
export const defaults:VisualPreferences={appearance:'themed',portraits:'compact',banners:true,theme:'auto',armies:{}}
const validTheme=(v:unknown):v is string=>typeof v==='string' && (v==='auto' || factionThemes.some(t=>t.id===v))
export function validatePreferences(value:unknown):VisualPreferences {
  const v=(value && typeof value==='object' ? value : {}) as Partial<VisualPreferences>
  return { appearance:['minimal','themed','custom'].includes(v.appearance ?? '')?v.appearance!:defaults.appearance,
    portraits:['off','compact','enhanced'].includes(v.portraits ?? '')?v.portraits!:defaults.portraits,
    banners:typeof v.banners==='boolean'?v.banners:true, theme:validTheme(v.theme)?v.theme:'auto',
    armies:Object.fromEntries(Object.entries(v.armies && typeof v.armies==='object'?v.armies:{}).filter(([,v])=>validTheme(v))) }
}
function read():VisualPreferences { try { return validatePreferences(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}')) } catch { return {...defaults,armies:{}} } }
export const useVisualPreferences=create<{ preferences:VisualPreferences; error:string|null; update:(patch:Partial<VisualPreferences>)=>void }>((set,get)=>({
  preferences:read(),error:null,update:(patch)=>{const preferences=validatePreferences({...get().preferences,...patch});let error=null;try{localStorage.setItem(PREFERENCES_KEY,JSON.stringify(preferences))}catch{error='Visual preferences could not be saved on this device.'}set({preferences,error})},
}))
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===PREFERENCES_KEY || event.key===null)useVisualPreferences.setState({preferences:read()})})
export function resolveTheme(army:Army|undefined,p:VisualPreferences) { if(p.appearance==='minimal')return neutralTheme;const id=(army?p.armies[army.id]:undefined)??p.theme;return id==='auto'?detectTheme(army?.faction):themeById(id) }
export function useFactionTheme(army?:Army){const preferences=useVisualPreferences(s=>s.preferences);return resolveTheme(army,preferences)}
