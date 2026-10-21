import { useState } from 'react'
import { Link } from 'react-router-dom'
import { factionThemes,themeStyle } from './themes'
import { FactionSigil } from './FactionSigil'

/** Lightweight QA/reference gallery. This is not a set of official GW marks. */
export default function FactionEmblemGallery(){
 const [query,setQuery]=useState('')
 const matches=factionThemes.filter(theme=>(theme.name+' '+theme.id).toLowerCase().includes(query.trim().toLowerCase()))
 return <main className="page-shell faction-emblem-gallery">
  <Link to="/">← Back to TabletopHelper</Link>
  <h1>Faction emblems</h1>
  <p>Original faction-inspired UI symbols used on unit cards and the scoreboard. They are not official Games Workshop insignia or exact reproductions. Custom model photos can replace them on your own device.</p>
  <label className="faction-emblem-gallery__search">Find a faction
   <input type="search" aria-label="Search emblems" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Custodes, Necrons, Shadowkeepers…"/>
  </label>
  <p role="status">{matches.length} of {factionThemes.length} themes</p>
  <div className="faction-emblem-gallery__grid">
   {matches.map(theme=><article key={theme.id} className="faction-emblem-gallery__card" style={themeStyle(theme)}>
    <div className="faction-emblem-gallery__symbol" role="img" aria-label={'Faction emblem: '+theme.name}><FactionSigil themeId={theme.id}/></div>
    <strong>{theme.name}</strong>
    <small>{theme.id}</small>
   </article>)}
  </div>
 </main>
}
