import { t as tr } from '../../features/i18n/locale'
import { Link } from 'react-router-dom'
import { totalScore } from '../../domain/battle/selectors'
import type { BattleSession } from '../../domain/battle/types'
import { duelBattleReadyVp, isDuelPrimary } from '../../rulesets/cauldronFFA3/duelPrimary'

type BattleSummaryProps = {
  session: BattleSession
  logOpen: boolean
  onToggleLog: () => void
  onRestoreSession: () => void
  canRestoreSession?: boolean
  restoreDisabledReason?: string
}

function competitionRank(totals: readonly number[], index: number): number {
  if (index <= 0) return 1
  return totals[index] === totals[index - 1]
    ? competitionRank(totals, index - 1)
    : index + 1
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
  const totals = players.map(({ total }) => total)
  const highest = players[0]?.total ?? 0
  const winners = players.filter(({ total }) => total === highest)
  const completed = session.state.status === 'completed'
  const officialDuel = session.setup.rulesetId === 'cauldron-ffa-3' && isDuelPrimary(session)

  return <section className="panel battle-summary">
    <div className="battle-summary__heading">
      <span className="eyebrow">{completed ? tr('Battle complete') : tr('Session closed')}</span>
      <h2>{completed ? tr('Final result') : tr('Battle abandoned')}</h2>
      <p>{completed
        ? winners.length > 1
          ? tr(`Tie: ${winners.map(({ player }) => player.name).join(' · ')}`, "Tie: {0}")
          : winners[0] ? tr(`${winners[0].player.name} finishes on top.`, "{0} finishes on top.") : tr('Final scores preserved.')
        : tr('Progress was retained, but this session is not counted as a completed battle.')}</p>
    </div>

    <div className="battle-summary__ranking">
      {players.map(({ player, total }, index) => <article
        className={`battle-summary__player${completed && total === highest ? ' battle-summary__player--winner' : ''}`}
        key={player.id}
      >
        <span>{completed ? tr(`#${competitionRank(totals, index)}`, "#{0}") : tr('Current')}</span>
        <div><strong>{player.name}</strong><small>{player.faction ?? tr('Army')}</small></div>
        <strong className="battle-summary__total">{total}<small> {tr(" VP")}</small></strong>
        <div className="battle-summary__breakdown">
          <span>{tr("Primary ")}<strong>{player.score.primary}</strong></span>
          <span>{tr("Secondary ")}<strong>{player.score.secondary}</strong></span>
          {!officialDuel && <span>{tr("Plan ")}<strong>{player.score.plan}</strong></span>}
          {officialDuel && <span>{tr("Battle Ready ")}<strong>{duelBattleReadyVp(session, player.id)}</strong></span>}
          {player.score.adjustment - (officialDuel ? duelBattleReadyVp(session, player.id) : 0) !== 0 && <span>{tr("Adjustment ")}<strong>{player.score.adjustment - (officialDuel ? duelBattleReadyVp(session, player.id) : 0)}</strong></span>}
        </div>
      </article>)}
    </div>

    <div className="battle-summary__actions">
      <button type="button" disabled={!canRestoreSession} title={!canRestoreSession ? restoreDisabledReason : undefined} onClick={onRestoreSession}>{completed ? tr('Undo end battle') : tr('Restore active session')}</button>
      <button type="button" onClick={onToggleLog}>{logOpen ? tr('Hide battle log') : tr('View battle log')}</button>
      <Link className="button button--gold" to="/">{tr("Return home")}</Link>
    </div>
    {!canRestoreSession && restoreDisabledReason && <p className="context-note">{restoreDisabledReason}</p>}
  </section>
}
