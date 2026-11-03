import { t as tr } from '../i18n/locale'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { factionThemes,themeStyle } from './themes'
import { FactionSigil } from './FactionSigil'

/** Real application gallery for generated faction illustrations and fallback glyphs. */
export default function FactionEmblemGallery(){
 const [query,setQuery]=useState('')
 const matches=factionThemes.filter(theme=>(theme.name+' '+theme.id).toLowerCase().includes(query.trim().toLowerCase()))
 return <main className="page-shell faction-emblem-gallery">
  <Link to="/">{tr("← Back to TabletopHelper")}</Link>
  <h1>{tr("Faction emblems")}</h1>
  <p>{tr("Twenty detailed, faction-themed illustrated emblems from the approved reference sheet; remaining factions use simpler vector placeholders until their artwork is replaced. Unofficial fan artwork — not Games Workshop logos. Custom unit photos remain local to your device.")}</p>
  <label className="faction-emblem-gallery__search">{tr("Find a faction ")}<input type="search" aria-label={tr("Search emblems")} value={query} onChange={event=>setQuery(event.target.value)} placeholder={tr("Custodes, Necrons, Shadowkeepers…")}/>
  </label>
  <p role="status">{matches.length} {tr(" of ")}{factionThemes.length} {tr(" themes")}</p>
  <div className="faction-emblem-gallery__grid">
   {matches.map(theme=><article key={theme.id} className="faction-emblem-gallery__card" style={themeStyle(theme)}>
    <div className="faction-emblem-gallery__symbol" role="img" aria-label={'Faction emblem: '+theme.name}><FactionSigil themeId={theme.id}/></div>
    <strong>{theme.name}</strong>
    <small>{theme.id}</small><small>{theme.id==='neutral'?tr('Neutral fallback'):theme.id==='custodes-shadowkeepers'||['adeptus-custodes','adeptus-astartes','chaos-space-marines','astra-militarum','necrons','orks','tau-empire','tyranids','aeldari','drukhari','genestealer-cults','leagues-of-votann','adepta-sororitas','black-templars','death-guard','thousand-sons','world-eaters','grey-knights','adeptus-mechanicus'].includes(theme.id)?tr('Illustrated emblem'):tr('Vector placeholder')}</small>
   </article>)}
  </div>
 </main>
}
