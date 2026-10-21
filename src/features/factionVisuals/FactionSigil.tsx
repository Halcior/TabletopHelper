import type { CSSProperties } from 'react'

/**
 * Original interface glyphs; not official Games Workshop symbols.
 * Each icon has a unique silhouette and independent internal detailing.
 * Tiny unit portraits should never crop atmospheric faction backgrounds.
 */
export const factionSigilPaths: Record<string, readonly [string, string]> = {
  'neutral': ['M16 3 28 16 16 29 4 16Z', 'M16 9v14M9 16h14'],
  'adepta-sororitas': ['M7 27V13l9-9 9 9v14Z', 'M16 8v10m-5 4h10M11 26l5-8 5 8M8 14h16'],
  'adeptus-astartes': ['M5 7l11-4 11 4v12L16 29 5 19Z', 'M10 11h12M16 8v15m-6-8 6 8 6-8'],
  'adeptus-custodes': ['M4 25l8-6 4-16 4 16 8 6-12 3Z', 'M16 8v17M9 15l7-4 7 4M10 22h12'],
  'adeptus-mechanicus': ['M16 4 20 7 25 6 26 11 29 16 26 21 25 26 20 25 16 28 12 25 7 26 6 21 3 16 6 11 7 6 12 7Z', 'M16 10a6 6 0 1 0 0 12a6 6 0 0 0 0-12ZM16 10v12M10 16h12'],
  'aeldari': ['M3 18q13-20 26 0q-13 15-26 0Z', 'M16 12a5 5 0 1 0 0 10a5 5 0 0 0 0-10ZM16 3v4M7 7l3 3M25 7l-3 3'],
  'agents-of-the-imperium': ['M16 3 26 9v15l-10 5-10-5V9Z', 'M10 13h12M16 9v11M12 21q4-5 8 0M16 20v5'],
  'astra-militarum': ['M4 28V14l5-5 7 5 7-5 5 5v14Z', 'M9 28v-9h14v9M9 8V4m7 7V3m7 5V4M12 23h8'],
  'black-templars': ['M16 3 21 11 27 13 21 19 18 28h-4l-3-9-6-6 6-2Z', 'M16 7v19M10 16h12M12 24l4 3 4-3'],
  'blood-angels': ['M16 3q9 11 9 17a9 9 0 0 1-18 0q0-6 9-17Z', 'M16 12v13M10 18l6-4 6 4M11 24h10'],
  'chaos-daemons': ['M3 8 10 13 16 3 22 13 29 8 25 23 16 29 7 23Z', 'M9 19q7-10 14 0q-7 7-14 0ZM16 16v6'],
  'chaos-knights': ['M5 28 7 8l6 6 3-11 3 11 6-6 2 20Z', 'M10 20l6-5 6 5M11 24h10M16 15v12'],
  'chaos-space-marines': ['M4 12 12 9 16 3 20 9 28 12 23 19 26 27 16 23 6 27 9 19Z', 'M16 10v15m-7-9h14M11 21l5-4 5 4'],
  'crimson-fists': ['M6 27V16l3-5 4 3 3-5 4 5 4-3 3 5v11Z', 'M10 18v5m5-5v5m5-5v5M8 26h16'],
  'dark-angels': ['M16 3 25 10 28 28H4l3-18Z', 'M16 8v17M12 15l4-4 4 4M9 23h14'],
  'death-guard': ['M8 4h16l3 8-3 16H8L5 12Z', 'M12 11q4-7 8 0M12 19q4 7 8 0M16 13v6M10 24h12'],
  'deathwatch': ['M6 5h20v17L16 29 6 22Z', 'M10 10h12M10 16q6-9 12 0q-6 8-12 0ZM16 13v6'],
  'drukhari': ['M6 4q-6 9 3 14l7 11 7-11q9-5 3-14', 'M10 6q-5 9 6 17q11-8 6-17M16 11v10'],
  'emperors-children': ['M7 4q9 4 18 0l-3 18-6 7-6-7Z', 'M11 12l4 2m6-2-4 2M12 21q4 4 8 0M16 5v5'],
  'genestealer-cults': ['M4 27 8 8l7 5 9-10 4 24Z', 'M10 15l7 8m2-11-5 13M8 21h17'],
  'grey-knights': ['M16 3 27 11v13L16 29 5 24V11Z', 'M16 7v18M10 13h12M11 22l5-5 5 5M9 9l3 2m11-2-3 2'],
  'imperial-fists': ['M4 28V11l7-4 5 4 5-4 7 4v17Z', 'M9 14h14M11 14v14m10-14v14M16 8v18'],
  'imperial-knights': ['M16 2 27 9v13L16 30 5 22V9Z', 'M16 7v19M10 11l6 7 6-7M9 23h14'],
  'iron-hands': ['M5 27V11l5-6 4 7 4-7 4 7 5-4v19Z', 'M10 16h12M12 21h8M16 12v14M8 25h16'],
  'leagues-of-votann': ['M3 25 12 6l4 7 4-7 9 19-13 4Z', 'M9 23h14M12 18l4 7 4-7M16 7v7'],
  'necrons': ['M5 27 10 7l6-4 6 4 5 20Z', 'M10 22h12M12 14l4-5 4 5-4 8Z'],
  'orks': ['M3 8 11 11 16 4 21 11 29 8 26 24 16 29 6 24Z', 'M7 17l7 2m11-2-7 2M11 23l5 4 5-4M16 12v6'],
  'raven-guard': ['M4 10 13 5 16 10 19 5 28 10 22 17 25 25 16 29 7 25 10 17Z', 'M9 12l7 5 7-5M16 17v10M11 21l5 3 5-3'],
  'salamanders': ['M5 27 9 13l7-10 7 10 4 14Z', 'M16 10q7 8 0 16q-7-8 0-16ZM10 24h12'],
  'space-wolves': ['M4 5 12 10 16 3 20 10 28 5 24 24 16 29 8 24Z', 'M9 16l7 5 7-5M12 22l4 6 4-6M16 8v8'],
  'tau-empire': ['M16 4a12 12 0 1 1-.01 0Z', 'M16 4v12l8 7M5 16h11M16 16l-4 11M21 10h3'],
  'thousand-sons': ['M16 3 28 26H4Z', 'M9 20q7-11 14 0q-7 7-14 0ZM16 16v7M16 8v4'],
  'tyranids': ['M3 4q2 15 9 11l4 14 4-14q7 4 9-11', 'M9 8l7 9 7-9M11 20l5 6 5-6'],
  'ultramarines': ['M4 8h24v9l-5 11H9L4 17Z', 'M9 8v12l7 5 7-5V8M12 13h8'],
  'white-scars': ['M5 9q8-8 22-3M3 16q13-7 26-1M7 24q10-6 19-1', 'M10 10l4 4-3 4M17 17l4 4-3 4'],
  'world-eaters': ['M16 3 25 10 23 16 29 22 22 29 16 24 10 29 3 22 9 16 7 10Z', 'M8 11l16 15M24 11 8 26M12 16h8'],
  'custodes-shadowkeepers': ['M6 28V11l10-8 10 8v17Z', 'M10 15h12v10H10ZM16 10v18M12 19h8M16 19v5'],
}

/**
 * Atlas of the 20 faction emblems accepted for visual review. The other
 * catalogue factions retain accessible, deterministic vector fallbacks.
 * Single 400x320 JPEG, twenty 80px cells; no per-card image requests.
 * This is unofficial fan art, not an official Games Workshop logo pack.
 */
export const illustratedEmblemIds = [
  "adeptus-custodes",
  "adeptus-astartes",
  "chaos-space-marines",
  "astra-militarum",
  "necrons",
  "orks",
  "tau-empire",
  "tyranids",
  "aeldari",
  "drukhari",
  "genestealer-cults",
  "leagues-of-votann",
  "adepta-sororitas",
  "black-templars",
  "death-guard",
  "thousand-sons",
  "world-eaters",
  "grey-knights",
  "adeptus-mechanicus",
  "custodes-shadowkeepers"
] as const
export const ILLUSTRATED_EMBLEM_ASSET = '/faction-art/faction-emblems-20.jpg'
export const factionEmblemCells: Readonly<Record<string, number>> = Object.fromEntries(
 illustratedEmblemIds.map((id,index)=>[id,index])
)
export function FactionSigil({themeId,className}:{themeId:string;className?:string}){
 const paths=factionSigilPaths[themeId]??factionSigilPaths.neutral
 const index=factionEmblemCells[themeId]
 const decorated=index!==undefined
 const fallback=<svg className="faction-sigil__vector" viewBox="0 0 32 32" fill="none"
   stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
   <path className="faction-sigil__outline" d={paths[0]}/>
   <path className="faction-sigil__detail" d={paths[1]}/>
 </svg>
 if(!decorated)return <span className={['faction-sigil','faction-sigil--vector',className].filter(Boolean).join(' ')}
   data-faction-symbol={themeId in factionSigilPaths?themeId:'neutral'} aria-hidden="true">{fallback}</span>
 const column=index%5,row=Math.floor(index/5)
 const position:CSSProperties={backgroundPosition:`${column*25}% ${row*(100/3)}%`}
 return <span className={['faction-sigil','faction-sigil--illustrated',className].filter(Boolean).join(' ')}
   data-faction-symbol={themeId} data-emblem-source="sprite" aria-hidden="true">
   {fallback}<span className="faction-sigil__art" style={position}/>
 </span>
}
