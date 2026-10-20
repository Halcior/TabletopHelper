import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AppIcon, type AppIconName } from '../components/AppIcon'
import { CommandPopover } from '../components/ui/CommandPopover'
import { InfoDisclosure } from '../components/ui/InfoDisclosure'
import { RulesSourceBadge } from '../components/ui/RulesSourceBadge'
import { rulesForSession } from '../rulesets/rulesSource'
import { CommandDialog } from '../components/ui/CommandDialog'
import { ArmyTracker } from '../components/battle/ArmyTracker'
import { BattleQuickStatus } from '../components/battle/BattleQuickStatus'
import { BattleLog } from '../components/battle/BattleLog'
import { BattleReport } from '../components/battle/BattleReport'
import { useLiveBattleFeedback } from '../components/battle/useLiveBattleFeedback'
import { BattleMenu } from '../components/battle/BattleMenu'
import { BattleSummary } from '../components/battle/BattleSummary'
import { ContextCommandCentre } from '../components/battle/context/ContextCommandCentre'
import { EndRoundReview } from '../components/battle/EndRoundReview'
import { ObjectivesPanel } from '../components/battle/ObjectivesPanel'
import { humanizePhase, PhaseStepper } from '../components/battle/PhaseStepper'
import { doublesScorekeeperId, doublesForceForPlayer } from '../domain/battle/doubles'
import { Scoreboard } from '../components/battle/Scoreboard'
import { SecondaryEndTurnReview } from '../components/battle/SecondaryEndTurnReview'
import { SecondaryDetailPanel } from '../components/battle/SecondaryPanel'
import { OfficialSecondaryPanel } from '../components/battle/OfficialSecondaryPanel'
import { OfficialPrimaryPanel } from '../components/battle/OfficialPrimaryPanel'
import { DuelPrimaryPanel } from '../components/battle/DuelPrimaryPanel'
import { SharedPlayerPerspective } from '../components/battle/SharedPlayerPerspective'
import { SharedSessionStatus } from '../components/battle/SharedSessionStatus'
import { SharedSyncWarning } from '../components/battle/SharedSyncWarning'
import { downloadBattleDiagnosticReport } from '../diagnostics/battleReport'
import { canUndo } from '../domain/battle/selectors'
import { BATTLE_PHASES } from '../domain/battle/types'
import { buildBattleContext } from '../domain/context'
import { selectNextBattleAction } from '../domain/context/progression'
import { getCurrentReactionWindow, isBattleFlowPaused } from '../domain/stratagems/battleIntegration'
import { getSharedSessionPermissions } from '../multiplayer/permissions'
import { sharedBattleHasStarted } from '../multiplayer/sharedLobby'
import { useSharedSessionStore } from '../multiplayer/sharedSessionStore'
import {
  CAULDRON_RULESET_ID,
  getCurrentRivalPlayerId,
  getPendingEliminationChoice,
  isCauldronEndOfRound,
  isOfficialPrimary,
  getOfficialPrimaryId,
  OFFICIAL_PRIMARY_MISSIONS,
  isDuelPrimary,
  getDuelMission,
  getDuelConditions,
  hasDuelOwnTurnCommit,
  secondaryStrategyFor,
} from '../rulesets/cauldronFFA3'
import type { SecondaryId } from '../rulesets/cauldronFFA3/secondaryTypes'
import { isOfficialSecondary } from '../rulesets/cauldronFFA3/secondary'
import { useBattleStore } from '../stores/battleStore'

type DashboardTab = 'overview' | 'army' | 'objectives' | 'cards' | 'log' | 'report'

const DASHBOARD_TAB_ICONS: Record<DashboardTab, AppIconName> = {
  overview: 'overview',
  army: 'army',
  objectives: 'objectives',
  cards: 'cards',
  log: 'log',
  report: 'report',
}

export default function BattleDashboard() {
  const { battleId } = useParams()
  const [tab, setSelectedTab] = useState<DashboardTab>('overview')
  const [visitedPanels, setVisitedPanels] = useState<Set<DashboardTab>>(() => new Set(['overview']))
  const [moreOpen, setMoreOpen] = useState(false)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const [replayRequest, setReplayRequest] = useState(0)
  const [boardEditing, setBoardEditing] = useState(false)
  const [sessionDetailsOpen, setSessionDetailsOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const [headerHeight, setHeaderHeight] = useState(88)
  const panelScroll = useRef<Partial<Record<DashboardTab, number>>>({})
  function setTab(item: DashboardTab) {
    if (item !== tab) {
      panelScroll.current[tab] = window.scrollY
      requestAnimationFrame(() => window.scrollTo({ top: panelScroll.current[item] ?? 0, behavior: 'instant' }))
    }
    setSelectedTab(item)
    setVisitedPanels((current) => current.has(item) ? current : new Set([...current, item]))
    setMoreOpen(false)
  }
  const [reviewOpen, setReviewOpen] = useState(false)
  const [turnReviewOpen, setTurnReviewOpen] = useState(false)
  const [terminalLogOpen, setTerminalLogOpen] = useState(false)
  const [terminalReportOpen, setTerminalReportOpen] = useState(false)
  const [terminalBoardOpen, setTerminalBoardOpen] = useState(false)
  const [contextFocusItemId, setContextFocusItemId] = useState<string | null>(null)
  const [armySecondaryFilter, setArmySecondaryFilter] = useState<SecondaryId | null>(null)
  const [armyPreferredPlayerId, setArmyPreferredPlayerId] = useState<string | null>(null)
  const sharedMembership = useSharedSessionStore((state) => state.membership)
  const sharedRoomStartedAt = useSharedSessionStore((state) => state.roomStartedAt)
  const {
    session,
    loading,
    error,
    loadBattle,
    dispatch,
    cancelReactionWindow,
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
    if (!session || session.state.status !== 'active') return
    setTab('overview')
    setContextFocusItemId(null)
    setArmySecondaryFilter(null)
    setArmyPreferredPlayerId(null)
  }, [session?.state.activePlayerId, session?.state.phase, session?.state.round, session?.state.status])

  const liveFeedback = useLiveBattleFeedback(session)
  useEffect(() => {
    if (!headerRef.current) return
    const observer = new ResizeObserver(([entry]) => setHeaderHeight(entry.target.getBoundingClientRect().height))
    observer.observe(headerRef.current)
    return () => observer.disconnect()
  }, [session?.setup.gameId, session?.state.status, loading])
  if (loading && session?.setup.gameId !== battleId) return <div className="page-shell"><div className="loading-state" role="status">Restoring battle…</div></div>
  if (!session || session.setup.gameId !== battleId) return <div className="page-shell"><div className="empty-state"><h1>Battle unavailable</h1><p>{error ?? 'The local battle could not be found.'}</p><Link className="button" to="/">Return home</Link></div></div>
  if (sharedMembership?.battleId === session.setup.gameId && !sharedBattleHasStarted(sharedRoomStartedAt)) {
    return <Navigate to={`/shared?room=${sharedMembership.roomCode}`} replace />
  }

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
  const officialSecondary = cauldron && isOfficialSecondary(session)
  const officialPrimary = cauldron && isOfficialPrimary(session)
  const duelPrimary = cauldron && isDuelPrimary(session)
  const battleRules = rulesForSession(session)
  const cauldronModeLabel = battleRules.title
  const dashboardTabs: DashboardTab[] = cauldron
    ? ['overview', 'army', 'objectives', 'cards', 'log', 'report']
    : ['overview', 'army', 'objectives', 'log', 'report']
  const endOfRound = cauldron && isCauldronEndOfRound(session)
  const rivalId = cauldron ? getCurrentRivalPlayerId(session, active.id) : null
  const rival = rivalId ? session.state.players[rivalId] : null
  const primaryViewerId = sharedBattle && viewerPlayerId ? doublesScorekeeperId(session.setup, viewerPlayerId) : active.id
  const duelReviewWindow = duelPrimary ? (() => {
    if (session.state.phase === 'COMMAND' && session.state.round >= 2 && session.state.round < 5 && primaryViewerId === active.id) return 'command' as const
    if (session.state.phase === 'END_TURN') {
      if (session.state.round === 5 && active.id === session.state.turnOrder.at(-1)
        && session.state.turnOrder.every((id) => hasDuelOwnTurnCommit(session, id))) return 'battle' as const
      if (primaryViewerId === active.id || getDuelConditions(session, primaryViewerId, 'turn').some((condition) => condition.window === 'either')) return 'turn' as const
    }
    return undefined
  })() : undefined
  const activeSideName = doublesForceForPlayer(session.setup, active.id)?.name ?? active.name
  const rivalSideName = rivalId ? doublesForceForPlayer(session.setup, rivalId)?.name ?? rival?.name : null
  const battleContext = battleActive ? buildBattleContext({ session }) : null
  const currentWindow = battleActive ? getCurrentReactionWindow(session) : null
  const canCloseLegacyPause = !sharedBattle || (currentWindow?.requestedByPlayerId
    ? viewerPlayerId === currentWindow.requestedByPlayerId || Boolean(sharedMembership?.isHost)
    : canControlTurn)
  const flowPaused = battleActive && isBattleFlowPaused(session)
  const pendingScoringChoice = battleActive && cauldron ? getPendingEliminationChoice(session, active.id) : undefined
  const activeMissionActions = battleActive
    ? Object.values(session.state.missionActions).filter((action) => action.status === 'ACTIVE')
    : []
  const endBlocker = flowPaused
    ? 'Close the saved legacy pause before ending the battle.'
    : pendingScoringChoice
      ? 'Resolve the pending Secondary scoring choice before ending the battle.'
      : activeMissionActions.length > 0
        ? 'Resolve active Mission Actions before ending the battle.'
        : undefined
  const canEndBattle = battleActive && !endBlocker && canManageLifecycle
  const cauldronTurnReview = battleActive && cauldron && session.state.phase === 'END_TURN'
  const phaseLabel = humanizePhase(session.state.phase)
  const phaseIndex = BATTLE_PHASES.indexOf(session.state.phase)
  const activePlayerIndex = Math.max(0, session.state.turnOrder.indexOf(active.id))
  const lastPlayerTurn = activePlayerIndex === session.state.turnOrder.length - 1
  const nextPlayerId = session.state.turnOrder[(activePlayerIndex + 1) % session.state.turnOrder.length]
  const nextPlayer = session.state.players[nextPlayerId]
  const nextTurnDestination = lastPlayerTurn
    ? session.state.round >= session.state.maxRounds
      ? 'Battle complete'
      : `Round ${session.state.round + 1} · ${nextPlayer.name}`
    : `${nextPlayer.name} · Command`
  const progressionBlockers = battleContext?.blockingItems.filter((item) => item.type !== 'END_TURN_REVIEW' && item.source !== 'REACTION') ?? []

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
      : phaseIndex < BATTLE_PHASES.length - 1
        ? humanizePhase(BATTLE_PHASES[phaseIndex + 1])
        : nextTurnDestination
  const headerTitle = battleActive
    ? `${phaseLabel} phase`
    : session.state.status === 'completed'
      ? 'Battle complete'
      : 'Battle abandoned'

  function handleNextAction() {
    if (!canControlTurn) return
    const action = selectNextBattleAction({
      blockerCount: progressionBlockers.length,
      flowPaused,
      endTurnReview: cauldronTurnReview,
      phaseEndHasTimingOpportunities: false,
      guidanceLevel,
    })
    if (action === 'FOCUS_BLOCKER') {
      setTab('overview')
      setContextFocusItemId(progressionBlockers[0].id)
      return
    }
    if (action === 'WAIT_REACTION') return
    setContextFocusItemId(null)
    if (action === 'OPEN_END_TURN_REVIEW') {
      setTurnReviewOpen(true)
      return
    }
    nextPhase()
  }

  function selectDashboardTab(item: DashboardTab) {
    if (item === 'army') setArmyPreferredPlayerId(null)
    setTab(item)
  }

  return (
    <div className="battle-page" style={{ '--battle-hud-height': `${headerHeight}px` } as CSSProperties}>
      <header ref={headerRef} className={`battle-status battle-status--player-${activePlayerIndex}${liveFeedback.phaseChanged ? ' battle-transition-live' : ''}`}>
        <div className="battle-round"><span>Battle round</span><strong>{session.state.round}<small>/ {session.state.maxRounds}</small></strong></div>
        <div className="battle-turn">
          <span className="battle-turn__eyebrow"><span className="battle-wordmark">Tabletop<strong>Helper</strong></span><span>{battleActive ? `${active.name} turn` : 'Session status'}</span></span>
          <h1 aria-label={headerTitle}><span className="hud-round">Round {session.state.round} / {session.state.maxRounds} · </span>{headerTitle}</h1>
          {battleActive && <div className="battle-turn__mobile-meta" aria-label={`Active commander ${active.name}${rival ? `, Rival ${rival.name}` : ''}`}>
            <strong>Active: {active.name}</strong>
            {rival && <span>Rival: {rival.name}</span>}
          </div>}
        </div>
        <div className="battle-context">
          <InfoDisclosure label="Session details" className="hud-session-details">
          <RulesSourceBadge source={battleRules.source} />
          {battleActive && rival && <div className="rival-callout"><span>Current Rival</span><strong>{rival.name}</strong></div>}
          {battleActive && <span className={`mode-badge mode-badge--${guidanceLevel}`}>{guidanceLevel} mode</span>}
          {cauldron && <span className="ruleset-label">{cauldronModeLabel}</span>}
          {officialSecondary && <span className="ruleset-label">Chapter Approved · {secondaryStrategyFor(session, primaryViewerId) === 'fixed' ? 'Fixed' : 'Tactical'}</span>}
          {officialPrimary && <span className="ruleset-label">Primary FFA · {OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, active.id)].name}</span>}
          {duelPrimary && <span className="ruleset-label">Primary · {getDuelMission(session, active.id).name}</span>}
          </InfoDisclosure>
          <SharedSessionStatus battleId={session.setup.gameId} />
          {battleActive && <BattleMenu
            session={session}
            canEndBattle={canEndBattle}
            canManageBattle={canManageLifecycle}
            canUndoAction={!sharedBattle && canUndo(session.state)}
            canRedoAction={!sharedBattle && session.redoActions.length > 0}
            endBlockedReason={endBlocker}
            onOpenLog={() => setTab('log')}
            onOpenReport={() => setTab('report')}
            onExportReport={() => downloadBattleDiagnosticReport(session, useSharedSessionStore.getState())}
            onUndo={undo}
            onRedo={redo}
            onEndBattle={endBattle}
            onAbandonBattle={abandonBattle}
            onApplyCorrection={applyCorrection}
          />}
        </div>
      </header>
      {battleActive && <div className="battle-round-progress" role="progressbar" aria-label="Battle round progress" aria-valuemin={0} aria-valuemax={session.setup.turnOrder.length * BATTLE_PHASES.length} aria-valuenow={activePlayerIndex * BATTLE_PHASES.length + BATTLE_PHASES.indexOf(session.state.phase) + 1} aria-valuetext={`Round ${session.state.round}, ${active.name}, ${phaseLabel}`}><span style={{ transform: `scaleX(${(activePlayerIndex * BATTLE_PHASES.length + BATTLE_PHASES.indexOf(session.state.phase) + 1) / (session.setup.turnOrder.length * BATTLE_PHASES.length)})` }} /></div>}
      {liveFeedback.kills.length > 0 && <aside className="battle-kill-notice" role="status" aria-live="polite"><AppIcon name="eliminate" /><div>{liveFeedback.kills.map((kill) => <p key={kill}>{kill}</p>)}</div><button onClick={() => setTab('log')}>Chronicle</button></aside>}

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
        <button className="terminal-report-toggle" onClick={() => setTerminalReportOpen((current) => !current)}>{terminalReportOpen ? 'Hide Battle Report' : 'View Battle Report'}</button>
        {terminalReportOpen && <BattleReport session={session} />}
        <button className="terminal-report-toggle" onClick={() => setTerminalBoardOpen((current) => !current)}>{terminalBoardOpen ? 'Hide battlefield replay' : 'View battlefield replay'}</button>
        {terminalBoardOpen && <ObjectivesPanel session={session} dispatch={dispatch} />}
        {terminalLogOpen && <div className="battle-terminal-log"><BattleLog session={session} /></div>}
      </main> : <>
        <Scoreboard
          session={session}
          rivalPlayerId={rivalId}
          dispatch={dispatch}
          sharedMode={sharedBattle}
          viewerPlayerId={viewerPlayerId}
          feedback={liveFeedback}
        />
        <PhaseStepper phase={session.state.phase} />
        {sharedBattle && <SharedSyncWarning battleId={session.setup.gameId} />}
        {sharedBattle && <div className={`shared-flow-notice${canControlTurn ? ' shared-flow-notice--active' : ''}`}>{canControlTurn ? `Your turn · ${viewer?.name ?? active.name}` : `Waiting for ${sharedPermissions.waitingForPlayerName ?? active.name} · playing as ${viewer?.name ?? 'player'}`}</div>}
        {currentWindow && <section className="panel legacy-reaction-recovery"><p>This saved battle has an unfinished legacy reaction pause.</p><button disabled={!canCloseLegacyPause} onClick={() => cancelReactionWindow(currentWindow.id)}>Close legacy pause</button></section>}
        {error && <div className="alert alert--danger battle-alert">{error}</div>}

        {reviewOpen ? <EndRoundReview
          session={session}
          sharedBattle={sharedBattle}
          onCancel={() => setReviewOpen(false)}
          onConfirm={(confirmations) => { if (canControlTurn) confirmRound(confirmations); setReviewOpen(false) }}
        /> : turnReviewOpen && cauldron ? <SecondaryEndTurnReview
          session={session}
          sharedBattle={sharedBattle}
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
        /> : <>
          <nav className="battle-tabs" aria-label="Battle panels">
            {dashboardTabs.map((item) => (
              <button aria-pressed={tab === item} className={`${tab === item ? 'selected ' : ''}${['log', 'report'].includes(item) ? 'battle-tabs__desktop' : ''}`} key={item} onClick={() => selectDashboardTab(item)}><AppIcon name={DASHBOARD_TAB_ICONS[item]} /><span>{item === 'overview' ? 'Battle' : item === 'log' ? 'Chronicle' : item.charAt(0).toUpperCase() + item.slice(1)}</span></button>
            ))}
            <button ref={moreTrigger} aria-haspopup="menu" aria-expanded={moreOpen} className={`battle-tabs__more${['log', 'report'].includes(tab) ? ' selected' : ''}`} onClick={() => setMoreOpen((current) => !current)}><AppIcon name="more" /><span>More</span></button>
          </nav>
          {moreOpen && <CommandPopover label="More battle tools" role="menu" trigger={moreTrigger} onClose={() => setMoreOpen(false)} className="battle-more-popover">
            <button role="menuitem" onClick={() => setTab('log')}><AppIcon name="log" />Battle Chronicle</button>
            <button role="menuitem" disabled={boardEditing} title={boardEditing ? 'Save or cancel layout edits first' : undefined} onClick={() => { setTab('objectives'); setReplayRequest((current) => current + 1) }}><AppIcon name="replay" />Battle Replay</button>
            <button role="menuitem" onClick={() => setTab('report')}><AppIcon name="report" />Battle Report</button>
            <button role="menuitem" onClick={() => { setMoreOpen(false); setSessionDetailsOpen(true) }}><AppIcon name="mission" />Session details</button>
            <button role="menuitem" onClick={() => { setMoreOpen(false); downloadBattleDiagnosticReport(session, useSharedSessionStore.getState()) }}><AppIcon name="import" />Export diagnostics</button>
          </CommandPopover>}
          {sessionDetailsOpen && <CommandDialog label="Session details" onClose={() => setSessionDetailsOpen(false)}><section className="panel"><div className="command-popover__heading"><h2>Session details</h2><button aria-label="Close session details" onClick={() => setSessionDetailsOpen(false)}>×</button></div><RulesSourceBadge source={battleRules.source} /><p>{cauldronModeLabel}</p><p className="context-note">{battleRules.description}</p><p>{guidanceLevel} mode · Round {session.state.round} / {session.state.maxRounds}</p>{rival && <p>{session.setup.doubles ? 'Opposing force' : 'Current Rival'}: {rivalSideName}</p>}{officialPrimary && <p>Primary: {OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, active.id)].name}</p>}{duelPrimary && <p>Primary: {getDuelMission(session, active.id).name}</p>}{officialSecondary && <p>Chapter Approved · {secondaryStrategyFor(session, primaryViewerId) === 'fixed' ? 'Fixed' : 'Tactical'}</p>}</section></CommandDialog>}

          <main className="battle-content">
            <section className="battle-panel" hidden={tab !== 'overview'} aria-label="Battle overview">
            {battleContext && <div className="tactical-dashboard tactical-dashboard--context">
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
                {officialPrimary && <OfficialPrimaryPanel session={session} playerId={sharedBattle ? viewerPlayerId ?? active.id : active.id} />}
                {duelPrimary && <DuelPrimaryPanel session={session} playerId={primaryViewerId} window={duelReviewWindow} editable={!sharedBattle || Boolean(viewerPlayerId)} />}
                {officialSecondary && <OfficialSecondaryPanel session={session} playerId={primaryViewerId} editable={!sharedBattle || viewerPlayerId === (viewerPlayerId ?? active.id)} />}
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
              </aside>
            </div>}
            </section>
            {visitedPanels.has('army') && <section className="battle-panel" hidden={tab !== 'army'} aria-label="Army"><ArmyTracker
              session={session}
              dispatch={dispatch}
              preferredPlayerId={armyPreferredPlayerId ?? (sharedBattle ? viewerPlayerId : undefined)}
              sharedMode={sharedBattle}
              viewerPlayerId={viewerPlayerId}
              secondaryTargetFilter={armySecondaryFilter}
              onClearSecondaryTargetFilter={() => setArmySecondaryFilter(null)}
            /></section>}
            {visitedPanels.has('objectives') && <section className="battle-panel" hidden={tab !== 'objectives'} aria-label="Objectives"><ObjectivesPanel session={session} dispatch={dispatch} liveObjectiveIds={liveFeedback.objectiveIds} replayRequest={replayRequest} onEditingChange={setBoardEditing} active={tab === 'objectives'} /></section>}
            {visitedPanels.has('cards') && cauldron && <section className="battle-panel" hidden={tab !== 'cards'} aria-label="Mission cards">
              {officialPrimary && <OfficialPrimaryPanel session={session} playerId={sharedBattle ? viewerPlayerId ?? active.id : active.id} />}
              {duelPrimary && <DuelPrimaryPanel session={session} playerId={primaryViewerId} window={duelReviewWindow} editable={!sharedBattle || Boolean(viewerPlayerId)} />}
              {officialSecondary
                ? <OfficialSecondaryPanel session={session} playerId={primaryViewerId} editable={!sharedBattle || Boolean(viewerPlayerId)} />
                : <SecondaryDetailPanel session={session} playerId={sharedBattle ? viewerPlayerId ?? active.id : active.id} />}
            </section>}
            {visitedPanels.has('log') && <section className="battle-panel" hidden={tab !== 'log'} aria-label="Battle Chronicle"><BattleLog session={session} /></section>}
            {visitedPanels.has('report') && <section className="battle-panel" hidden={tab !== 'report'} aria-label="Battle Report"><BattleReport session={session} /></section>}
          </main>

          <footer className="battle-actions battle-actions--primary">
            <button
              className="button--gold next-phase"
              disabled={!canControlTurn}
              onClick={handleNextAction}
            ><span className="next-phase__copy"><strong>{!canControlTurn ? `Waiting for ${active.name}` : flowPaused && progressionBlockers.length === 0 ? 'Legacy pause' : nextLabel}</strong><small>{!canControlTurn ? `Room ${sharedMembership?.roomCode ?? ''}` : flowPaused && progressionBlockers.length === 0 ? 'Close legacy pause to continue' : nextDestination}</small></span><AppIcon name="next" className="next-phase__icon" /></button>
          </footer>
        </>}
      </>}
    </div>
  )
}
