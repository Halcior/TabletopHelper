import { Link } from 'react-router-dom'
import { totalScore } from '../../domain/battle/selectors'
import type { BattleSession } from '../../domain/battle/types'

type BattleSummaryProps = {
  session: BattleSession
  logOpen: boolean
  onToggleLog: () => void
  onRestoreSession: () => void
  canRestoreSession?: boolean
  restoreDisabledReason?: string
}

export function BattleSummary({
  session,
  logOpen,
  onToggleLog,
  onRestoreSession,
  canRestoreSession = true,
  restoreDisabledReason,
}: BattleSummaryProps) {
  const players = Object.values(session.state.players)
    .map((player) => ({ player, total: totalScore(player) }))
    .sort((left, right) => right.total - left.total)
  const highest = players[0]?.total ?? 0
  const winners = players.filter(({ total }) => total === highest)
  const completed = session.state.status === 'completed'

  return <section className="panel battle-summary">
    <div className="battle-summary__heading">
      <span className="eyebrow">{completed ? 'Battle complete' : 'Session closed'}</span>
      <h2>{completed ? 'Final result' : 'Battle abandoned'}</h2>
      <p>{completed
        ? winners.length > 1
          ? `Tie: ${winners.map(({ player }) => player.name).join(' · ')}`
          : winners[0] ? `${winners[0].player.name} finishes on top.` : 'Final scores preserved.'
        : 'Progress was retained, but this session is not counted as a completed battle.'}</p>
    </div>

    <div className="battle-summary__ranking">
      {players.map(({ player, total }, index) => <article
        className={`battle-summary__player${completed && total === highest ? ' battle-summary__player--winner' : ''}`}
        key={player.id}
      >
        <span>{completed ? `#${index + 1}` : 'Current'}</span>
        <div><strong>{player.name}</strong><small>{player.faction ?? 'Army'}</small></div>
        <strong className="battle-summary__total">{total}<small> VP</small></strong>
        <div className="battle-summary__breakdown">
          <span>Primary <strong>{player.score.primary}</strong></span>
          <span>Secondary <strong>{player.score.secondary}</strong></span>
          <span>Plan <strong>{player.score.plan}</strong></span>
          {player.score.adjustment !== 0 && <span>Adjustment <strong>{player.score.adjustment}</strong></span>}
        </div>
      </article>)}
    </div>

    <div className="battle-summary__actions">
      <button type="button" disabled={!canRestoreSession} title={!canRestoreSession ? restoreDisabledReason : undefined} onClick={onRestoreSession}>{completed ? 'Undo end battle' : 'Restore active session'}</button>
      <button type="button" onClick={onToggleLog}>{logOpen ? 'Hide battle log' : 'View battle log'}</button>
      <Link className="button button--gold" to="/">Return home</Link>
    </div>
    {!canRestoreSession && restoreDisabledReason && <p className="context-note">{restoreDisabledReason}</p>}
  </section>
}
