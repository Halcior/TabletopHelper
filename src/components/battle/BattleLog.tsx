import { describeBattleEvent } from '../../domain/battle/eventLog'
import { buildScoringAudit } from '../../domain/battle/scoringAudit'
import type { BattleSession } from '../../domain/battle/types'

export function BattleLog({ session }: { session: BattleSession }) {
  const scoring = buildScoringAudit(session)
  return (
    <section className="panel log-panel">
      <div className="section-heading"><div><span className="eyebrow">Event history</span><h2>Battle log</h2></div></div>
      <details className="scoring-audit" open={session.state.status !== 'active'}>
        <summary>Scoring audit <span>{scoring.length} entries</span></summary>
        {scoring.length === 0 ? <p>No scoring has been recorded yet.</p> : <ol>
          {[...scoring].reverse().map((entry) => <li key={entry.id}>
            <span><strong>{session.state.players[entry.playerId]?.name ?? entry.playerId}</strong><small>Round {entry.round} · {entry.category} · {entry.label}</small></span>
            <strong>{entry.setTo !== undefined ? `set ${entry.setTo}` : `${(entry.points ?? 0) >= 0 ? '+' : ''}${entry.points}`} VP</strong>
          </li>)}
        </ol>}
      </details>
      <ol className="battle-log">
        {[...session.state.events].reverse().map((event) => (
          <li key={event.id}>
            <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            <span>{describeBattleEvent(event, session.setup)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
