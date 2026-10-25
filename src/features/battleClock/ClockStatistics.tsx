import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'
import type { BattleSession } from '../../domain/battle/types'
import { formatDuration, timeStatistics, type ClockStatistics as Statistics } from './model'
import { clockCopy } from './copy'

export function ClockStatistics({ session, statistics }: { session?: BattleSession; statistics?: Statistics[] }) {
  const c = clockCopy()
  const anchor = useSharedSessionStore(s => s.membership?.battleId === session?.setup.gameId ? s.clockAnchor : null)
  const now = anchor ? anchor.serverNow + performance.now() - anchor.monotonicAt : Date.now()
  const rows = statistics ?? timeStatistics(session?.battleClock, now)
  if (!rows.length) return null
  const rounds = [...new Set(rows.flatMap(row => Object.keys(row.rounds)))].sort((a,b) => Number(a)-Number(b))
  return <section className="clock-statistics" aria-label="Time Statistics" lang="pl">
    <h3>{c.statistics}</h3>
    <div className="report-table-wrap"><table><thead><tr><th>{c.title}</th><th>{c.used}</th><th>{c.left}</th><th>{c.passes}</th><th>{c.overtime}</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><th>{row.name}</th><td>{formatDuration(row.usedMs)}</td><td>{formatDuration(row.remainingMs)}</td><td>{row.manualPasses}</td><td>{formatDuration(row.overtimeMs)}</td></tr>)}
    </tbody></table></div>
    {rounds.length > 0 && <details><summary>{c.round}</summary><ul>{rounds.map(round => <li key={round}>{c.round} {round}: {rows.map(row => `${row.name} — ${formatDuration(row.rounds[round] ?? 0)}`).join(' · ')}</li>)}</ul></details>}
    {session?.state.status === 'active' && <small>{c.live}</small>}
  </section>
}
