import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import { Link, useParams } from 'react-router-dom'
import { t as tr } from '../features/i18n/locale'
import { useRosterScope } from '../features/armyLibrary/scope'
import { archiveFacts, aggregateUnits, playerResults, playerStatistics, rivalryResults, setParticipant, type ArchiveRecord, type BattleFormat } from '../features/battleLegacy/archive'
import { importDeviceArchive, listArchive, prepareArchive, resolveArchiveConflict, saveArchiveMetadata, syncArchive } from '../features/battleLegacy/repository'
import { BattleReport } from '../components/battle/BattleReport'
import { BattleLog } from '../components/battle/BattleLog'
import { BattlefieldBoard } from '../components/battle/BattlefieldBoard'
import { social, errorText, type Friend } from '../features/social/api'
import '../features/battleLegacy/legacy.css'

export default function BattleArchive() {
  const account = useRosterScope(s => s.userId)
  const owner = account ?? 'guest'
  const self = account ?? 'local:self'
  const { archiveId } = useParams()
  const [records, setRecords] = useState<ArchiveRecord[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [section, setSection] = useState<'archive' | 'statistics' | 'rivalries'>('archive')
  const [format, setFormat] = useState<BattleFormat>('1v1')
  const [identity, setIdentity] = useState(self)
  const [opponent, setOpponent] = useState('')
  const [view, setView] = useState<'report' | 'chronicle' | 'replay'>('report')
  useEffect(() => {
    setRecords([]); setError(''); setIdentity(self)
    void prepareArchive(owner).catch(e => setError(errorText(e)))
    const sub = liveQuery(() => listArchive(owner)).subscribe({ next: setRecords, error: e => setError(errorText(e)) })
    return () => sub.unsubscribe()
  }, [owner])
  useEffect(() => {
    setFriends([])
    let active = true
    if (account) void social<Friend[]>(account, 'friends').then(rows => { if (active) setFriends(rows.filter(row => row.status === 'accepted')) }).catch(() => {})
    return () => { active = false }
  }, [account])
  async function act(action: () => Promise<unknown>) { setBusy(true); setError(''); try { await action() } catch (e) { setError(errorText(e)) } finally { setBusy(false) } }
  const selected = records.find(record => record.id === archiveId)
  const identities = useMemo(() => new Map([[self, tr('Me')], ...friends.map(f => [f.user_id, f.display_name] as [string, string]), ...records.flatMap(row => Object.values(row.identities).map(i => [i.id, i.label] as [string, string]))]), [records, friends, self])
  const results = useMemo(() => playerResults(records, identity, format), [records, identity, format])
  const rivalry = useMemo(() => rivalryResults(records, identity, opponent, format), [records, identity, opponent, format])
  const rows = section === 'rivalries' ? rivalry : results
  const stats = playerStatistics(rows)
  const units = aggregateUnits(rows)
  const number = (value: number | null) => value === null ? '—' : value.toFixed(1)
  const resultTable = (items: typeof results) => <div className="legacy-table"><table><thead><tr><th>{tr('Date')}</th><th>{tr('Result')}</th><th>VP</th><th>{tr('VP difference')}</th><th>{tr('Faction')}</th></tr></thead><tbody>{items.map(row => <tr key={row.record.id}><td><Link to={`/archive/${encodeURIComponent(row.record.id)}`}>{new Date(row.date).toLocaleDateString()}</Link></td><td>{tr(row.result)}</td><td>{row.vp}</td><td>{row.margin}</td><td>{row.faction}</td></tr>)}</tbody></table></div>
  return <main className="page-shell legacy-page">
    <header className="panel legacy-hero"><span className="eyebrow">Battle Legacy</span><h1>{tr('Battle Archive')}</h1><p>{tr('Recorded battles. Lasting rivalries.')}</p><div className="legacy-actions">{account && <button disabled={busy} onClick={() => void act(() => importDeviceArchive(owner))}>{tr('Import device archive into this account')}</button>}{account && <button disabled={busy} onClick={() => void act(() => syncArchive(owner))}>{tr('Sync private archive')}</button>}</div><small>{tr('Private to this account; guests keep their archive on this device. Sync is explicit.')}</small></header>
    {error && <p role="alert">{tr(error)}</p>}
    {records.filter(record => record.cloudConflict).map(record => <section className="panel" key={record.id}><h2>{tr('Archive sync conflict')}</h2><p>{record.session.setup.players.map(p => p.name).join(' · ')}</p><p>{tr('Local identities')}: {Object.values(record.identities).map(i => i.label).join(' / ') || '—'} · {tr(record.withdrawn ? 'Withdrawn' : 'Completed')}</p><p>{tr('Cloud identities')}: {Object.values(record.cloudConflict!.record.identities).map(i => i.label).join(' / ') || '—'} · {tr(record.cloudConflict!.record.withdrawn ? 'Withdrawn' : 'Completed')}</p><div className="legacy-actions"><button disabled={busy} onClick={() => void act(() => resolveArchiveConflict(owner, record.id, 'cloud'))}>{tr('Use cloud version')}</button><button disabled={busy} onClick={() => void act(() => resolveArchiveConflict(owner, record.id, 'local'))}>{tr('Keep local version for next sync')}</button></div></section>)}
    {selected ? <>
      <Link to="/archive">← {tr('All battles')}</Link>
      <section className="panel"><h2>{tr('Participants')}</h2><p>{tr('Link identities explicitly to include a battle in statistics. Names alone never identify a person.')}</p>
        {selected.session.setup.players.map(player => <div key={player.id} className="legacy-participant"><strong>{player.name}</strong><select aria-label={`${tr('Identity')} · ${player.name}`} value={selected.identities[player.id]?.id ?? ''} disabled={busy} onChange={event => void act(() => saveArchiveMetadata(setParticipant(selected, player.id, event.target.value, identities.get(event.target.value) ?? event.target.value)))}><option value="">{tr('Unlinked')}</option>{[...identities].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select><form onSubmit={event => { event.preventDefault(); const input = new FormData(event.currentTarget).get('label')?.toString().trim() ?? ''; if (input) void act(() => saveArchiveMetadata(setParticipant(selected, player.id, `local:${input.toLocaleLowerCase()}`, input))) }}><input name="label" maxLength={100} aria-label={`${tr('Local identity')} · ${player.name}`} placeholder={tr('Local identity')} /><button disabled={busy}>{tr('Link')}</button></form></div>)}
      </section>
      {!archiveFacts(selected).reliable && <p className="context-note">{tr('Incomplete historical data. This battle is excluded from statistics.')}</p>}
      <nav className="legacy-actions" aria-label={tr('Archived battle view')}>{(['report', 'chronicle', 'replay'] as const).map(value => <button key={value} aria-pressed={view === value} onClick={() => setView(value)}>{tr(value === 'report' ? 'Battle Report' : value === 'chronicle' ? 'Chronicle' : 'Tactical Replay')}</button>)}</nav>
      {view === 'report' && <BattleReport session={archiveFacts(selected).session} />}
      {view === 'chronicle' && <BattleLog session={archiveFacts(selected).session} onShowMap={() => setView('replay')} />}
      {view === 'replay' && <BattlefieldBoard key={selected.id} session={archiveFacts(selected).session} dispatch={() => {}} tactical />}
    </> : archiveId ? <p role="status">{tr('Battle not found in this account archive.')}</p> : <>
      <nav className="legacy-actions" aria-label={tr('Archive navigation')}>{(['archive', 'statistics', 'rivalries'] as const).map(value => <button key={value} aria-pressed={section === value} onClick={() => setSection(value)}>{tr(value === 'archive' ? 'Battles' : value === 'statistics' ? 'Player Statistics' : 'Rivalries — Head to Head')}</button>)}</nav>
      {section === 'archive' ? <div className="legacy-grid">{records.length === 0 && <p>{tr('No completed battles in this archive yet.')}</p>}{records.map(record => {
        const facts = archiveFacts(record)
        return <article key={record.id} className="panel legacy-card"><span className="eyebrow">{facts.format} · {new Date(facts.endedAt).toLocaleDateString()}</span><h2>{record.session.setup.players.map(p => p.name).join(' · ')}</h2><p>{facts.report.ranking.map(row => `${row.faction}: ${row.vp} VP`).join(' / ')}</p><strong>{tr(facts.report.winnerPlayerIds.length > 1 ? 'Draw' : 'Winner')}: {facts.report.ranking.filter(r => facts.report.winnerPlayerIds.includes(r.playerId)).map(r => r.name).join(' / ') || '—'}</strong><small>{tr('Rounds')}: {facts.report.roundsPlayed} · {facts.durationMs === null ? tr('Duration unknown') : `${Math.round(facts.durationMs / 60000)} min`}</small>{!facts.reliable && <small>{tr('Incomplete historical data')}</small>}<Link className="button" to={`/archive/${encodeURIComponent(record.id)}`}>{tr('Open battle')}</Link></article>
      })}</div> : <>
        <div className="legacy-actions"><label>{tr('Format')}<select aria-label={tr('Format')} value={format} onChange={e => setFormat(e.target.value as BattleFormat)}>{(['1v1', 'FFA', '2v2'] as const).map(f => <option key={f}>{f}</option>)}</select></label><label>{tr('Player')}<select aria-label={tr('Player')} value={identity} onChange={e => setIdentity(e.target.value)}>{[...identities].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{section === 'rivalries' && <label>{tr('Opponent')}<select aria-label={tr('Opponent')} value={opponent} onChange={e => setOpponent(e.target.value)}><option value="">{tr('Choose opponent')}</option>{[...identities].filter(([id]) => id !== identity).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}</div>
        {format === 'FFA' && <p>{tr('FFA results describe the whole battle. A higher VP than one opponent is not a head-to-head victory. Margin is measured against the best opposing score.')}</p>}
        <div className="legacy-grid legacy-kpis">{[[tr('Battles'), stats.count], [tr('Wins / losses / draws'), `${stats.wins} / ${stats.losses} / ${stats.draws}`], [tr('Win rate'), stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`], [tr('Average VP'), number(stats.averageVp)], [tr('Average VP difference'), number(stats.averageMargin)]].map(([name, value]) => <article className="panel" key={name}><small>{name}</small><strong>{value}</strong></article>)}</div>
        <section className="panel"><h2>{tr(section === 'rivalries' ? 'Last five shared battles' : 'Results over time')}</h2>{resultTable(section === 'rivalries' ? rows.slice(0, 5) : rows)}{section === 'rivalries' && rows.length > 0 && <div>{tr('Closest battle')}: {resultTable([...rows].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin)).slice(0, 1))}{tr('Largest victory')}: {resultTable(rows.filter(row => row.result === 'win').sort((a, b) => b.margin - a.margin).slice(0, 1))}</div>}</section>
        <section className="panel"><h2>{tr('Faction & Army Performance')}</h2>{[...stats.factions, ...stats.armies].map((row, i) => <p key={`${row.name}:${i}`}><strong>{row.name}</strong> · {row.battles} {tr('battles')} · {row.wins} {tr('wins')} · {number(row.averageVp)} VP</p>)}</section>
        <section className="panel"><h2>{tr('Recorded unit contribution')}</h2><p>{tr('Damage is partial; — means unknown. Points are estimated net losses. Survival uses recorded final state. Repeated units count as separate deployments.')}</p><div className="legacy-table"><table><thead><tr>{['Unit', 'Faction', 'Confirmed damage', 'Models destroyed', 'Unit eliminations', 'Estimated points destroyed', 'Mission actions', 'Mission VP', 'Survival', 'Deaths'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody>{units.map(unit => <tr key={`${unit.faction}:${unit.name}`}><th>{unit.name}</th><td>{unit.faction}</td><td>{unit.damage ?? '—'}</td><td>{unit.models}</td><td>{unit.kills}</td><td>{number(unit.points)}</td><td>{unit.actions}</td><td>{unit.missionVp ?? '—'}</td><td>{Math.round(unit.survived / unit.battles * 100)}%</td><td>{unit.deaths}</td></tr>)}</tbody></table></div></section>
        {section === 'rivalries' && <section className="panel"><h2>{tr('Direct recorded engagements')}</h2>{rivalry.flatMap(row => row.direct.map((e, i) => <p key={`${row.record.id}:${i}`}>{e.attacker?.name ?? tr('Unknown unit')} → {e.target.name}: {e.modelsDestroyed} {tr('models')} · {e.kills} {tr('eliminations')}</p>))}</section>}
      </>}
    </>}
  </main>
}
