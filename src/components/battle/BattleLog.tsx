import { ClockStatistics } from '../../features/battleClock/ClockStatistics'
import { ChronicleIdentity } from '../../features/factionVisuals/components'
import { useMemo, useState } from 'react'
import { buildBattleChronicle, type ChronicleCategory } from '../../domain/battle/chronicle'
import { buildScoringAudit } from '../../domain/battle/scoringAudit'
import type { BattleSession } from '../../domain/battle/types'
import { AppIcon, type AppIconName } from '../AppIcon'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import { importantChronicleEntry, leadChangeEventIds } from './reportPresentation'

type Filter = 'highlights' | 'full' | 'combat' | 'kills' | 'objectives' | 'vp'
const ICONS: Record<ChronicleCategory, AppIconName> = { kills: 'eliminate', combat: 'target', objectives: 'objectives', vp: 'host', actions: 'mission', stratagems: 'cards', flow: 'next', other: 'log' }
const TITLES: Record<ChronicleCategory, string> = { kills: 'Casualty recorded', combat: 'Combat update', objectives: 'Objective control', vp: 'Score recorded', actions: 'Mission action', stratagems: 'Archived tactic', flow: 'Battle progression', other: 'Table update' }

// Chronicle styling is derived from recorded events; it never invents damage
// or an elimination simply because an event belongs to the combat category.
function eventKind(entry: ReturnType<typeof buildBattleChronicle>[number]): string {
  const change = entry.unitChange
  if (change && !change.destroyedBefore && change.destroyedAfter) return 'elimination'
  if (change && change.modelsAfter < change.modelsBefore) return 'casualties'
  if (change && (change.woundsHealed || change.modelsAfter > change.modelsBefore)) return 'recovery'
  if (change && change.effectiveWoundsLost && change.effectiveWoundsLost > 0) return 'damage'
  if (entry.category === 'objectives') return 'objective-control'
  if (entry.category === 'vp') return 'scoring'
  return 'standard'
}

function eventTitle(entry: ReturnType<typeof buildBattleChronicle>[number]): string {
  switch (eventKind(entry)) {
    case 'elimination': return 'Unit eliminated'
    case 'casualties': return 'Models lost'
    case 'recovery': return 'Unit recovered'
    case 'damage': return 'Wounds recorded'
    case 'objective-control': return 'Objective control changed'
    case 'scoring': return 'Victory points recorded'
    default: return TITLES[entry.category]
  }
}

function eventIcon(entry: ReturnType<typeof buildBattleChronicle>[number]): AppIconName {
  switch (eventKind(entry)) {
    case 'elimination': case 'casualties': return 'eliminate'
    case 'damage': return 'target'
    case 'recovery': return 'army'
    default: return ICONS[entry.category]
  }
}

export function BattleLog({ session }: { session: BattleSession }) {
  const [filter, setFilter] = useState<Filter>('highlights')
  const [playerId, setPlayerId] = useState('all')
  const [round, setRound] = useState('all')
  const [limit, setLimit] = useState(80)
  const entries = useMemo(() => buildBattleChronicle(session), [session])
  const scoring = useMemo(() => buildScoringAudit(session), [session])
  const leadChanges = useMemo(() => leadChangeEventIds(buildBattlefieldReplay(session)), [session])
  const matching = entries.filter((entry) => (filter === 'full' || (filter === 'highlights' ? entry.highlight : filter === 'combat' ? entry.category === 'combat' || entry.category === 'kills' : entry.category === filter))
    && (playerId === 'all' || entry.playerIds.includes(playerId)) && (round === 'all' || entry.round === Number(round))).reverse()
  const visible = matching.slice(0, limit)
  return <section className="panel log-panel chronicle-panel">
    <div className="section-heading"><div><span className="eyebrow">From recorded events</span><h2>Battle Chronicle</h2></div><small>{matching.length} events</small></div>
    {session.battleClock && <details><summary>Battle Clock · statystyki</summary><ClockStatistics session={session} /></details>}
    <div className="chronicle-filters" role="group" aria-label="Chronicle filters">{([['highlights', 'Highlights'], ['full', 'Full History'], ['combat', 'Combat'], ['kills', 'Kills'], ['objectives', 'Objectives'], ['vp', 'VP']] as const).map(([value, title]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(80) }}>{title}</button>)}</div>
    <div className="report-filters"><label><span>Chronicle player</span><select value={playerId} onChange={(event) => { setPlayerId(event.target.value); setLimit(80) }}><option value="all">All players</option>{session.setup.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label><label><span>Battle Round</span><select value={round} onChange={(event) => { setRound(event.target.value); setLimit(80) }}><option value="all">All rounds</option>{[...new Set(entries.map((entry) => entry.round))].map((value) => <option key={value} value={value}>Round {value}</option>)}</select></label></div>
    <details className="scoring-audit" open={session.state.status !== 'active'}><summary>Scoring audit <span>{scoring.length} entries</span></summary>{scoring.length === 0 ? <p>No scoring has been recorded yet.</p> : <ol>{[...scoring].reverse().map((entry) => <li key={entry.id}><span><strong>{session.state.players[entry.playerId]?.name ?? entry.playerId}</strong><small>Round {entry.round} · {entry.category} · {entry.label}</small></span><strong>{entry.setTo !== undefined ? `set ${entry.setTo}` : `${(entry.points ?? 0) >= 0 ? '+' : ''}${entry.points}`} VP</strong></li>)}</ol>}</details>
    <ol className="chronicle-timeline">{visible.map((entry, index) => <li key={entry.id} className={`chronicle-entry chronicle-entry--${entry.category} chronicle-entry--${eventKind(entry)}${importantChronicleEntry(entry, leadChanges) ? ' chronicle-entry--important' : ' chronicle-entry--quiet'}`}>
      {(index === 0 || visible[index - 1].round !== entry.round) && <h3 className="chronicle-round">Battle Round {entry.round}</h3>}
      <div className="chronicle-entry__body"><span className="chronicle-entry__icon"><AppIcon name={eventIcon(entry)} /></span><div><div className="chronicle-entry__meta"><span>R{entry.round} · {entry.phase.replace('_', ' ')}</span><time dateTime={entry.event.timestamp}>{new Date(entry.event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><ChronicleIdentity session={session} entry={entry} /><strong className="chronicle-entry__title">{eventTitle(entry)}</strong><p>{entry.description}</p>{entry.unitChange && !entry.unitChange.correction && (entry.unitChange.modelsBefore !== entry.unitChange.modelsAfter || Boolean(entry.unitChange.effectiveWoundsLost) || Boolean(entry.unitChange.woundsHealed)) && <div className="chronicle-entry__impact" aria-label="Combat effects">
        {entry.unitChange.modelsBefore > entry.unitChange.modelsAfter && <span>{entry.unitChange.modelsBefore - entry.unitChange.modelsAfter} models lost</span>}
        {entry.unitChange.modelsBefore < entry.unitChange.modelsAfter && <span>{entry.unitChange.modelsAfter - entry.unitChange.modelsBefore} models restored</span>}
        {Boolean(entry.unitChange.effectiveWoundsLost) && <span>{entry.unitChange.effectiveWoundsLost} effective W logged</span>}
        {Boolean(entry.unitChange.woundsHealed) && <span>{entry.unitChange.woundsHealed} W healed</span>}
        {entry.unitChange.destroyedAfter && !entry.unitChange.destroyedBefore && <span>Unit eliminated</span>}
        {entry.unitChange.modelsBefore > entry.unitChange.modelsAfter && <span>Source: {entry.unitChange.attacker ? `${entry.unitChange.attacker.name} · ${session.state.players[entry.unitChange.attacker.playerId]?.name ?? entry.unitChange.attacker.playerId}` : entry.unitChange.attackerPlayerId ? `${session.state.players[entry.unitChange.attackerPlayerId]?.name ?? entry.unitChange.attackerPlayerId} · unit unknown` : 'unknown'}</span>}
      </div>}{entry.note && <p className="chronicle-entry__note">{entry.note}</p>}<details><summary>Event details</summary><small>{entry.event.type} · {entry.playerIds.map((id) => session.state.players[id]?.name ?? id).join(' / ') || 'Battle'}</small><code>{entry.id}</code></details></div></div>
    </li>)}</ol>
    {matching.length === 0 && <p className="context-note">No recorded events match these filters.</p>}
    {matching.length > limit && <button className="chronicle-load" onClick={() => setLimit((current) => current + 80)}>Show 80 more events</button>}
  </section>
}
