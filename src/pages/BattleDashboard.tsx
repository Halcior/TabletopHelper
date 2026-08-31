import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArmyTracker } from '../components/battle/ArmyTracker'
import { BattleLog } from '../components/battle/BattleLog'
import { CauldronPlanPanel } from '../components/battle/CauldronPlanPanel'
import { EndRoundReview } from '../components/battle/EndRoundReview'
import { ObjectivesPanel } from '../components/battle/ObjectivesPanel'
import { PhaseGuidance } from '../components/battle/PhaseGuidance'
import { Scoreboard } from '../components/battle/Scoreboard'
import { canUndo } from '../domain/battle/selectors'
import {
  CAULDRON_RULESET_ID,
  getCurrentRivalPlayerId,
  isCauldronEndOfRound,
} from '../rulesets/cauldronFFA3'
import { useBattleStore } from '../stores/battleStore'

type DashboardTab = 'overview' | 'army' | 'objectives' | 'log'

export default function BattleDashboard() {
  const { battleId } = useParams()
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [reviewOpen, setReviewOpen] = useState(false)
  const {
    session,
    loading,
    error,
    loadBattle,
    dispatch,
    nextPhase,
    changePlan,
    confirmRound,
    undo,
    redo,
  } = useBattleStore()

  useEffect(() => {
    if (battleId) void loadBattle(battleId)
  }, [battleId, loadBattle])

  if (loading && session?.setup.gameId !== battleId) return <div className="page-shell"><div className="loading-state">Restoring battle…</div></div>
  if (!session || session.setup.gameId !== battleId) return <div className="page-shell"><div className="empty-state"><h1>Battle unavailable</h1><p>{error ?? 'The local battle could not be found.'}</p><Link className="button" to="/">Return home</Link></div></div>

  const active = session.state.players[session.state.activePlayerId]
  const cauldron = session.setup.rulesetId === CAULDRON_RULESET_ID
  const endOfRound = cauldron && isCauldronEndOfRound(session)
  const rivalId = cauldron ? getCurrentRivalPlayerId(session, active.id) : null
  const rival = rivalId ? session.state.players[rivalId] : null
  const phaseLabel = session.state.phase.replace('_', ' ')
  const nextLabel = endOfRound ? 'Review round' : session.state.phase === 'END_TURN' ? 'End turn' : 'Next phase'

  return (
    <div className="battle-page">
      <header className="battle-status">
        <div><span className="eyebrow">{cauldron ? 'Cauldron FFA 3 · ' : ''}Round {session.state.round} / {session.state.maxRounds}</span><h1>{active.name} turn</h1><strong>{phaseLabel}</strong></div>
        {rival && <div className="rival-callout"><span>Current Rival</span><strong>{rival.name}</strong></div>}
        <span className={`mode-badge mode-badge--${session.setup.guidanceLevel}`}>{session.setup.guidanceLevel} mode</span>
      </header>
      <Scoreboard session={session} dispatch={dispatch} />
      {error && <div className="alert alert--danger battle-alert">{error}</div>}

      {reviewOpen ? <EndRoundReview
        session={session}
        onCancel={() => setReviewOpen(false)}
        onConfirm={(confirmations) => { confirmRound(confirmations); setReviewOpen(false) }}
      /> : <>
        <nav className="battle-tabs" aria-label="Battle panels">
          {(['overview', 'army', 'objectives', 'log'] as DashboardTab[]).map((item) => (
            <button className={tab === item ? 'selected' : ''} key={item} onClick={() => setTab(item)}>{item}</button>
          ))}
        </nav>

        <main className="battle-content">
          {tab === 'overview' && <>
            <PhaseGuidance session={session} dispatch={dispatch} />
            {cauldron && <CauldronPlanPanel session={session} onChangePlan={changePlan} />}
            <section className="panel current-state-panel">
              <div className="section-heading"><div><span className="eyebrow">Battle state</span><h2>At a glance</h2></div></div>
              <div className="at-a-glance">
                <div><strong>{Object.values(session.state.objectives).filter((objective) => objective.controllerPlayerId === active.id).length}</strong><span>objectives controlled</span></div>
                <div><strong>{Object.values(active.units).filter((unit) => unit.destroyed).length}</strong><span>units destroyed</span></div>
                <div><strong>{session.state.events.length}</strong><span>logged events</span></div>
              </div>
            </section>
          </>}
          {tab === 'army' && <ArmyTracker session={session} dispatch={dispatch} />}
          {tab === 'objectives' && <ObjectivesPanel session={session} dispatch={dispatch} />}
          {tab === 'log' && <BattleLog session={session} />}
        </main>

        <footer className="battle-actions">
          <button disabled={!canUndo(session.state)} onClick={undo}>Undo</button>
          <button disabled={session.redoActions.length === 0} onClick={redo}>Redo</button>
          {session.state.status === 'active'
            ? <button className="button--gold next-phase" onClick={() => endOfRound ? setReviewOpen(true) : nextPhase()}>{nextLabel}<span>{phaseLabel}</span></button>
            : <Link className="button button--gold next-phase" to="/">Battle complete</Link>}
        </footer>
      </>}
    </div>
  )
}
