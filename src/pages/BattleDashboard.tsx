import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArmyTracker } from '../components/battle/ArmyTracker'
import { BattleQuickStatus } from '../components/battle/BattleQuickStatus'
import { BattleLog } from '../components/battle/BattleLog'
import { BattleMenu } from '../components/battle/BattleMenu'
import { BattleSummary } from '../components/battle/BattleSummary'
import { ContextCommandCentre } from '../components/battle/context/ContextCommandCentre'
import { PhaseEndTimingReview } from '../components/battle/context/PhaseEndTimingReview'
import { EndRoundReview } from '../components/battle/EndRoundReview'
import { ObjectivesPanel } from '../components/battle/ObjectivesPanel'
import { humanizePhase, PhaseStepper } from '../components/battle/PhaseStepper'
import { ReactionHoldControl } from '../components/battle/ReactionHoldControl'
import { Scoreboard } from '../components/battle/Scoreboard'
import { SecondaryEndTurnReview } from '../components/battle/SecondaryEndTurnReview'
import { SecondaryDetailPanel } from '../components/battle/SecondaryPanel'
import { SharedPlayerPerspective } from '../components/battle/SharedPlayerPerspective'
import { SharedSessionStatus } from '../components/battle/SharedSessionStatus'
import { downloadBattleDiagnosticReport } from '../diagnostics/battleReport'
import type { Army } from '../domain/army/types'
import { canUndo } from '../domain/battle/selectors'
import { BATTLE_PHASES } from '../domain/battle/types'
import {
  buildBattleContext,
  selectAutomaticReactionPrompt,
  selectReactionPlayersAtCheckpoint,
  selectRelevantStratagemsAtCheckpoint,
  type CurrentTimingCheckpoint,
  type RelevantStratagem,
} from '../domain/context'
import { getCurrentReactionWindow, isBattleFlowPaused } from '../domain/stratagems/battleIntegration'
import { getAvailableStratagems } from '../domain/stratagems/timingEngine'
import type { ReactionContext, StratagemAvailability, TimingTrigger } from '../domain/stratagems/types'
import { ReactionWindowPanel } from '../features/stratagems'
import { getSharedSessionPermissions } from '../multiplayer/permissions'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
import type { RulesDataProvider, RulesDataResolution } from '../rulesData/types'
import {
  CAULDRON_RULESET_ID,
  cauldronReactionPolicy,
  getCurrentRivalPlayerId,
  getPendingEliminationChoice,
  isCauldronEndOfRound,
} from '../rulesets/cauldronFFA3'
import type { SecondaryId } from '../rulesets/cauldronFFA3/secondaryTypes'
import { useBattleStore } from '../stores/battleStore'

type DashboardTab = 'overview' | 'army' | 'objectives' | 'cards' | 'log'

const rulesDataCache = new WeakMap<Army, RulesDataResolution>()

function resolveArmyRules(provider: RulesDataProvider, army: Army): RulesDataResolution {
  const cached = rulesDataCache.get(army)
  if (cached) return cached
  const resolution = provider.resolveArmyStratagems(army)
  rulesDataCache.set(army, resolution)
  return resolution
}

export default function BattleDashboard() {
  const { battleId } = useParams()
  const [tab, setTab] = useState<DashboardTab>('overview')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [turnReviewOpen, setTurnReviewOpen] = useState(false)
  const [phaseEndReviewOpen, setPhaseEndReviewOpen] = useState(false)
  const [terminalLogOpen, setTerminalLogOpen] = useState(false)
  const [contextFocusItemId, setContextFocusItemId] = useState<string | null>(null)
  const [rulesDataProvider, setRulesDataProvider] = useState<RulesDataProvider | null>(null)
  const [rulesDataAttribution, setRulesDataAttribution] = useState<{ label: string; url: string } | null>(null)
  const [rulesDataError, setRulesDataError] = useState<string | null>(null)
  const [armySecondaryFilter, setArmySecondaryFilter] = useState<SecondaryId | null>(null)
  const [armyPreferredPlayerId, setArmyPreferredPlayerId] = useState<string | null>(null)
  const sharedMembership = useSharedSessionStore((state) => state.membership)
  const sharedConnectionStatus = useSharedSessionStore((state) => state.connectionStatus)
  const {
    session,
    loading,
    error,
    loadBattle,
    dispatch,
    useStratagem,
    processReactionTrigger,
    requestReactionHold,
    refineReactionHold,
    cancelReactionWindow,
    passReaction,
    startMissionAction,
    completeMissionAction,
    mulliganSecondary,
    discardSecondaryCards,
    evaluateEndTurnSecondaries,
    resolveEliminationChoice,
    selectPriorityTargetCandidates,
    choosePriorityTarget,
    applyCorrection,
    nextPhase,
    changePlan,
    confirmRound,
    endBattle,
    abandonBattle,
    undo,
    redo,
  } = useBattleStore()

  useEffect(() => {
    if (battleId) void loadBattle(battleId)
  }, [battleId, loadBattle])

  useEffect(() => {
    let active = true
    void import('../rulesData/40kdc')
      .then(({ create40kdcRulesDataProvider, FORTY_KDC_ATTRIBUTION }) => {
        if (active) {
          setRulesDataProvider(create40kdcRulesDataProvider())
          setRulesDataAttribution(FORTY_KDC_ATTRIBUTION)
        }
      })
      .catch(() => {
        if (active) setRulesDataError('Stratagem metadata could not be loaded.')
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!session || session.setup.gameId !== battleId || session.state.status !== 'active' || !rulesDataProvider) return
    const permissions = getSharedSessionPermissions(session, sharedMembership)
    if (!permissions.canControlTurn) return
    const rulesDataByPlayer = Object.fromEntries(session.state.turnOrder.map((playerId) => {
      const armyId = session.state.players[playerId].armyId
      const army = armyId ? session.setup.armies[armyId] : undefined
      return [playerId, army ? resolveArmyRules(rulesDataProvider, army) : null]
    }))
    const reactionPolicy = session.setup.rulesetId === CAULDRON_RULESET_ID ? cauldronReactionPolicy : undefined
    const prompt = selectAutomaticReactionPrompt(session, rulesDataByPlayer, reactionPolicy)
    if (!prompt) return
    const definitionsByPlayer = Object.fromEntries(session.state.turnOrder.map((playerId) => [
      playerId,
      rulesDataByPlayer[playerId]?.definitions ?? [],
    ]))
    processReactionTrigger({
      trigger: prompt.trigger,
      context: prompt.context,
      definitionsByPlayer,
      reactionPolicy,
    })
  }, [battleId, processReactionTrigger, rulesDataProvider, session, sharedMembership])

  useEffect(() => {
    if (!session || session.state.status !== 'active') return
    setTab('overview')
    setPhaseEndReviewOpen(false)
    setContextFocusItemId(null)
    setArmySecondaryFilter(null)
    setArmyPreferredPlayerId(null)
  }, [session?.state.activePlayerId, session?.state.phase, session?.state.round, session?.state.status])

  if (loading && session?.setup.gameId !== battleId) return <div className="page-shell"><div className="loading-state">Restoring battle…</div></div>
  if (!session || session.setup.gameId !== battleId) return <div className="page-shell"><div className="empty-state"><h1>Battle unavailable</h1><p>{error ?? 'The local battle could not be found.'}</p><Link className="button" to="/">Return home</Link></div></div>

  const active = session.state.players[session.state.activePlayerId]
  const battleActive = session.state.status === 'active'
  const guidanceLevel = session.setup.guidanceLevel
  const sharedPermissions = getSharedSessionPermissions(session, sharedMembership)
  const sharedBattle = sharedPermissions.shared
  const canControlTurn = sharedPermissions.canControlTurn
  const canManageLifecycle = sharedPermissions.canManageLifecycle
  const viewerPlayerId = sharedPermissions.viewerPlayerId
  const viewer = viewerPlayerId ? session.state.players[viewerPlayerId] : null
  const cauldron = session.setup.rulesetId === CAULDRON_RULESET_ID
  const reactionPolicy = cauldron ? cauldronReactionPolicy : undefined
  const dashboardTabs: DashboardTab[] = cauldron
    ? ['overview', 'army', 'objectives', 'cards', 'log']
    : ['overview', 'army', 'objectives', 'log']
  const endOfRound = cauldron && isCauldronEndOfRound(session)
  const rivalId = cauldron ? getCurrentRivalPlayerId(session, active.id) : null
  const rival = rivalId ? session.state.players[rivalId] : null
  const playerIds = Object.keys(session.state.players)
  const reactionHoldPlayers = session.state.turnOrder
    .filter((playerId) => playerId !== active.id)
    .map((playerId) => ({ id: playerId, name: session.state.players[playerId].name }))
  const playerNames = Object.fromEntries(Object.values(session.state.players).map((player) => [player.id, player.name]))
  const rulesDataByPlayer = Object.fromEntries(playerIds.map((playerId) => {
    const armyId = session.state.players[playerId].armyId
    const army = armyId ? session.setup.armies[armyId] : undefined
    return [playerId, army && rulesDataProvider ? resolveArmyRules(rulesDataProvider, army) : null]
  }))
  const definitionsByPlayer = Object.fromEntries(playerIds.map((playerId) => [
    playerId,
    rulesDataByPlayer[playerId]?.definitions ?? [],
  ]))
  const battleContext = battleActive ? buildBattleContext({ session, rulesDataByPlayer, reactionPolicy }) : null
  const currentWindow = battleActive ? getCurrentReactionWindow(session) : null
  const windowOptionsByPlayer = currentWindow
    ? Object.fromEntries(Object.values(currentWindow.responses).map((response) => [response.playerId, getAvailableStratagems({
      playerId: response.playerId,
      gameState: session.state,
      phase: currentWindow.phase,
      trigger: currentWindow.trigger,
      context: currentWindow.context,
      definitions: definitionsByPlayer[response.playerId] ?? [],
      reactionOnly: true,
      reactionPolicy,
    }).filter(({ definition }) => response.availableOptionIds.includes(definition.id))]))
    : {}
  const flowPaused = battleActive && isBattleFlowPaused(session)
  const pendingScoringChoice = battleActive && cauldron ? getPendingEliminationChoice(session, active.id) : undefined
  const activeMissionActions = battleActive
    ? Object.values(session.state.missionActions).filter((action) => action.status === 'ACTIVE')
    : []
  const endBlocker = flowPaused
    ? 'Resolve the open reaction window before ending the battle.'
    : pendingScoringChoice
      ? 'Resolve the pending Secondary scoring choice before ending the battle.'
      : activeMissionActions.length > 0
        ? 'Resolve active Mission Actions before ending the battle.'
        : undefined
  const canEndBattle = battleActive && !endBlocker && canManageLifecycle
  const cauldronTurnReview = battleActive && cauldron && session.state.phase === 'END_TURN'
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
  const progressionBlockers = battleContext?.blockingItems.filter((item) => item.type !== 'END_TURN_REVIEW') ?? []

  const phaseEndCheckpointKey = `${session.state.round}:${active.id}:${session.state.phase}`
  const phaseEndCheckpoint: CurrentTimingCheckpoint = {
    triggers: ['PHASE_END'],
    context: {
      actingPlayerId: active.id,
      phaseEndCheckpointKey,
    },
  }
  const phaseEndStratagems = battleActive && session.state.phase !== 'END_TURN'
    ? selectRelevantStratagemsAtCheckpoint(
        session,
        rulesDataByPlayer,
        phaseEndCheckpoint,
        active.id,
        { allowCustomFallback: false },
      )
    : []
  const phaseEndReactionPlayers = battleActive && session.state.phase !== 'END_TURN'
    ? selectReactionPlayersAtCheckpoint(
        session,
        rulesDataByPlayer,
        phaseEndCheckpoint,
        { allowCustomFallback: false, reactionPolicy },
      )
    : []
  const phaseEndHasReactions = phaseEndReactionPlayers.some((player) => player.exactCount + player.potentialCount > 0)
  const phaseEndHasTimingOpportunities = phaseEndStratagems.length > 0 || phaseEndHasReactions
  const phaseEndReactionsHandled = !phaseEndHasReactions || Object.values(session.state.timing.reactionWindows).some((window) => (
    window.trigger === 'PHASE_END'
    && window.context.phaseEndCheckpointKey === phaseEndCheckpointKey
    && window.status === 'RESOLVED'
  ))

  const nextLabel = progressionBlockers.length > 0
    ? `Resolve ${progressionBlockers.length} item${progressionBlockers.length === 1 ? '' : 's'}`
    : cauldronTurnReview
      ? 'End-turn review'
      : session.state.phase === 'END_TURN'
        ? 'End turn'
        : 'Next phase'
  const nextDestination = progressionBlockers.length > 0
    ? progressionBlockers[0].title
    : cauldronTurnReview
      ? 'Scoring & Mission Actions'
      : phaseEndHasTimingOpportunities
        ? guidanceLevel === 'guided' ? 'End-of-phase timing check' : 'End timing available · quick review'
        : phaseIndex < BATTLE_PHASES.length - 1
          ? humanizePhase(BATTLE_PHASES[phaseIndex + 1])
          : nextTurnDestination
  const headerTitle = battleActive
    ? `${phaseLabel} phase`
    : session.state.status === 'completed'
      ? 'Battle complete'
      : 'Battle abandoned'

  function handleContextStratagem(availability: StratagemAvailability) {
    if (!canControlTurn) return
    const trigger = availability.definition.triggers.includes('PHASE_START')
      ? 'PHASE_START'
      : availability.definition.triggers.includes('CUSTOM_CONFIRMATION')
        ? 'CUSTOM_CONFIRMATION'
        : availability.definition.triggers[0] ?? 'CUSTOM_CONFIRMATION'
    useStratagem({
      playerId: active.id,
      definition: availability.definition,
      trigger,
    })
  }

  function handleReactionHoldStart(playerId: string) {
    if (currentWindow) return
    requestReactionHold(playerId, {
      trigger: 'CUSTOM_CONFIRMATION',
      context: {
        actingPlayerId: active.id,
        holdDraft: true,
      },
      definitionsByPlayer,
      reactionPolicy,
    })
  }

  function handleReactionHoldRefine(
    reactionWindowId: string,
    playerId: string,
    trigger: TimingTrigger,
    context: ReactionContext = {},
  ) {
    refineReactionHold(reactionWindowId, playerId, {
      trigger,
      context: {
        ...context,
        actingPlayerId: active.id,
        holdDraft: false,
      },
      definitionsByPlayer,
      reactionPolicy,
    })
  }

  function handlePhaseEndStratagem(option: RelevantStratagem) {
    if (!canControlTurn || currentWindow) return
    useStratagem({
      playerId: active.id,
      definition: option.definition,
      trigger: 'PHASE_END',
      context: phaseEndCheckpoint.context,
    })
  }

  function handleOpenPhaseEndReactions() {
    if (!canControlTurn || currentWindow || !phaseEndHasReactions) return
    processReactionTrigger({
      trigger: 'PHASE_END',
      context: phaseEndCheckpoint.context,
      definitionsByPlayer,
      reactionPolicy,
    })
  }

  function handleFinishPhaseEndReview() {
    if (!canControlTurn || currentWindow) return
    if (guidanceLevel === 'guided' && !phaseEndReactionsHandled) return
    setPhaseEndReviewOpen(false)
    nextPhase()
  }

  function handleNextAction() {
    if (!canControlTurn) return
    if (progressionBlockers.length > 0) {
      setTab('overview')
      setContextFocusItemId(progressionBlockers[0].id)
      return
    }
    if (flowPaused) return
    setContextFocusItemId(null)
    if (cauldronTurnReview) {
      setTurnReviewOpen(true)
      return
    }
    if (phaseEndHasTimingOpportunities) {
      setPhaseEndReviewOpen(true)
      return
    }
    nextPhase()
  }

  function selectDashboardTab(item: DashboardTab) {
    if (item === 'army') setArmyPreferredPlayerId(null)
    setTab(item)
  }

  const reactionWindowPanel = currentWindow ? <ReactionWindowPanel
    window={currentWindow}
    playerNames={playerNames}
    optionsByPlayer={windowOptionsByPlayer}
    sharedMode={sharedBattle}
    viewerPlayerId={viewerPlayerId}
    onUse={(playerId: string, availability: StratagemAvailability) => useStratagem({
      playerId,
      definition: availability.definition,
      trigger: currentWindow.trigger,
      context: currentWindow.context,
      reactionWindowId: currentWindow.id,
      reactionPolicy,
    })}
    onPass={(playerId: string) => passReaction(currentWindow.id, playerId)}
  /> : null

  const sharedReactionHold = sharedBattle && !canControlTurn ? <div className="shared-reaction-hold-shell">
    <ReactionHoldControl
      phase={session.state.phase}
      activePlayerName={active.name}
      players={reactionHoldPlayers}
      session={session}
      definitionsByPlayer={definitionsByPlayer}
      sharedMode
      viewerPlayerId={viewerPlayerId}
      disabled={Boolean(currentWindow)}
      onHoldStart={handleReactionHoldStart}
      onHoldRefine={handleReactionHoldRefine}
      onHoldCancel={cancelReactionWindow}
    />
  </div> : null

  return (
    <div className="battle-page">
      <header className="battle-status">
        <div className="battle-round"><span>Battle round</span><strong>{session.state.round}<small>/ {session.state.maxRounds}</small></strong></div>
        <div className="battle-turn"><span>{battleActive ? `${active.name} turn` : 'Session status'}</span><h1>{headerTitle}</h1></div>
        <div className="battle-context">
          {battleActive && rival && <div className="rival-callout"><span>Current Rival</span><strong>{rival.name}</strong></div>}
          {battleActive && <span className={`mode-badge mode-badge--${guidanceLevel}`}>{guidanceLevel} mode</span>}
          {cauldron && <span className="ruleset-label">Cauldron FFA 3</span>}
          <SharedSessionStatus battleId={session.setup.gameId} />
          {battleActive && <BattleMenu
            session={session}
            canEndBattle={canEndBattle}
            canManageBattle={canManageLifecycle}
            endBlockedReason={endBlocker}
            onOpenLog={() => setTab('log')}
            onExportReport={() => downloadBattleDiagnosticReport(session, useSharedSessionStore.getState())}
            onEndBattle={endBattle}
            onAbandonBattle={abandonBattle}
            onApplyCorrection={applyCorrection}
          />}
        </div>
      </header>

      {!battleActive ? <main className="battle-terminal-content">
        {error && <div className="alert alert--danger battle-alert">{error}</div>}
        <BattleSummary
          session={session}
          logOpen={terminalLogOpen}
          canRestoreSession={!sharedBattle}
          restoreDisabledReason={sharedBattle ? 'Shared-session undo is disabled until synchronized undo is implemented.' : undefined}
          onToggleLog={() => setTerminalLogOpen((current) => !current)}
          onRestoreSession={() => { setTerminalLogOpen(false); undo() }}
        />
        {terminalLogOpen && <div className="battle-terminal-log"><BattleLog session={session} /></div>}
      </main> : <>
        <Scoreboard
          session={session}
          rivalPlayerId={rivalId}
          dispatch={dispatch}
          sharedMode={sharedBattle}
          viewerPlayerId={viewerPlayerId}
        />
        <PhaseStepper phase={session.state.phase} />
        {sharedBattle && sharedConnectionStatus !== 'connected' && <div className="alert battle-alert">Shared sync: {sharedConnectionStatus}. Local changes are retained and will retry.</div>}
        {sharedBattle && canControlTurn && <div className="shared-flow-notice shared-flow-notice--active">Your turn as {viewer?.name ?? active.name}. You control phase progression and end-turn review on this device.</div>}
        {sharedBattle && !canControlTurn && <div className="shared-flow-notice">Connected as {viewer?.name ?? 'player'}. Waiting for {sharedPermissions.waitingForPlayerName ?? active.name} to advance their turn. Your own CP, army state and reaction responses remain yours.</div>}
        {sharedReactionHold}
        {error && <div className="alert alert--danger battle-alert">{error}</div>}

        {reviewOpen ? <EndRoundReview
          session={session}
          onCancel={() => setReviewOpen(false)}
          onConfirm={(confirmations) => { if (canControlTurn) confirmRound(confirmations); setReviewOpen(false) }}
        /> : turnReviewOpen && cauldron ? <SecondaryEndTurnReview
          session={session}
          onCompleteMissionAction={completeMissionAction}
          onEvaluate={evaluateEndTurnSecondaries}
          onDiscard={discardSecondaryCards}
          onCancel={() => setTurnReviewOpen(false)}
          onFinish={() => {
            setTurnReviewOpen(false)
            if (!canControlTurn) return
            if (endOfRound) setReviewOpen(true)
            else nextPhase()
          }}
        /> : phaseEndReviewOpen ? <main className="battle-content phase-end-review-shell">
          {reactionWindowPanel}
          <PhaseEndTimingReview
            phase={session.state.phase}
            stratagems={phaseEndStratagems}
            reactionPlayers={phaseEndReactionPlayers}
            reactionWindowOpen={Boolean(currentWindow)}
            reactionsHandled={phaseEndReactionsHandled}
            enforceReactionWindow={guidanceLevel === 'guided'}
            onUseStratagem={handlePhaseEndStratagem}
            onOpenReactions={handleOpenPhaseEndReactions}
            onContinue={handleFinishPhaseEndReview}
            onCancel={() => { if (!currentWindow) setPhaseEndReviewOpen(false) }}
          />
        </main> : <>
          <nav className="battle-tabs" aria-label="Battle panels">
            {dashboardTabs.map((item) => (
              <button className={tab === item ? 'selected' : ''} key={item} onClick={() => selectDashboardTab(item)}>{item}</button>
            ))}
          </nav>

          <main className="battle-content">
            {reactionWindowPanel}
            {tab === 'overview' && battleContext && <div className="tactical-dashboard tactical-dashboard--context">
              <div className="tactical-column tactical-column--primary">
                <ContextCommandCentre
                  context={battleContext}
                  session={session}
                  dispatch={dispatch}
                  focusItemId={contextFocusItemId}
                  sharedMode={sharedBattle}
                  viewerPlayerId={viewerPlayerId}
                  onStartMissionAction={startMissionAction}
                  onMulligan={mulliganSecondary}
                  onOpenEndTurn={() => { if (canControlTurn) setTurnReviewOpen(true) }}
                  onUseStratagem={handleContextStratagem}
                  onHoldReaction={handleReactionHoldStart}
                  onPassReaction={passReaction}
                  onChangePlan={changePlan}
                  onResolveEliminationChoice={resolveEliminationChoice}
                  onSelectPriorityCandidates={selectPriorityTargetCandidates}
                  onChoosePriorityTarget={choosePriorityTarget}
                  onOpenArmyDetails={(ownerId) => {
                    setArmySecondaryFilter(null)
                    setArmyPreferredPlayerId(ownerId)
                    setTab('army')
                  }}
                />
                {rulesDataProvider && rulesDataAttribution
                  ? <a className="rules-data-attribution" href={rulesDataAttribution.url} target="_blank" rel="noreferrer">{rulesDataAttribution.label}</a>
                  : rulesDataError
                    ? <span className="rules-data-attribution rules-data-attribution--error">{rulesDataError}</span>
                    : <span className="rules-data-attribution">Loading Stratagem metadata…</span>}
              </div>
              <aside className="tactical-column tactical-column--context-aside">
                {sharedBattle && viewerPlayerId && <SharedPlayerPerspective
                  session={session}
                  viewerPlayerId={viewerPlayerId}
                  currentRivalPlayerId={rivalId}
                  showCards={cauldron}
                  onOpenArmy={() => {
                    setArmyPreferredPlayerId(viewerPlayerId)
                    setArmySecondaryFilter(null)
                    setTab('army')
                  }}
                  onOpenCards={() => setTab('cards')}
                />}
                <BattleQuickStatus session={session} onOpenObjectives={() => setTab('objectives')} />
                {!sharedBattle && <ReactionHoldControl
                  phase={session.state.phase}
                  activePlayerName={active.name}
                  players={reactionHoldPlayers}
                  session={session}
                  definitionsByPlayer={definitionsByPlayer}
                  disabled={Boolean(currentWindow)}
                  onHoldStart={handleReactionHoldStart}
                  onHoldRefine={handleReactionHoldRefine}
                  onHoldCancel={cancelReactionWindow}
                />}
              </aside>
            </div>}
            {tab === 'army' && <ArmyTracker
              session={session}
              dispatch={dispatch}
              preferredPlayerId={armyPreferredPlayerId ?? (sharedBattle ? viewerPlayerId : undefined)}
              sharedMode={sharedBattle}
              viewerPlayerId={viewerPlayerId}
              secondaryTargetFilter={armySecondaryFilter}
              onClearSecondaryTargetFilter={() => setArmySecondaryFilter(null)}
            />}
            {tab === 'objectives' && <ObjectivesPanel session={session} dispatch={dispatch} />}
            {tab === 'cards' && cauldron && <SecondaryDetailPanel session={session} playerId={sharedBattle ? viewerPlayerId ?? active.id : active.id} />}
            {tab === 'log' && <BattleLog session={session} />}
          </main>

          <footer className="battle-actions">
            <button disabled={sharedBattle || !canUndo(session.state)} title={sharedBattle ? 'Shared-session undo will be added as a synchronized compensating action.' : undefined} onClick={undo}>Undo</button>
            <button disabled={sharedBattle || session.redoActions.length === 0} title={sharedBattle ? 'Redo is disabled while the battle is shared.' : undefined} onClick={redo}>Redo</button>
            <button
              className="button--gold next-phase"
              disabled={!canControlTurn}
              onClick={handleNextAction}
            >{!canControlTurn ? `Waiting for ${active.name}` : flowPaused && progressionBlockers.length === 0 ? 'Reaction pending' : nextLabel}<span>{!canControlTurn ? `Room ${sharedMembership?.roomCode ?? ''}` : flowPaused && progressionBlockers.length === 0 ? 'Resolve reaction to continue' : nextDestination}</span></button>
          </footer>
        </>}
      </>}
    </div>
  )
}
