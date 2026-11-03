import { t as tr } from '../i18n/locale'
import { campaignProjection, type Campaign } from './model'
export function SectorMap({ campaign, selected, onSelect }: { campaign: Campaign; selected: string; onSelect: (id: string) => void }) {
 const state = campaignProjection(campaign)
 const color = (id?: string) => id ? `hsl(${campaign.participants.findIndex(p => p.id === id) * 61 + 35} 65% 65%)` : '#6a8794'
 return <div className="sector-map"><svg viewBox="0 0 1000 650" preserveAspectRatio="none" role="img" aria-label={tr('Campaign sector connections')}>
  <defs><radialGradient id="sector-nebula"><stop stopColor="#28354f" stopOpacity=".7" /><stop offset="1" stopColor="#080f16" /></radialGradient></defs><rect width="1000" height="650" rx="18" fill="url(#sector-nebula)" />
  {Array.from({ length: 65 }, (_, i) => <circle key={i} cx={(i * 151 + 37) % 1000} cy={(i * 83 + 59) % 650} r={i % 3 === 0 ? 1.7 : .8} fill="#b7c8d4" opacity=".45" />)}
  {campaign.locations.flatMap(location => location.links.filter(id => location.id < id).map(id => { const end = campaign.locations.find(l => l.id === id)!; return <line key={`${location.id}:${id}`} x1={location.x * 1000} y1={location.y * 650} x2={end.x * 1000} y2={end.y * 650} stroke="#516877" strokeDasharray="6 9" opacity=".55" /> }))}
 </svg><div className="sector-nodes">{campaign.locations.map(location => <button key={location.id} aria-label={location.name} aria-pressed={selected === location.id} onClick={() => onSelect(location.id)} className={`sector-node${state.unlocked.includes(location.id) ? '' : ' is-locked'}`} style={{ left: `${location.x * 100}%`, top: `${location.y * 100}%`, borderColor: color(state.control[location.id][0]) }}><span className={`sector-symbol sector-symbol--${location.type}`} style={{ color: color(state.control[location.id][0]) }}>{location.type === 'station' ? '◇' : location.type === 'sector' ? '✧' : '●'}</span><strong>{location.name}</strong><small>{state.control[location.id].map(id => campaign.participants.find(p => p.id === id)?.faction).join(' + ') || tr('Neutral')}{!state.unlocked.includes(location.id) ? ` · ${tr('Locked')}` : ''}</small></button>)}</div></div>
}
