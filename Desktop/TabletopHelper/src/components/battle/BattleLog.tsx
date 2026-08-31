import { describeBattleEvent } from '../../domain/battle/eventLog'
import type { BattleSession } from '../../domain/battle/types'

export function BattleLog({ session }: { session: BattleSession }) {
  return (
    <section className="panel log-panel">
      <div className="section-heading"><div><span className="eyebrow">Event history</span><h2>Battle log</h2></div></div>
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
