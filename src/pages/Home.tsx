import { t as tr } from '../features/i18n/locale'
import { useRosterLibrary } from '../features/armyLibrary/repository'
import { DeleteRosterButton } from '../features/armyLibrary/DeleteRosterButton'
import { useRosterScope } from '../features/armyLibrary/scope'
import { ArmyBanner } from '../features/factionVisuals/components'
import { VisualPreferences } from '../features/factionVisuals/VisualPreferences'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import { totalScore } from '../domain/battle/selectors'
import type { BattleSession } from '../domain/battle/types'
import {
  getLatestActiveBattle,
  listRecentBattles,
  type StoredBattle,
} from '../persistence/database'
import { CAULDRON_RULESET_ID } from '../rulesets/cauldronFFA3'
import { rulesForSession } from '../rulesets/rulesSource'
import { RulesSourceBadge } from '../components/ui/RulesSourceBadge'

function statusLabel(status: StoredBattle['status']): string {
  if (status === 'completed') return 'Completed'
  if (status === 'abandoned') return 'Abandoned'
  return 'Active'
}

function HomeActionContent({ icon, label, title, detail }: { icon: AppIconName; label: string; title: string; detail: string }) {
  return <>
    <span className="home-action__icon"><AppIcon name={icon} /></span>
    <span className="home-action__copy"><small>{tr(label)}</small><strong>{tr(title)}</strong><span>{tr(detail)}</span></span>
    <AppIcon name="chevron" className="home-action__arrow" />
  </>
}

export default function Home() {
  const { rows: armies } = useRosterLibrary()
  const owner = useRosterScope((s) => s.userId)
  const [activeBattle, setActiveBattle] = useState<BattleSession | null>(null)
  const [recentBattles, setRecentBattles] = useState<StoredBattle[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hosted, setHosted] = useState(false)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void Promise.all([getLatestActiveBattle(), listRecentBattles(8)])
      .then(([battle, recent]) => {
        setActiveBattle(battle ?? null)
        setRecentBattles(recent.filter((entry) => entry.status !== 'active').slice(0, 5))
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    setHosted(!['localhost', '127.0.0.1'].includes(window.location.hostname))
  }, [])

  async function shareTestLink() {
    const url = window.location.origin
    try {
      if (navigator.share) {
        await navigator.share({ title: 'TabletopHelper', url })
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
      <div className="legacy-actions"><Link className="button" to="/archive">{tr("Battle Archive & Statistics")}</Link><Link className="button" to="/campaigns">{tr("Narrative Campaigns")}</Link></div>
      <section className="home-command-hub">
        <div className="home-command-hub__heading">
          <span className="eyebrow">{tr("TabletopHelper")}</span>
          <h1>{tr("Command Hub")}</h1>
          <p>{tr("Your battle, ready when you are.")}</p>
        </div>

        {loading ? <div className="loading-state" role="status">{tr("Loading your command hub…")}</div> : <div className="home-command-actions">
          {activeBattle && <Link className="home-action home-action--primary" to={`/battle/${activeBattle.setup.gameId}`}>
            <HomeActionContent icon="overview" label={tr("Continue")} title={tr("Resume battle")} detail={`Round ${activeBattle.state.round} · ${activeBattle.state.phase.replaceAll('_', ' ')}`} />
          </Link>}

          {armies.length > 0 ? <Link className={`home-action${activeBattle ? '' : ' home-action--primary'}`} to="/battle/setup">
            <HomeActionContent icon="objectives" label={tr("Play")} title={tr("New battle")} detail="Duel 1v1 · Doubles 2v2 · Community FFA 3" />
          </Link> : <Link className="home-action home-action--primary" to="/army-import">
            <HomeActionContent icon="import" label={tr("First step")} title={tr("Import army")} detail="Add a New Recruit roster" />
          </Link>}

          <Link className="home-action" to="/shared">
            <HomeActionContent icon="shared" label={tr("Multiplayer")} title={tr("Host or join")} detail="Use a shared room code" />
          </Link>

          <Link className="home-action" to="/terrain-layouts">
            <HomeActionContent icon="objectives" label={tr("Table setup")} title={tr("Terrain layouts")} detail="45 official plans · 1v1 and 2v2 · print" />
          </Link>

          {armies.length > 0 && <Link className="home-action" to="/armies">
            <HomeActionContent icon="army" label={tr("Roster")} title={tr("Army Library")} detail={`${armies.length} saved rosters`} />
          </Link>}
        </div>}

        {hosted && <button className="home-test-link" type="button" onClick={() => void shareTestLink()}>{shareStatus === 'copied' ? tr('App link copied') : tr('Share app link')}</button>}
      </section>

      {error && <div className="alert alert--danger" role="alert">{tr("Could not load saved data: ")}{tr(error)}</div>}

      {activeBattle && <section className="home-current-score" aria-label={tr("Active battle score")}>
        <div className="home-current-score__heading"><span>{tr("Active battle")}</span><RulesSourceBadge source={rulesForSession(activeBattle).source} /><strong>{tr("Round ")}{activeBattle.state.round} · {activeBattle.state.phase.replaceAll('_', ' ')}</strong></div>
        <div className="home-current-score__players">{activeBattle.state.turnOrder.map((id, index) => {
          const player = activeBattle.state.players[id]
          return <span className={`home-current-score__player home-current-score__player--${index}`} key={id}>{player.name}<strong>{totalScore(player)} {tr(" VP")}</strong></span>
        })}</div>
      </section>}

      {recentBattles.length > 0 && <section className="section-block recent-battles">
        <div className="section-heading"><div><span className="eyebrow">{tr("History")}</span><h2>{tr("Recent battles")}</h2></div></div>
        <div className="recent-battle-list">
          {recentBattles.map((entry) => <article className={`panel recent-battle-card recent-battle-card--${entry.status}`} key={entry.id}>
            <div className="recent-battle-card__heading">
              <div><span className="eyebrow">{statusLabel(entry.status)}</span><h3>{tr("Battle Round ")}{entry.session.state.round}</h3></div>
              <div className="recent-battle-card__format"><RulesSourceBadge source={rulesForSession(entry.session).source} /><span>{entry.session.setup.rulesetId === CAULDRON_RULESET_ID ? tr(rulesForSession(entry.session).title) : entry.session.setup.rulesetId}</span></div>
            </div>
            <div className="recent-battle-card__scores">
              {entry.session.state.turnOrder.map((id) => {
                const player = entry.session.state.players[id]
                return <span key={id}>{player.name}<strong>{totalScore(player)} {tr(" VP")}</strong></span>
              })}
            </div>
            <Link className="button button--small" to={`/battle/${entry.id}`}>{tr("View")}</Link>
          </article>)}
        </div>
      </section>}

      <VisualPreferences />
      <section id="army-library" className="section-block home-armies-section">
        <div className="section-heading"><div><span className="eyebrow">{tr("Army Library")}</span><h2>{tr("Saved rosters")}</h2><Link to="/armies">{tr("Manage My Armies →")}</Link></div><Link className="button" to="/army-import">{tr("Import army")}</Link></div>
        {loading ? <div className="loading-state" role="status">{tr("Loading saved rosters…")}</div> : armies.length === 0 ? (
          <div className="empty-state"><h3>{tr("Your rosters start here")}</h3><p>{tr("Import a New Recruit JSON file. Your armies stay available on this device for your next battle.")}</p></div>
        ) : (
          <div className="army-library">
            {armies.map(({ army }) => (
              <article className="panel library-card" key={army.id}>
                <ArmyBanner army={army} />
                <Link className="button button--small" to={`/army/${encodeURIComponent(army.id)}/appearance`}>{tr("Appearance & photos")}</Link>
                <Link className="button button--small" to={`/army/${encodeURIComponent(army.id)}`}>{tr("Open / Edit")}</Link>
                <div><h3>{army.faction}</h3><p>{army.name}</p></div>
                <div className="library-card__facts"><strong>{army.totalPoints}</strong><span>{tr("PTS")}</span><strong>{army.units.length}</strong><span>{tr("UNITS")}</span></div>
                <div className="roster-actions">
                  <Link className="button button--small" to={`/battle/setup?armyId=${encodeURIComponent(army.id)}`}>{tr("Use")}</Link>
                  <DeleteRosterButton key={`${owner}:${army.id}`} army={army} owner={owner} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
