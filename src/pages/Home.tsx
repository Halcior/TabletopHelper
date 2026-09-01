import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { totalScore } from '../domain/battle/selectors'
import type { BattleSession } from '../domain/battle/types'
import {
  getLatestActiveBattle,
  listArmies,
  listRecentBattles,
  type StoredArmy,
  type StoredBattle,
} from '../persistence/database'

function statusLabel(status: StoredBattle['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'abandoned') return 'Abandoned'
  return 'Active'
}

export default function Home() {
  const [armies, setArmies] = useState<StoredArmy[]>([])
  const [activeBattle, setActiveBattle] = useState<BattleSession | null>(null)
  const [recentBattles, setRecentBattles] = useState<StoredBattle[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([listArmies(), getLatestActiveBattle(), listRecentBattles(8)])
      .then(([storedArmies, battle, recent]) => {
        setArmies(storedArmies)
        setActiveBattle(battle ?? null)
        setRecentBattles(recent.filter((entry) => entry.status !== 'active').slice(0, 5))
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  return (
    <div className="page-shell home-page">
      <section className="hero-panel">
        <span className="eyebrow">Offline battle co-pilot</span>
        <h1>Command the Cauldron, not the bookkeeping.</h1>
        <p>Assign three armies, follow Rival rotation and phases, then let the companion retain casualties, objectives, Operational Plans, Primary scoring, and the event log.</p>
        <div className="hero-actions">
          <Link className="button button--gold" to="/army-import">Import New Recruit</Link>
          {armies.length > 0 && <Link className="button" to="/battle/setup">New Cauldron game</Link>}
          {activeBattle && <Link className="button" to={`/battle/${activeBattle.setup.gameId}`}>Resume battle</Link>}
        </div>
      </section>

      {error && <div className="alert alert--danger">Local storage error: {error}</div>}

      {activeBattle && (
        <section className="panel resume-card">
          <div><span className="eyebrow">Resume battle</span><h2>Round {activeBattle.state.round} · {activeBattle.state.phase.replace('_', ' ')}</h2></div>
          <div className="resume-scores">
            {activeBattle.state.turnOrder.map((id) => {
              const player = activeBattle.state.players[id]
              return <span key={id}>{player.name} <strong>{totalScore(player)} VP</strong></span>
            })}
          </div>
          <Link className="button button--gold" to={`/battle/${activeBattle.setup.gameId}`}>Resume</Link>
        </section>
      )}

      {recentBattles.length > 0 && <section className="section-block recent-battles">
        <div className="section-heading"><div><span className="eyebrow">Battle history</span><h2>Recent sessions</h2></div></div>
        <div className="recent-battle-list">
          {recentBattles.map((entry) => <article className={`panel recent-battle-card recent-battle-card--${entry.status}`} key={entry.id}>
            <div className="recent-battle-card__heading">
              <div><span className="eyebrow">{statusLabel(entry.status)}</span><h3>Battle Round {entry.session.state.round}</h3></div>
              <span>{entry.session.setup.rulesetId === 'cauldron-ffa3' ? 'Cauldron FFA 3' : entry.session.setup.rulesetId}</span>
            </div>
            <div className="recent-battle-card__scores">
              {entry.session.state.turnOrder.map((id) => {
                const player = entry.session.state.players[id]
                return <span key={id}>{player.name}<strong>{totalScore(player)} VP</strong></span>
              })}
            </div>
            <Link className="button button--small" to={`/battle/${entry.id}`}>View session</Link>
          </article>)}
        </div>
      </section>}

      <section className="section-block">
        <div className="section-heading"><div><span className="eyebrow">Local library</span><h2>Imported armies</h2></div><Link to="/army-import">Add army</Link></div>
        {armies.length === 0 ? (
          <div className="empty-state"><p>No armies have been accepted yet.</p></div>
        ) : (
          <div className="army-library">
            {armies.map(({ army }) => (
              <article className="panel library-card" key={army.id}>
                <div><h3>{army.faction}</h3><p>{army.name}</p></div>
                <div className="library-card__facts"><strong>{army.totalPoints}</strong><span>PTS</span><strong>{army.units.length}</strong><span>UNITS</span></div>
                <Link className="button button--small" to={`/battle/setup?armyId=${encodeURIComponent(army.id)}`}>Use in Cauldron</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
