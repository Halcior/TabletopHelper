import { chronicleCopy } from '../../features/i18n/chronicleCopy'
import { narrativeCopy, downloadReportCopy } from '../../features/i18n/reportCopy'
import { t as tr } from '../../features/i18n/locale'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import { ClockStatistics } from '../../features/battleClock/ClockStatistics'
import { PlayerArmyBanner, PlayerUnitPortrait } from '../../features/factionVisuals/components'
import { useMemo, useState, type MouseEvent } from 'react'
import { buildBattleReport, type NarrativeStyle } from '../../domain/battle/battleReport'
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
  const anchor = useSharedSessionStore(s => s.membership?.battleId === session.setup.gameId ? s.clockAnchor : null)
  const report = useMemo(() => buildBattleReport(session, style, anchor ? anchor.serverNow + performance.now() - anchor.monotonicAt : Date.now()), [session, style, anchor])
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
  return <section className="battle-report" aria-label={tr("Battle Report")}>
    <header className="panel report-heading">
      <div><span className="eyebrow">{report.status === 'active' ? tr('Live preview') : report.status === 'completed' ? tr('After-action archive') : tr('Retained battle archive')}</span><span className="report-after-action">{tr("After-Action Report")}</span><h2>{tr("Battle Report")}</h2>
        <p>{tr(report.mode)}</p><RulesSourceBadge source={rulesForSession(session).source} /><small>{tr("Round ")}{report.roundsPlayed} / {report.maxRounds} · {report.status === 'active' ? tr('Scores are provisional') : report.status === 'completed' ? tr('Final scores') : tr('Abandoned · no winner declared')}</small></div>
      <div className="report-export no-print" role="group" aria-label={tr("Export Battle Report")}>
        <button onClick={() => downloadReportCopy(report, 'markdown')}>{tr("Export Markdown")}</button>
        <button onClick={() => downloadReportCopy(report, 'json')}>{tr("Export JSON")}</button>
        <button onClick={() => window.print()}>{tr("Print / PDF")}</button>
      </div>
    </header>
    <section className="report-ranking" aria-label={tr("Battle overview")}>
      {report.ranking.map((player) => <article key={player.playerId} className={`panel report-player report-player--${session.setup.turnOrder.indexOf(player.playerId)}`}>
        <span className="eyebrow">{report.status === 'completed' && player.rank === 1 ? report.winnerPlayerIds.length > 1 ? tr('Joint winner') : tr('Winner') : tr(`#${player.rank}`, "#{0}")}</span>
        <PlayerArmyBanner session={session} playerId={player.playerId} /><h3>{player.name}</h3><p>{player.faction}</p><strong>{player.vp}<small> {tr(" VP")}</small></strong>
      </article>)}
    </section>
    <section className="panel report-highlights" aria-label={tr("Battle highlights")}><span className="eyebrow">{tr("From recorded events")}</span><h3>{tr("Battle highlights")}</h3>{highlights.length > 0 ? <ol>{highlights.map((entry) => <li key={entry.id}><small>{tr("Round ")}{entry.round} · {tr(entry.phase.replace('_', ' '))}</small><p>{chronicleCopy(entry, session.state.players)}</p></li>)}</ol> : <p>{tr("No battle highlights recorded yet.")}</p>}</section>
    <ClockStatistics session={session} statistics={report.timeStatistics} />
    <ScoreHistoryChart session={session} frames={frames} />
    {report.performance.units.some((unit) => unit.enemyPointsDestroyed > 0 || unit.completedMissionActions > 0) && <section className="panel report-top-units"><span className="eyebrow">{tr("Recorded contribution · provisional while live")}</span><h3>{tr("Standout units")}</h3><div>{[...report.performance.units].filter((unit) => unit.enemyPointsDestroyed > 0 || unit.completedMissionActions > 0).sort((a, b) => b.enemyPointsDestroyed - a.enemyPointsDestroyed || b.completedMissionActions - a.completedMissionActions).slice(0, 3).map((unit) => <a key={`${unit.playerId}:${unit.unitId}`} href={`#performance-${unit.playerId}-${unit.unitId}`} onClick={(event) => openUnit(event, `performance-${unit.playerId}-${unit.unitId}`)}><PlayerUnitPortrait session={session} playerId={unit.playerId} unitId={unit.unitId} /><strong>{unit.name}</strong><span>{playerName(unit.playerId)}</span><small>{points(unit.enemyPointsDestroyed)} {tr(" enemy pts · ")}{unit.completedMissionActions} {tr(" actions")}</small></a>)}</div></section>}
    <details className="panel report-missions"><summary>{tr("Selected missions")}</summary><ul>{report.missions.map((mission) => <li key={mission}>{mission}</li>)}</ul></details>
    <section className="panel report-armies"><div className="section-heading"><div><span className="eyebrow">{tr("Confirmed contribution")}</span><h3>{tr("Army performance")}</h3></div></div>
      <div className="report-table-wrap"><table><thead><tr><th>{tr("Army")}</th><th>{tr("Enemy pts destroyed")}</th><th>{tr("Own pts lost")}</th><th>{tr("Kills")}</th><th>{tr("Player-only pts")}</th></tr></thead><tbody>
        {report.performance.armies.map((army) => <tr key={army.playerId}><th>{playerName(army.playerId)}</th><td>{points(army.enemyPointsDestroyed)}</td><td>{points(army.ownPointsLost)}</td><td>{army.kills}</td><td>{points(army.playerOnlyPoints)}</td></tr>)}
      </tbody></table></div>
      <p className="report-data-note">{report.performance.partial ? tr('Partial unit attribution') : tr('Recorded casualty values assigned')} · {points(report.performance.unattributedPoints)} {tr(" pts without a player source. Unknown unit sources stay in the army total.")}</p>
    </section>
    <section className="panel report-engagements" aria-label={tr("Combat engagements")}>
      <div className="section-heading"><div><span className="eyebrow">{tr("Derived from recorded casualties")}</span><h3>{tr("Combat engagements")}</h3></div><small>{report.performance.engagements.length} {tr(" attacker → target pairs")}</small></div>
      <p className="report-data-note">{tr("Who hit whom — even if the defending unit survived. Models and points are NET after restoration or corrections. Effective Wounds are only those explicitly logged (Partial); unknown sources are never guessed.")}</p>
      {report.performance.engagements.length > 0 ? <div className="report-table-wrap"><table>
        <thead><tr><th>{tr("Attacker")}</th><th>{tr("Target")}</th><th>{tr("Models (net)")}</th><th>{tr("Enemy pts (net)")}</th><th>{tr("Logged W")}</th><th>{tr("Unit kills")}</th></tr></thead>
        <tbody>{report.performance.engagements.map((engagement, index) => <tr key={`${engagement.attackerPlayerId ?? 'unknown'}:${engagement.attacker?.unitId ?? 'unknown'}:${engagement.target.playerId}:${engagement.target.unitId}:${index}`}>
          <td><strong>{engagement.attacker?.name ?? (engagement.attackerPlayerId ? tr('Unspecified unit') : tr('Unknown source'))}</strong>{engagement.attackerPlayerId && <small>{playerName(engagement.attackerPlayerId)}</small>}</td>
          <td><strong>{engagement.target.name}</strong><small>{playerName(engagement.target.playerId)}</small></td>
          <td>{engagement.modelsDestroyed}</td><td>{points(engagement.enemyPointsDestroyed)}</td><td>{engagement.loggedWounds === 0 ? '—' : tr(`${engagement.loggedWounds} W`, "{0} W")}</td><td>{engagement.kills}</td>
        </tr>)}</tbody>
      </table></div> : <p className="context-note">{tr("No combat losses with attribution have been recorded yet.")}</p>}
    </section>
    <section className="report-performance" aria-label={tr("Unit performance")}>
      <div className="section-heading"><div><span className="eyebrow">{tr("Combat · Survival · Missions")}</span><h3>{tr("Unit performance")}</h3></div></div>
      <div className="report-filters no-print">
        <label><span>{tr("Performance player")}</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="all">{tr("All players")}</option>{session.setup.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label><span>{tr("Compare units by")}</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="points">{tr("Enemy points destroyed")}</option><option value="roi">{tr("Combat ROI")}</option><option value="kills">{tr("Kills")}</option><option value="actions">{tr("Completed Mission Actions")}</option></select></label>
      </div>
      <div className="performance-grid">{units.map((unit) => <article id={`performance-${unit.playerId}-${unit.unitId}`} key={`${unit.playerId}:${unit.unitId}`} className={`panel performance-card report-player--${session.setup.turnOrder.indexOf(unit.playerId)}`}>
        <div className="performance-card__heading"><div><span className="eyebrow">{playerName(unit.playerId)}</span><h4>{unit.name}</h4><small>{unit.startingPoints} {tr(" starting pts")}</small></div><span className={unit.survived ? 'performance-survived' : 'performance-destroyed'}>{unit.survived ? report.status === 'active' ? tr('Alive') : tr('Survived') : tr(`Destroyed · R${unit.destructionRound ?? '—'}`, "Destroyed · R{0}")}</span></div>
        <div className="performance-kpis"><div><strong>{unit.kills}</strong><span>{tr("Kills")}</span></div><div><strong>{points(unit.enemyPointsDestroyed)}</strong><span>{tr("Enemy pts")}</span></div><div><strong>{unit.combatRoi === null ? '—' : tr(`${Math.round(unit.combatRoi)}%`, "{0}%")}</strong><span>{tr("Combat ROI")}</span></div></div>
        <progress aria-label={tr(`${unit.name} enemy points destroyed`, "{0} enemy points destroyed")} value={unit.enemyPointsDestroyed} max={maximum} />
        <dl className="performance-facts"><div><dt>{tr("Enemy models destroyed")}</dt><dd>{unit.modelsDestroyed}</dd></div><div><dt>{tr("Logged damage · partial")}</dt><dd>{unit.damageDealt === null ? '—' : tr(`${unit.damageDealt} W`, "{0} W")}</dd></div><div><dt>{tr("Damage received · partial")}</dt><dd>{unit.damageReceived === null ? '—' : tr(`${unit.damageReceived} W`, "{0} W")}</dd></div><div><dt>{tr("Wounds healed / models restored")}</dt><dd>{unit.woundsHealed} W / {unit.modelsRestored}</dd></div><div><dt>{tr("Models lost / remaining")}</dt><dd>{unit.modelsLost} / {unit.remainingModels}</dd></div>{unit.remainingWounds !== undefined && <div><dt>{tr("Remaining wounds")}</dt><dd>{unit.remainingWounds}</dd></div>}<div><dt>{tr("Completed Mission Actions")}</dt><dd>{unit.completedMissionActions}</dd></div><div><dt>{tr("Confirmed action VP")}</dt><dd>{unit.missionVp ?? '—'}</dd></div></dl>
        {unit.destroyedEnemies.length > 0 && <details><summary>{tr("Destroyed opponents")}</summary><ul>{unit.destroyedEnemies.map((enemy) => <li key={`${enemy.playerId}:${enemy.unitId}`}>{enemy.name} · {playerName(enemy.playerId)} · R{enemy.round}</li>)}</ul></details>}
      </article>)}</div>
      {units.length === 0 && <p className="context-note">{tr("No roster units available for this battle.")}</p>}
    </section>
    <section className="panel report-awards"><span className="eyebrow">{tr("Explicit rules · shared ties")}</span><h3>{tr("Unit awards")}</h3>
      {report.performance.awards.length === 0 ? <p>{report.status === 'active' ? tr('Awards become available after the battle ends.') : tr('Not enough attributed data for awards.')}</p> : report.performance.awards.map((award) => <article key={award.title}><strong>{tr(award.title)}</strong><p>{award.winners.map((unit) => `${unit.name} (${playerName(unit.playerId)})`).join(' · ')}</p><small>{tr(award.rule)}</small></article>)}
    </section>
    <section className="panel report-narrative"><div className="section-heading"><div><span className="eyebrow">{tr("From recorded events · available offline")}</span><h3>{tr("Narrative report")}</h3></div></div>
      <div className="report-style no-print" role="group" aria-label={tr("Narrative style")}><button aria-pressed={style === 'tactical'} onClick={() => setStyle('tactical')}>{tr("Tactical Report")}</button><button aria-pressed={style === 'war-chronicle'} onClick={() => setStyle('war-chronicle')}>{tr("War Chronicle")}</button></div>
      {narrativeCopy(report).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>
    <section className="panel report-timeline"><span className="eyebrow">{tr("Round by round")}</span><h3>{tr("Battle timeline")}</h3>{report.rounds.map((round) => <details key={round.round} open><summary>{tr("Round ")}{round.round} · {round.highlights.length} {tr(" highlights")}</summary><ul>{round.highlights.map((entry) => <li key={entry.id}>{tr(entry.phase.replace('_', ' '))} · {chronicleCopy(entry, session.state.players)}{entry.note && <small>{entry.note}</small>}</li>)}</ul></details>)}</section>
    <section className="panel report-method"><h3>{tr("How to read these statistics")}</h3><p>{tr("Combat ROI = net enemy points destroyed / own starting points × 100%. Model value is an estimate: unit points / starting models. Restoration and model corrections remove the most recent outstanding credits across rounds. The last hit earns the kill, which is removed if the target returns.")}</p><p>{tr("Logged damage uses effective Wounds from Combat Logging and legacy explicit single-model decreases. Model-only losses and whole-unit KO infer no damage. Healing and restoration preserve gross damage; corrections retract mistaken loss. — means no recorded data, and Partial means only recorded damage. Action VP needs one unambiguous unit; joint awards remain unassigned. Objective control does not identify a capturing unit. Score corrections make previous action VP attribution uncertain.")}</p><p>{tr("Combat engagements show net model losses per attacker and target, including units that survived. Logged Wounds are partial historical records, not estimates of damage inferred from casualties. This report describes recorded events. Unrecorded actions and missing sources cannot be reconstructed.")}</p></section>
  </section>
}
