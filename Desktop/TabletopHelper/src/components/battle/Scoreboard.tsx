import { totalScore } from '../../domain/battle/selectors'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { CAULDRON_RULESET_ID } from '../../rulesets/cauldronFFA3'

type ScoreboardProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
}

export function Scoreboard({ session, dispatch }: ScoreboardProps) {
  const cauldron = session.setup.rulesetId === CAULDRON_RULESET_ID
  return (
    <section className="scoreboard" aria-label="Player scores and command points">
      {session.state.turnOrder.map((playerId) => {
        const player = session.state.players[playerId]
        const active = playerId === session.state.activePlayerId
        return (
          <article className={`score-card${active ? ' is-active' : ''}`} key={playerId}>
            <div className="score-card__name">{player.name}</div>
            <div className="score-card__numbers">
              <div><strong>{totalScore(player)}</strong><span>VP</span></div>
              <div><strong>{player.cp}</strong><span>CP</span></div>
            </div>
            <div className={`compact-controls${cauldron ? ' compact-controls--cp' : ''}`}>
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
            </div>
          </article>
        )
      })}
    </section>
  )
}
