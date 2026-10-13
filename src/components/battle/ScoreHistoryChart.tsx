import type { BattleSession } from '../../domain/battle/types'
import type { BattlefieldReplayFrame } from '../../domain/battlefield/replay'

export function ScoreHistoryChart({ session, frames }: { session: BattleSession; frames: BattlefieldReplayFrame[] }) {
  const maximum = Math.max(10, Math.ceil(Math.max(0, ...frames.flatMap((frame) => Object.values(frame.scores))) / 10) * 10)
  const x = (index: number) => 42 + index / Math.max(1, frames.length - 1) * 550
  const y = (score: number) => 166 - score / maximum * 136
  const roundFrames = frames.filter((frame, index) => index === 0 || frame.round !== frames[index - 1].round)
  return <section className="panel score-history" aria-label="Recorded VP history">
    <div className="section-heading"><div><span className="eyebrow">Actual event order</span><h3>Score history</h3></div><span>VP</span></div>
    <svg viewBox="0 0 620 208" role="img" aria-label="Victory points throughout recorded events; the table below provides round scores">
      {[0, maximum / 2, maximum].map((value) => <g key={value}><line x1="42" x2="596" y1={y(value)} y2={y(value)} className="score-history__grid" /><text x="32" y={y(value) + 4} textAnchor="end">{value}</text></g>)}
      {roundFrames.map((frame) => <g key={frame.index}><line x1={x(frame.index)} x2={x(frame.index)} y1="30" y2="166" className="score-history__grid" /><text x={x(frame.index)} y="190" textAnchor="middle">R{frame.round}</text></g>)}
      {session.setup.players.map((player) => <polyline key={player.id} points={frames.map((frame) => `${x(frame.index)},${y(frame.scores[player.id] ?? 0)}`).join(' ')} fill="none" stroke={`var(--player-${session.setup.turnOrder.indexOf(player.id)})`} strokeWidth="2.5" strokeLinejoin="round" />)}
    </svg>
    <div className="score-history__legend">{session.setup.players.map((player) => <span key={player.id} style={{ color: `var(--player-${session.setup.turnOrder.indexOf(player.id)})` }}>● {player.name}</span>)}</div>
    <details><summary>Recorded round scores</summary><div className="report-table-wrap"><table><thead><tr><th>Round</th>{session.setup.players.map((player) => <th key={player.id}>{player.name}</th>)}</tr></thead><tbody>{roundFrames.map((start) => {
      const last = frames.filter((frame) => frame.round === start.round).at(-1)!
      return <tr key={start.index}><th>R{start.round}{start.round === session.state.round && session.state.status === 'active' ? ' · provisional' : ''}</th>{session.setup.players.map((player) => <td key={player.id}>{last.scores[player.id] ?? 0} VP</td>)}</tr>
    })}</tbody></table></div><p className="context-note">Each round shows its latest recorded state. The chart retains changes within turns. Unrecorded rounds are omitted.</p></details>
  </section>
}
