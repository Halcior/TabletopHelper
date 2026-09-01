import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArmyTracker } from '../components/battle/ArmyTracker'
import { BattleQuickStatus } from '../components/battle/BattleQuickStatus'
import { BattleLog } from '../components/battle/BattleLog'
import { CauldronPlanPanel } from '../components/battle/CauldronPlanPanel'
import { EndRoundReview } from '../components/battle/EndRoundReview'
import { ObjectivesPanel } from '../components/battle/ObjectivesPanel'
import { PhaseGuidance } from '../components/battle/PhaseGuidance'
import { humanizePhase, PhaseStepper } from '../components/battle/PhaseStepper'
import { Scoreboard } from '../components/battle/Scoreboard'
import { canUndo } from '../domain/battle/selectors'
import { BATTLE_PHASES } from '../domain/battle/types'
import { getCurrentReactionWindow, isBattleFlowPaused } from '../domain/stratagems/battleIntegration'
import { getReactionOpportunity } from '../domain/stratagems/reactionEngine'
import { SAMPLE_STRATAGEMS, sampleStratagemsByPlayer } from '../domain/stratagems/sampleData'
import { getAvailableStratagems } from '../domain/stratagems/timingEngine'
import type { StratagemAvailability } from '../domain/stratagems/types'
import {
  AvailableStratagemPanel,
  ReactionStatusPanel,
  ReactionWindowPanel,
} from '../features/stratagems'
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
    useStratagem,
    requestReactionHold,
    passReaction,
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
  const playerIds = Object.keys(session.state.players)
  const playerNames = Object.fromEntries(Object.values(session.state.players).map((player) => [player.id, player.name]))
  const definitionsByPlayer = sampleStratagemsByPlayer(playerIds)
  const currentWindow = getCurrentReactionWindow(session)
  const activeStratagems = getAvailableStratagems({
    playerId: active.id,
    gameState: session.state,
    trigger: 'PHASE_START',
    definitions: SAMPLE_STRATAGEMS,
  }).filter(({ definition }) => !definition.reaction)
  const reactionOpportunity = getReactionOpportunity({
    gameState: session.state,
    trigger: 'PHASE_START',
    definitionsByPlayer,
  })
  const windowOptionsByPlayer = currentWindow
    ? Object.fromEntries(Object.values(currentWindow.responses).map((response) => [response.playerId, getAvailableStratagems({
      playerId: response.playerId,
      gameState: session.state,
      phase: currentWindow.phase,
      trigger: currentWindow.trigger,
      context: currentWindow.context,
      definitions: definitionsByPlayer[response.playerId] ?? [],
      reactionOnly: true,
    }).filter(({ definition }) => response.availableOptionIds.includes(definition.id))]))
    : {}
  const flowPaused = isBattleFlowPaused(session)
  const phaseLabel = humanizePhase(session.state.phase)
  const phaseIndex = BATTLE_PHASES.indexOf(session.state.phase)
  const activePlayerIndex = session.state.turnOrder.indexOf(active.id)
  const lastPlayerTurn = activePlayerIndex === session.state.turnOrder.length - 1
  const nextPlayerId = session.state.turnOrder[(activePlayerIndex + 1) % session.state.turnOrder.length]
  const nextPlayer = session.state.players[nextPlayerId]
  const nextTurnDestination = lastPlayerTurn
    ? session.state.round >= session.state.maxRounds
      ? 'Battle complete'
      : `Round ${session.state.round + 1} · ${nextPlayer.name}`
    : `${nextPlayer.name} · Command`
  const nextLabel = endOfRound ? 'Review round' : session.state.phase === 'END_TURN' ? 'End turn' : 'Next phase'
  const nextDestination = flowPaused
    ? 'Resolve reaction to continue'
    : endOfRound
      ? 'Confirm scores'
      : phaseIndex < BATTLE_PHASES.length - 1
        ? humanizePhase(BATTLE_PHASES[phaseIndex + 1])
        : nextTurnDestination

  return (
    <div className="battle-page">
      <header className="battle-status">
        <div className="battle-round"><span>Battle round</span><strong>{session.state.round}<small>/ {session.state.maxRounds}</small></strong></div>
        <div className="battle-turn"><span>{active.name} turn</span><h1>{phaseLabel} phase</h1></div>
        <div className="battle-context">
          {rival && <div className="rival-callout"><span>Current Rival</span><strong>{rival.name}</strong></div>}
          <span className={`mode-badge mode-badge--${session.setup.guidanceLevel}`}>{session.setup.guidanceLevel} mode</span>
          {cauldron && <span className="ruleset-label">Cauldron FFA 3</span>}
        </div>
      </header>
      <Scoreboard session={session} rivalPlayerId={rivalId} dispatch={dispatch} />
      <PhaseStepper phase={session.state.phase} />
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
          {currentWindow && <ReactionWindowPanel
            window={currentWindow}
            playerNames={playerNames}
            optionsByPlayer={windowOptionsByPlayer}
            onUse={(playerId: string, availability: StratagemAvailability) => useStratagem({
              playerId,
              definition: availability.definition,
              trigger: currentWindow.trigger,
              context: currentWindow.context,
              reactionWindowId: currentWindow.id,
            })}
            onPass={(playerId: string) => passReaction(currentWindow.id, playerId)}
          />}
          {tab === 'overview' && <>
            <div className="tactical-dashboard">
              <div className="tactical-column tactical-column--primary">
                <PhaseGuidance session={session} dispatch={dispatch} />
                {cauldron && <CauldronPlanPanel session={session} onChangePlan={changePlan} />}
                <AvailableStratagemPanel
                  playerName={active.name}
                  stratagems={activeStratagems}
                  onUse={(availability) => useStratagem({
                    playerId: active.id,
                    definition: availability.definition,
                    trigger: 'PHASE_START',
                  })}
                />
              </div>
              <aside className="tactical-column">
                {!currentWindow && <ReactionStatusPanel
                  opportunity={reactionOpportunity}
                  playerNames={playerNames}
                  mode={session.setup.guidanceLevel}
                  onHold={(playerId) => requestReactionHold(playerId, {
                    trigger: 'CUSTOM_CONFIRMATION',
                    context: { actingPlayerId: active.id },
                    definitionsByPlayer,
                  })}
                />}
                <BattleQuickStatus session={session} onOpenObjectives={() => setTab('objectives')} />
              </aside>
            </div>
          </>}
          {tab === 'army' && <ArmyTracker session={session} dispatch={dispatch} />}
          {tab === 'objectives' && <ObjectivesPanel session={session} dispatch={dispatch} />}
          {tab === 'log' && <BattleLog session={session} />}
        </main>

        <footer className="battle-actions">
          <button disabled={!canUndo(session.state)} onClick={undo}>Undo</button>
          <button disabled={session.redoActions.length === 0} onClick={redo}>Redo</button>
          {session.state.status === 'active'
            ? <button
              className="button--gold next-phase"
              disabled={flowPaused}
              onClick={() => endOfRound ? setReviewOpen(true) : nextPhase()}
            >{flowPaused ? 'Reaction pending' : nextLabel}<span>{nextDestination}</span></button>
            : <Link className="button button--gold next-phase" to="/">Battle complete</Link>}
        </footer>
      </>}
    </div>
  )
}
