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
import { CAULDRON_RULESET_ID } from '../rulesets/cauldronFFA3'

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
  const [hosted, setHosted] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')

  useEffect(() => {
    void Promise.all([listArmies(), getLatestActiveBattle(), listRecentBattles(8)])
      .then(([storedArmies, battle, recent]) => {
        setArmies(storedArmies)
        setActiveBattle(battle ?? null)
        setRecentBattles(recent.filter((entry) => entry.status !== 'active').slice(0, 5))
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [])

  useEffect(() => {
    setHosted(!['localhost', '127.0.0.1'].includes(window.location.hostname))
  }, [])

  async function shareTestLink() {
    const url = window.location.origin
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Tabletop Companion playtest', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShareStatus('copied')
      window.setTimeout(() => setShareStatus('idle'), 1800)
    } catch {
      // Native share cancellation should not interrupt the app.
    }
  }

  return (
    <div className="page-shell home-page home-page--focused">
      <section className="home-command-hub">
        <div className="home-command-hub__heading">
          <span className="eyebrow">Tabletop Companion</span>
          <h1>Ready to play?</h1>
          <p>Pick what you want to do. Everything else stays out of the way.</p>
        </div>

        <div className="home-command-actions">
          {activeBattle && <Link className="home-action home-action--primary" to={`/battle/${activeBattle.setup.gameId}`}>
            <span>Continue</span>
            <strong>Resume battle</strong>
            <small>Round {activeBattle.state.round} · {activeBattle.state.phase.replaceAll('_', ' ')}</small>
          </Link>}

          {armies.length > 0 ? <Link className={`home-action${activeBattle ? '' : ' home-action--primary'}`} to="/battle/setup">
            <span>Play</span>
            <strong>New battle</strong>
            <small>Set up Cauldron FFA 3</small>
          </Link> : <Link className="home-action home-action--primary" to="/army-import">
            <span>First step</span>
            <strong>Import army</strong>
            <small>Add a New Recruit roster</small>
          </Link>}

          <Link className="home-action" to="/shared">
            <span>Multiplayer</span>
            <strong>Host or join</strong>
            <small>Use a shared room code</small>
          </Link>

          {armies.length > 0 && <Link className="home-action" to="/army-import">
            <span>Roster</span>
            <strong>Import army</strong>
            <small>{armies.length} saved locally</small>
          </Link>}
        </div>

        {hosted && <button className="home-test-link" type="button" onClick={() => void shareTestLink()}>{shareStatus === 'copied' ? 'Test link copied' : 'Share app test link'}</button>}
      </section>

      {error && <div className="alert alert--danger">Local storage error: {error}</div>}

      {activeBattle && <section className="home-current-score" aria-label="Active battle score">
        {activeBattle.state.turnOrder.map((id) => {
          const player = activeBattle.state.players[id]
          return <span key={id}>{player.name}<strong>{totalScore(player)} VP</strong></span>
        })}
      </section>}

      {recentBattles.length > 0 && <section className="section-block recent-battles">
        <div className="section-heading"><div><span className="eyebrow">History</span><h2>Recent battles</h2></div></div>
        <div className="recent-battle-list">
          {recentBattles.map((entry) => <article className={`panel recent-battle-card recent-battle-card--${entry.status}`} key={entry.id}>
            <div className="recent-battle-card__heading">
              <div><span className="eyebrow">{statusLabel(entry.status)}</span><h3>Battle Round {entry.session.state.round}</h3></div>
              <span>{entry.session.setup.rulesetId === CAULDRON_RULESET_ID ? 'Cauldron FFA 3' : entry.session.setup.rulesetId}</span>
            </div>
            <div className="recent-battle-card__scores">
              {entry.session.state.turnOrder.map((id) => {
                const player = entry.session.state.players[id]
                return <span key={id}>{player.name}<strong>{totalScore(player)} VP</strong></span>
              })}
            </div>
            <Link className="button button--small" to={`/battle/${entry.id}`}>View</Link>
          </article>)}
        </div>
      </section>}

      <section className="section-block home-armies-section">
        <div className="section-heading"><div><span className="eyebrow">Armies</span><h2>Saved rosters</h2></div><Link to="/army-import">Add</Link></div>
        {armies.length === 0 ? (
          <div className="empty-state"><p>No armies imported yet.</p></div>
        ) : (
          <div className="army-library">
            {armies.map(({ army }) => (
              <article className="panel library-card" key={army.id}>
                <div><h3>{army.faction}</h3><p>{army.name}</p></div>
                <div className="library-card__facts"><strong>{army.totalPoints}</strong><span>PTS</span><strong>{army.units.length}</strong><span>UNITS</span></div>
                <Link className="button button--small" to={`/battle/setup?armyId=${encodeURIComponent(army.id)}`}>Use</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
