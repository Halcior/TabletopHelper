import { totalScore } from '../../domain/battle/selectors'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { CAULDRON_RULESET_ID } from '../../rulesets/cauldronFFA3'
import type { LiveBattleFeedback } from './useLiveBattleFeedback'

type ScoreboardProps = {
  session: BattleSession
  rivalPlayerId?: string | null
  dispatch: (event: BattleEventInput) => void
  sharedMode?: boolean
  viewerPlayerId?: string | null
  feedback?: LiveBattleFeedback
}

export function Scoreboard({
  session,
  rivalPlayerId,
  dispatch,
  sharedMode = false,
  viewerPlayerId = null,
  feedback,
}: ScoreboardProps) {
  const cauldron = session.setup.rulesetId === CAULDRON_RULESET_ID
  const leadingScore = Math.max(...Object.values(session.state.players).map(totalScore))
  const orderedPlayerIds = sharedMode && viewerPlayerId
    ? [viewerPlayerId, ...session.state.turnOrder.filter((playerId) => playerId !== viewerPlayerId)]
    : session.state.turnOrder

  return (
    <section className="scoreboard" aria-label="Player scores and command points">
      {orderedPlayerIds.map((playerId) => {
        const player = session.state.players[playerId]
        const playerIndex = Math.max(0, session.state.turnOrder.indexOf(playerId))
        const active = playerId === session.state.activePlayerId
        const rival = playerId === rivalPlayerId
        const viewer = sharedMode && playerId === viewerPlayerId
        const canEditCp = !sharedMode || viewer
        const role = viewer ? 'You' : active ? 'Active' : rival ? 'Rival' : 'Opponent'
        return (
          <article className={`score-card score-card--player-${playerIndex}${active ? ' is-active' : ''}${rival ? ' is-rival' : ''}${viewer ? ' is-viewer' : ''}${leadingScore > 0 && totalScore(player) === leadingScore ? ' is-leading' : ''}`} key={playerId}>
            <div className="score-card__identity">
              <div className="score-card__name"><i aria-hidden="true" />{player.name}</div>
              {player.faction && <small>{player.faction}</small>}
              <span className="score-card__role">{role}</span>
            </div>
            <div className="score-card__numbers">
              <div className="score-card__metric score-card__metric--vp"><strong key={feedback?.scoreDeltas[playerId] ? feedback.id : 'steady'} className={feedback?.scoreDeltas[playerId] ? 'live-score-pulse' : ''}>{totalScore(player)}</strong><span>VP</span>{Boolean(feedback?.scoreDeltas[playerId]) && <small className="live-score-delta" role="status">{feedback!.scoreDeltas[playerId] > 0 ? '+' : ''}{feedback!.scoreDeltas[playerId]}</small>}</div>
              <div className="score-card__metric score-card__metric--cp" aria-label={`Command points for ${player.name}: ${player.cp} CP`}><strong>{player.cp}</strong><span>CP</span></div>
            </div>
            {canEditCp && <div className={`compact-controls${cauldron ? ' compact-controls--cp' : ''}`}>
              {!cauldron && <button
                aria-label={`Remove 1 VP from ${player.name}`}
                onClick={() => dispatch({ type: 'SCORE_ADJUSTED', payload: { playerId, category: 'adjustment', delta: -1 } })}
              >−VP</button>}
              {!cauldron && <button
                aria-label={`Add 1 VP to ${player.name}`}
                onClick={() => dispatch({ type: 'SCORE_ADJUSTED', payload: { playerId, category: 'adjustment', delta: 1 } })}
              >+VP</button>}
              <button
                aria-label={`Spend 1 CP for ${player.name}`}
                onClick={() => dispatch({ type: 'CP_SPENT', payload: { playerId, amount: 1 } })}
              >−CP</button>
              <button
                aria-label={`Gain 1 CP for ${player.name}`}
                onClick={() => dispatch({ type: 'CP_GAINED', payload: { playerId, amount: 1 } })}
              >+CP</button>
            </div>}
          </article>
        )
      })}
    </section>
  )
}
