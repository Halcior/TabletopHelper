import { PlayerArmyBanner, PlayerUnitPortrait } from '../../features/factionVisuals/components'
import { useMemo, useState, type MouseEvent } from 'react'
import { buildBattleReport, downloadBattleReport, type NarrativeStyle } from '../../domain/battle/battleReport'
import type { BattleSession } from '../../domain/battle/types'
import { buildBattleChronicle } from '../../domain/battle/chronicle'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import { leadChangeEventIds, reportHighlights } from './reportPresentation'
import { ScoreHistoryChart } from './ScoreHistoryChart'
import { RulesSourceBadge } from '../ui/RulesSourceBadge'
import { rulesForSession } from '../../rulesets/rulesSource'

const points = (value: number): string => String(Math.round(value * 10) / 10)

export function BattleReport({ session }: { session: BattleSession }) {
  const [style, setStyle] = useState<NarrativeStyle>('tactical')
  const [playerId, setPlayerId] = useState('all')
  const [sort, setSort] = useState('points')
  const report = useMemo(() => buildBattleReport(session, style), [session, style])
  const frames = useMemo(() => buildBattlefieldReplay(session), [session])
  const highlights = useMemo(() => reportHighlights(buildBattleChronicle(session), leadChangeEventIds(frames)), [session, frames])
  const playerName = (id: string) => session.state.players[id]?.name ?? report.ranking.find((player) => player.playerId === id)?.name ?? id
  const units = report.performance.units.filter((unit) => playerId === 'all' || unit.playerId === playerId).sort((a, b) => (
    sort === 'roi' ? (b.combatRoi ?? -1) - (a.combatRoi ?? -1) : sort === 'actions' ? b.completedMissionActions - a.completedMissionActions
      : sort === 'kills' ? b.kills - a.kills : b.enemyPointsDestroyed - a.enemyPointsDestroyed
  ))
  const maximum = Math.max(1, ...units.map((unit) => unit.enemyPointsDestroyed))
  function openUnit(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setPlayerId('all')
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }))
  }
  return <section className="battle-report" aria-label="Battle Report">
    <header className="panel report-heading">
      <div><span className="eyebrow">{report.status === 'active' ? 'Live preview' : report.status === 'completed' ? 'After-action archive' : 'Retained battle archive'}</span><span className="report-after-action">After-Action Report</span><h2>Battle Report</h2>
        <p>{report.mode}</p><RulesSourceBadge source={rulesForSession(session).source} /><small>Round {report.roundsPlayed} / {report.maxRounds} · {report.status === 'active' ? 'Scores are provisional' : report.status === 'completed' ? 'Final scores' : 'Abandoned · no winner declared'}</small></div>
      <div className="report-export no-print" role="group" aria-label="Export Battle Report">
        <button onClick={() => downloadBattleReport(report, 'markdown')}>Export Markdown</button>
        <button onClick={() => downloadBattleReport(report, 'json')}>Export JSON</button>
        <button onClick={() => window.print()}>Print / PDF</button>
      </div>
    </header>
    <section className="report-ranking" aria-label="Battle overview">
      {report.ranking.map((player) => <article key={player.playerId} className={`panel report-player report-player--${session.setup.turnOrder.indexOf(player.playerId)}`}>
        <span className="eyebrow">{report.status === 'completed' && player.rank === 1 ? report.winnerPlayerIds.length > 1 ? 'Joint winner' : 'Winner' : `#${player.rank}`}</span>
        <PlayerArmyBanner session={session} playerId={player.playerId} /><h3>{player.name}</h3><p>{player.faction}</p><strong>{player.vp}<small> VP</small></strong>
      </article>)}
    </section>
    <section className="panel report-highlights" aria-label="Battle highlights"><span className="eyebrow">From recorded events</span><h3>Battle highlights</h3>{highlights.length > 0 ? <ol>{highlights.map((entry) => <li key={entry.id}><small>Round {entry.round} · {entry.phase.replace('_', ' ')}</small><p>{entry.description}</p></li>)}</ol> : <p>No battle highlights recorded yet.</p>}</section>
    <ScoreHistoryChart session={session} frames={frames} />
    {report.performance.units.some((unit) => unit.enemyPointsDestroyed > 0 || unit.completedMissionActions > 0) && <section className="panel report-top-units"><span className="eyebrow">Recorded contribution · provisional while live</span><h3>Standout units</h3><div>{[...report.performance.units].filter((unit) => unit.enemyPointsDestroyed > 0 || unit.completedMissionActions > 0).sort((a, b) => b.enemyPointsDestroyed - a.enemyPointsDestroyed || b.completedMissionActions - a.completedMissionActions).slice(0, 3).map((unit) => <a key={`${unit.playerId}:${unit.unitId}`} href={`#performance-${unit.playerId}-${unit.unitId}`} onClick={(event) => openUnit(event, `performance-${unit.playerId}-${unit.unitId}`)}><PlayerUnitPortrait session={session} playerId={unit.playerId} unitId={unit.unitId} /><strong>{unit.name}</strong><span>{playerName(unit.playerId)}</span><small>{points(unit.enemyPointsDestroyed)} enemy pts · {unit.completedMissionActions} actions</small></a>)}</div></section>}
    <details className="panel report-missions"><summary>Selected missions</summary><ul>{report.missions.map((mission) => <li key={mission}>{mission}</li>)}</ul></details>
    <section className="panel report-armies"><div className="section-heading"><div><span className="eyebrow">Confirmed contribution</span><h3>Army performance</h3></div></div>
      <div className="report-table-wrap"><table><thead><tr><th>Army</th><th>Enemy pts destroyed</th><th>Own pts lost</th><th>Kills</th><th>Player-only pts</th></tr></thead><tbody>
        {report.performance.armies.map((army) => <tr key={army.playerId}><th>{playerName(army.playerId)}</th><td>{points(army.enemyPointsDestroyed)}</td><td>{points(army.ownPointsLost)}</td><td>{army.kills}</td><td>{points(army.playerOnlyPoints)}</td></tr>)}
      </tbody></table></div>
      <p className="report-data-note">{report.performance.partial ? 'Partial unit attribution' : 'Recorded casualty values assigned'} · {points(report.performance.unattributedPoints)} pts without a player source. Unknown unit sources stay in the army total.</p>
    </section>
    <section className="report-performance" aria-label="Unit performance">
      <div className="section-heading"><div><span className="eyebrow">Combat · Survival · Missions</span><h3>Unit performance</h3></div></div>
      <div className="report-filters no-print">
        <label><span>Performance player</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="all">All players</option>{session.setup.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label><span>Compare units by</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="points">Enemy points destroyed</option><option value="roi">Combat ROI</option><option value="kills">Kills</option><option value="actions">Completed Mission Actions</option></select></label>
      </div>
      <div className="performance-grid">{units.map((unit) => <article id={`performance-${unit.playerId}-${unit.unitId}`} key={`${unit.playerId}:${unit.unitId}`} className={`panel performance-card report-player--${session.setup.turnOrder.indexOf(unit.playerId)}`}>
        <div className="performance-card__heading"><div><span className="eyebrow">{playerName(unit.playerId)}</span><h4>{unit.name}</h4><small>{unit.startingPoints} starting pts</small></div><span className={unit.survived ? 'performance-survived' : 'performance-destroyed'}>{unit.survived ? report.status === 'active' ? 'Alive' : 'Survived' : `Destroyed · R${unit.destructionRound ?? '—'}`}</span></div>
        <div className="performance-kpis"><div><strong>{unit.kills}</strong><span>Kills</span></div><div><strong>{points(unit.enemyPointsDestroyed)}</strong><span>Enemy pts</span></div><div><strong>{unit.combatRoi === null ? '—' : `${Math.round(unit.combatRoi)}%`}</strong><span>Combat ROI</span></div></div>
        <progress aria-label={`${unit.name} enemy points destroyed`} value={unit.enemyPointsDestroyed} max={maximum} />
        <dl className="performance-facts"><div><dt>Enemy models destroyed</dt><dd>{unit.modelsDestroyed}</dd></div><div><dt>Logged damage · partial</dt><dd>{unit.damageDealt === null ? '—' : `${unit.damageDealt} W`}</dd></div><div><dt>Damage received · partial</dt><dd>{unit.damageReceived === null ? '—' : `${unit.damageReceived} W`}</dd></div><div><dt>Wounds healed / models restored</dt><dd>{unit.woundsHealed} W / {unit.modelsRestored}</dd></div><div><dt>Models lost / remaining</dt><dd>{unit.modelsLost} / {unit.remainingModels}</dd></div>{unit.remainingWounds !== undefined && <div><dt>Remaining wounds</dt><dd>{unit.remainingWounds}</dd></div>}<div><dt>Completed Mission Actions</dt><dd>{unit.completedMissionActions}</dd></div><div><dt>Confirmed action VP</dt><dd>{unit.missionVp ?? '—'}</dd></div></dl>
        {unit.destroyedEnemies.length > 0 && <details><summary>Destroyed opponents</summary><ul>{unit.destroyedEnemies.map((enemy) => <li key={`${enemy.playerId}:${enemy.unitId}`}>{enemy.name} · {playerName(enemy.playerId)} · R{enemy.round}</li>)}</ul></details>}
      </article>)}</div>
      {units.length === 0 && <p className="context-note">No roster units available for this battle.</p>}
    </section>
    <section className="panel report-awards"><span className="eyebrow">Explicit rules · shared ties</span><h3>Unit awards</h3>
      {report.performance.awards.length === 0 ? <p>{report.status === 'active' ? 'Awards become available after the battle ends.' : 'Not enough attributed data for awards.'}</p> : report.performance.awards.map((award) => <article key={award.title}><strong>{award.title}</strong><p>{award.winners.map((unit) => `${unit.name} (${playerName(unit.playerId)})`).join(' · ')}</p><small>{award.rule}</small></article>)}
    </section>
    <section className="panel report-narrative"><div className="section-heading"><div><span className="eyebrow">From recorded events · available offline</span><h3>Narrative report</h3></div></div>
      <div className="report-style no-print" role="group" aria-label="Narrative style"><button aria-pressed={style === 'tactical'} onClick={() => setStyle('tactical')}>Tactical Report</button><button aria-pressed={style === 'war-chronicle'} onClick={() => setStyle('war-chronicle')}>War Chronicle</button></div>
      {report.narrative.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>
    <section className="panel report-timeline"><span className="eyebrow">Round by round</span><h3>Battle timeline</h3>{report.rounds.map((round) => <details key={round.round} open><summary>Round {round.round} · {round.highlights.length} highlights</summary><ul>{round.highlights.map((entry) => <li key={entry.id}>{entry.phase.replace('_', ' ')} · {entry.description}{entry.note && <small>{entry.note}</small>}</li>)}</ul></details>)}</section>
    <section className="panel report-method"><h3>How to read these statistics</h3><p>Combat ROI = net enemy points destroyed / own starting points × 100%. Model value is an estimate: unit points / starting models. Restoration and model corrections remove the most recent outstanding credits across rounds. The last hit earns the kill, which is removed if the target returns.</p><p>Logged damage uses effective Wounds from Combat Logging and legacy explicit single-model decreases. Model-only losses and whole-unit KO infer no damage. Healing and restoration preserve gross damage; corrections retract mistaken loss. — means no recorded data, and Partial means only recorded damage. Action VP needs one unambiguous unit; joint awards remain unassigned. Objective control does not identify a capturing unit. Score corrections make previous action VP attribution uncertain.</p><p>This report describes recorded events. Unrecorded actions and missing sources cannot be reconstructed.</p></section>
  </section>
}
