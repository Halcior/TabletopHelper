import { useMemo, useState } from 'react'
import { buildBattleChronicle, type ChronicleCategory } from '../../domain/battle/chronicle'
import { buildScoringAudit } from '../../domain/battle/scoringAudit'
import type { BattleSession } from '../../domain/battle/types'
import { AppIcon, type AppIconName } from '../AppIcon'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import { importantChronicleEntry, leadChangeEventIds } from './reportPresentation'

type Filter = 'highlights' | 'full' | 'kills' | 'objectives' | 'vp'
const ICONS: Record<ChronicleCategory, AppIconName> = { kills: 'eliminate', combat: 'target', objectives: 'objectives', vp: 'host', actions: 'mission', stratagems: 'cards', flow: 'next', other: 'log' }
const TITLES: Record<ChronicleCategory, string> = { kills: 'Casualty recorded', combat: 'Combat update', objectives: 'Objective control', vp: 'Score recorded', actions: 'Mission action', stratagems: 'Archived tactic', flow: 'Battle progression', other: 'Table update' }

export function BattleLog({ session }: { session: BattleSession }) {
  const [filter, setFilter] = useState<Filter>('highlights')
  const [playerId, setPlayerId] = useState('all')
  const [round, setRound] = useState('all')
  const [limit, setLimit] = useState(80)
  const entries = useMemo(() => buildBattleChronicle(session), [session])
  const scoring = useMemo(() => buildScoringAudit(session), [session])
  const leadChanges = useMemo(() => leadChangeEventIds(buildBattlefieldReplay(session)), [session])
  const matching = entries.filter((entry) => (filter === 'full' || (filter === 'highlights' ? entry.highlight : entry.category === filter))
    && (playerId === 'all' || entry.playerIds.includes(playerId)) && (round === 'all' || entry.round === Number(round))).reverse()
  const visible = matching.slice(0, limit)
  return <section className="panel log-panel chronicle-panel">
    <div className="section-heading"><div><span className="eyebrow">From recorded events</span><h2>Battle Chronicle</h2></div><small>{matching.length} events</small></div>
    <div className="chronicle-filters" role="group" aria-label="Chronicle filters">{([['highlights', 'Highlights'], ['full', 'Full History'], ['kills', 'Kills'], ['objectives', 'Objectives'], ['vp', 'VP']] as const).map(([value, title]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(80) }}>{title}</button>)}</div>
    <div className="report-filters"><label><span>Chronicle player</span><select value={playerId} onChange={(event) => { setPlayerId(event.target.value); setLimit(80) }}><option value="all">All players</option>{session.setup.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label><span>Battle Round</span><select value={round} onChange={(event) => { setRound(event.target.value); setLimit(80) }}><option value="all">All rounds</option>{[...new Set(entries.map((entry) => entry.round))].map((value) => <option key={value} value={value}>Round {value}</option>)}</select></label></div>
    <details className="scoring-audit" open={session.state.status !== 'active'}><summary>Scoring audit <span>{scoring.length} entries</span></summary>{scoring.length === 0 ? <p>No scoring has been recorded yet.</p> : <ol>{[...scoring].reverse().map((entry) => <li key={entry.id}><span><strong>{session.state.players[entry.playerId]?.name ?? entry.playerId}</strong><small>Round {entry.round} · {entry.category} · {entry.label}</small></span><strong>{entry.setTo !== undefined ? `set ${entry.setTo}` : `${(entry.points ?? 0) >= 0 ? '+' : ''}${entry.points}`} VP</strong></li>)}</ol>}</details>
    <ol className="chronicle-timeline">{visible.map((entry, index) => <li key={entry.id} className={`chronicle-entry chronicle-entry--${entry.category}${importantChronicleEntry(entry, leadChanges) ? ' chronicle-entry--important' : ' chronicle-entry--quiet'}`}>
      {(index === 0 || visible[index - 1].round !== entry.round) && <h3 className="chronicle-round">Battle Round {entry.round}</h3>}
      <div className="chronicle-entry__body"><span className="chronicle-entry__icon"><AppIcon name={ICONS[entry.category]} /></span><div><div className="chronicle-entry__meta"><span>R{entry.round} · {entry.phase.replace('_', ' ')}</span><time dateTime={entry.event.timestamp}>{new Date(entry.event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><strong className="chronicle-entry__title">{TITLES[entry.category]}</strong><p>{entry.description}</p>{entry.note && <p className="chronicle-entry__note">{entry.note}</p>}<details><summary>Event details</summary><small>{entry.event.type} · {entry.playerIds.map((id) => session.state.players[id]?.name ?? id).join(' / ') || 'Battle'}</small><code>{entry.id}</code></details></div></div>
    </li>)}</ol>
    {matching.length === 0 && <p className="context-note">No recorded events match these filters.</p>}
    {matching.length > limit && <button className="chronicle-load" onClick={() => setLimit((current) => current + 80)}>Show 80 more events</button>}
  </section>
}
