import { t as tr } from '../features/i18n/locale'
import { TableMode } from '../components/battle/TableMode'
import { BattleClock } from '../features/battleClock/BattleClock'
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
import { RivalRotationNotice } from '../components/battle/RivalRotationNotice'
import { BattleFocus } from '../components/battle/BattleFocus'
import { QuickDamagePanel } from '../components/battle/QuickDamagePanel'
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
  const [tableMode, setTableMode] = useState(false)
  const [quickDamageOpen, setQuickDamageOpen] = useState(false)
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
  const sharedRestore = useSharedSessionStore((state) => state.restoreForBattle)
  const sharedRestoreError = useSharedSessionStore((state) => state.error)
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

  // Restore before the lobby guard. A hard reload starts with an unknown room
  // status; redirecting at that point unmounts the status component that used
  // to initiate restore, leaving a live battle on the waiting-room screen.
  useEffect(() => {
    if (!battleId) return
    const restore = () => { void sharedRestore(battleId) }
    restore()
    window.addEventListener('online', restore)
    return () => window.removeEventListener('online', restore)
  }, [battleId, sharedRestore])

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
  if (loading && session?.setup.gameId !== battleId) return <div className="page-shell"><div className="loading-state" role="status">{tr("Restoring battle…")}</div></div>
  if (!session || session.setup.gameId !== battleId) return <div className="page-shell"><div className="empty-state"><h1>{tr("Battle unavailable")}</h1><p>{tr(error) ?? tr('The local battle could not be found.')}</p><Link className="button" to="/">{tr("Return home")}</Link></div></div>
  if (sharedMembership?.battleId === session.setup.gameId && sharedRoomStartedAt === undefined) {
    return <div className="page-shell"><section className="panel" role="status"><h1>{tr("Restoring shared battle…")}</h1>
      {sharedRestoreError && <p>{sharedRestoreError}</p>}
      <button onClick={() => void sharedRestore(session.setup.gameId)}>{tr("Retry connection")}</button>
      <Link className="button" to={`/shared?room=${sharedMembership.roomCode}`}>{tr("Open room")}</Link>
    </section></div>
  }
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

  if (tableMode) return <TableMode session={session} onClose={() => setTableMode(false)} />

  return (
    <div className="battle-page" style={{ '--battle-hud-height': `${headerHeight}px` } as CSSProperties}>
      {quickDamageOpen && <QuickDamagePanel key={session.setup.gameId} session={session} dispatch={dispatch} shared={sharedBattle} viewerId={viewerPlayerId} onClose={() => setQuickDamageOpen(false)} />}
      <header ref={headerRef} className={`battle-status battle-status--player-${activePlayerIndex}${liveFeedback.phaseChanged ? ' battle-transition-live' : ''}`}>
        <div className="battle-round"><span>{tr("Battle round")}</span><strong>{session.state.round}<small>/ {session.state.maxRounds}</small></strong></div>
        <div className="battle-turn">
          <span className="battle-turn__eyebrow"><span className="battle-wordmark">Tabletop<strong>Helper</strong></span><span>{battleActive ? tr(`${active.name} turn`, "{0} turn") : tr('Session status')}</span></span>
          <h1 aria-label={tr(headerTitle)}><span className="hud-round">{tr("Round ")}{session.state.round} / {session.state.maxRounds} · </span>{tr(headerTitle)}</h1>
          {battleActive && <div className="battle-turn__mobile-meta" aria-label={tr(`Active commander ${active.name}${rival ? `, Rival ${rival.name}` : ''}`, "Active commander {0}{1}")}>
            <strong>{tr("Active: ")}{active.name}</strong>
            {rival && <span>{cauldron && session.setup.players.length === 3 ? tr('Primary Rival') : tr('Rival')}: {rival.name}</span>}
          </div>}
        </div>
        <div className="battle-context">
          <InfoDisclosure label={tr("Session details")} className="hud-session-details">
          <RulesSourceBadge source={battleRules.source} />
          {battleActive && rival && <div className="rival-callout"><span>{tr("Current Rival")}</span><strong>{rival.name}</strong></div>}
          {battleActive && <span className={`mode-badge mode-badge--${guidanceLevel}`}>{guidanceLevel} {tr(" mode")}</span>}
          {cauldron && <span className="ruleset-label">{cauldronModeLabel}</span>}
          {officialSecondary && <span className="ruleset-label">{tr("Chapter Approved · ")}{secondaryStrategyFor(session, primaryViewerId) === 'fixed' ? tr('Fixed') : tr('Tactical')}</span>}
          {officialPrimary && <span className="ruleset-label">{tr("Primary FFA · ")}{OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, active.id)].name}</span>}
          {duelPrimary && <span className="ruleset-label">{tr("Primary · ")}{getDuelMission(session, active.id).name}</span>}
          </InfoDisclosure>
          <SharedSessionStatus battleId={session.setup.gameId} />
          {battleActive && <BattleMenu
            session={session}
            onOpenTableMode={() => setTableMode(true)}
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
      {battleActive && <div className="battle-round-progress" role="progressbar" aria-label={tr("Battle round progress")} aria-valuemin={0} aria-valuemax={session.setup.turnOrder.length * BATTLE_PHASES.length} aria-valuenow={activePlayerIndex * BATTLE_PHASES.length + BATTLE_PHASES.indexOf(session.state.phase) + 1} aria-valuetext={tr(`Round ${session.state.round}, ${active.name}, ${phaseLabel}`, "Round {0}, {1}, {2}")}><span style={{ transform: `scaleX(${(activePlayerIndex * BATTLE_PHASES.length + BATTLE_PHASES.indexOf(session.state.phase) + 1) / (session.setup.turnOrder.length * BATTLE_PHASES.length)})` }} /></div>}
      {liveFeedback.kills.length > 0 && <aside className="battle-kill-notice" role="status" aria-live="polite"><AppIcon name="eliminate" /><div>{liveFeedback.kills.map((kill) => <p key={kill}>{kill}</p>)}</div><button onClick={() => setTab('log')}>{tr("Chronicle")}</button></aside>}

      {!battleActive ? <main className="battle-terminal-content">
        {error && <div className="alert alert--danger battle-alert">{tr(error)}</div>}
        <BattleSummary
          session={session}
          logOpen={terminalLogOpen}
          canRestoreSession={!sharedBattle}
          restoreDisabledReason={sharedBattle ? 'Shared-session undo is disabled until synchronized undo is implemented.' : undefined}
          onToggleLog={() => setTerminalLogOpen((current) => !current)}
          onRestoreSession={() => { setTerminalLogOpen(false); undo() }}
        />
        <button className="terminal-report-toggle" onClick={() => setTerminalReportOpen((current) => !current)}>{terminalReportOpen ? tr('Hide Battle Report') : tr('View Battle Report')}</button>
        {terminalReportOpen && <BattleReport session={session} />}
        <button className="terminal-report-toggle" onClick={() => setTerminalBoardOpen((current) => !current)}>{terminalBoardOpen ? tr('Hide battlefield replay') : tr('View battlefield replay')}</button>
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
        <BattleClock session={session} />
        <PhaseStepper phase={session.state.phase} />
        {officialSecondary && session.setup.players.length === 3 && <RivalRotationNotice session={session} playerId={primaryViewerId} />}
        {sharedBattle && <SharedSyncWarning battleId={session.setup.gameId} />}
        {sharedBattle && <div className={`shared-flow-notice${canControlTurn ? ' shared-flow-notice--active' : ''}`}>{canControlTurn ? tr(`Your turn · ${viewer?.name ?? active.name}`, "Your turn · {0}") : tr(`Waiting for ${sharedPermissions.waitingForPlayerName ?? active.name} · playing as ${viewer?.name ?? 'player'}`, "Waiting for {0} · playing as {1}")}</div>}
        {currentWindow && <section className="panel legacy-reaction-recovery"><p>{tr("This saved battle has an unfinished legacy reaction pause.")}</p><button disabled={!canCloseLegacyPause} onClick={() => cancelReactionWindow(currentWindow.id)}>{tr("Close legacy pause")}</button></section>}
        {error && <div className="alert alert--danger battle-alert">{tr(error)}</div>}

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
          <nav className="battle-tabs" aria-label={tr("Battle panels")}>
            {dashboardTabs.map((item) => (
              <button aria-pressed={tab === item} className={`${tab === item ? 'selected ' : ''}${['log', 'report'].includes(item) ? 'battle-tabs__desktop' : ''}`} key={item} onClick={() => selectDashboardTab(item)}><AppIcon name={DASHBOARD_TAB_ICONS[item]} /><span>{item === 'overview' ? tr('Battle') : item === 'log' ? tr('Chronicle') : item.charAt(0).toUpperCase() + item.slice(1)}</span></button>
            ))}
            <button ref={moreTrigger} aria-haspopup="menu" aria-expanded={moreOpen} className={`battle-tabs__more${['log', 'report'].includes(tab) ? ' selected' : ''}`} onClick={() => setMoreOpen((current) => !current)}><AppIcon name="more" /><span>{tr("More")}</span></button>
          </nav>
          {moreOpen && <CommandPopover label={tr("More battle tools")} role="menu" trigger={moreTrigger} onClose={() => setMoreOpen(false)} className="battle-more-popover">
            <button role="menuitem" onClick={() => { setMoreOpen(false); setTableMode(true) }}>{tr("Table Mode")}</button>
            <button role="menuitem" onClick={() => setTab('log')}><AppIcon name="log" />{tr("Battle Chronicle")}</button>
            <button role="menuitem" disabled={boardEditing} title={boardEditing ? tr('Save or cancel layout edits first') : undefined} onClick={() => { setTab('objectives'); setReplayRequest((current) => current + 1) }}><AppIcon name="replay" />{tr("Battle Replay")}</button>
            <button role="menuitem" onClick={() => setTab('report')}><AppIcon name="report" />{tr("Battle Report")}</button>
            <button role="menuitem" onClick={() => { setMoreOpen(false); setSessionDetailsOpen(true) }}><AppIcon name="mission" />{tr("Session details")}</button>
            <button role="menuitem" onClick={() => { setMoreOpen(false); downloadBattleDiagnosticReport(session, useSharedSessionStore.getState()) }}><AppIcon name="import" />{tr("Export diagnostics")}</button>
          </CommandPopover>}
          {sessionDetailsOpen && <CommandDialog label={tr("Session details")} onClose={() => setSessionDetailsOpen(false)}><section className="panel"><div className="command-popover__heading"><h2>{tr("Session details")}</h2><button aria-label={tr("Close session details")} onClick={() => setSessionDetailsOpen(false)}>×</button></div><RulesSourceBadge source={battleRules.source} /><p>{cauldronModeLabel}</p><p className="context-note">{tr(battleRules.description)}</p><p>{guidanceLevel} {tr(" mode · Round ")}{session.state.round} / {session.state.maxRounds}</p>{rival && <p>{session.setup.doubles ? tr('Opposing force') : tr('Current Rival')}: {rivalSideName}</p>}{officialPrimary && <p>{tr("Primary: ")}{OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, active.id)].name}</p>}{duelPrimary && <p>{tr("Primary: ")}{getDuelMission(session, active.id).name}</p>}{officialSecondary && <p>{tr("Chapter Approved · ")}{secondaryStrategyFor(session, primaryViewerId) === 'fixed' ? tr('Fixed') : tr('Tactical')}</p>}</section></CommandDialog>}

          <main className="battle-content">
            <section className="battle-panel" hidden={tab !== 'overview'} aria-label={tr("Battle overview")}>
            {(officialPrimary || duelPrimary) && <section className="battle-mission-strip" aria-label={tr("Mission score summary")}>
              <button type="button" className="battle-mission-strip__metric" onClick={() => selectDashboardTab('cards')} aria-label={tr("Open mission cards: Primary")}>
                <span className="battle-mission-strip__label">{tr("Primary · ")}{duelPrimary ? getDuelMission(session, primaryViewerId).name : OFFICIAL_PRIMARY_MISSIONS[getOfficialPrimaryId(session, primaryViewerId)].name}</span>
                <strong>{session.state.players[primaryViewerId]?.score.primary ?? 0}<small> {tr(" VP")}</small></strong>
              </button>
              {officialSecondary && <button type="button" className="battle-mission-strip__metric" onClick={() => selectDashboardTab('cards')} aria-label={tr("Open mission cards: Secondary")}>
                <span className="battle-mission-strip__label">{tr("Secondary · ")}{secondaryStrategyFor(session, primaryViewerId) === 'fixed' ? tr('Fixed') : tr('Tactical')}</span>
                <strong>{session.state.players[primaryViewerId]?.score.secondary ?? 0}<small> {tr(" VP")}</small></strong>
              </button>}
            </section>}
            {battleContext && <div className="tactical-dashboard tactical-dashboard--context">
              <div className="tactical-column tactical-column--primary">
                <BattleFocus session={session} playerId={primaryViewerId} onDamage={() => setQuickDamageOpen(true)} onObjectives={() => setTab('objectives')} onCards={() => setTab('cards')} onReview={canControlTurn ? () => setTurnReviewOpen(true) : undefined} />
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
                {officialSecondary && ['COMMAND', 'SHOOTING', 'END_TURN'].includes(session.state.phase) && <OfficialSecondaryPanel session={session} playerId={primaryViewerId} editable={!sharedBattle || viewerPlayerId === (viewerPlayerId ?? active.id)} />}
              </div>
              <aside className="tactical-column tactical-column--context-aside">
                {sharedBattle && viewerPlayerId && <SharedPlayerPerspective
                  session={session}
                  viewerPlayerId={viewerPlayerId}
                  currentRivalPlayerId={rivalId}
                  showCards={cauldron && !officialSecondary}
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
            {visitedPanels.has('army') && <section className="battle-panel" hidden={tab !== 'army'} aria-label={tr("Army")}><ArmyTracker
              session={session}
              dispatch={dispatch}
              preferredPlayerId={armyPreferredPlayerId ?? (sharedBattle ? viewerPlayerId : undefined)}
              sharedMode={sharedBattle}
              viewerPlayerId={viewerPlayerId}
              secondaryTargetFilter={armySecondaryFilter}
              onClearSecondaryTargetFilter={() => setArmySecondaryFilter(null)}
            /></section>}
            {visitedPanels.has('objectives') && <section className="battle-panel" hidden={tab !== 'objectives'} aria-label={tr("Objectives")}><ObjectivesPanel session={session} dispatch={dispatch} liveObjectiveIds={liveFeedback.objectiveIds} replayRequest={replayRequest} onEditingChange={setBoardEditing} active={tab === 'objectives'} /></section>}
            {visitedPanels.has('cards') && cauldron && <section className="battle-panel" hidden={tab !== 'cards'} aria-label={tr("Mission cards")}>
              {officialPrimary && <OfficialPrimaryPanel session={session} playerId={sharedBattle ? viewerPlayerId ?? active.id : active.id} />}
              {duelPrimary && <DuelPrimaryPanel session={session} playerId={primaryViewerId} window={duelReviewWindow} editable={!sharedBattle || Boolean(viewerPlayerId)} />}
              {officialSecondary
                ? <OfficialSecondaryPanel session={session} playerId={primaryViewerId} editable={!sharedBattle || Boolean(viewerPlayerId)} />
                : <SecondaryDetailPanel session={session} playerId={sharedBattle ? viewerPlayerId ?? active.id : active.id} />}
            </section>}
            {visitedPanels.has('log') && <section className="battle-panel" hidden={tab !== 'log'} aria-label={tr("Battle Chronicle")}><BattleLog session={session} /></section>}
            {visitedPanels.has('report') && <section className="battle-panel" hidden={tab !== 'report'} aria-label={tr("Battle Report")}><BattleReport session={session} /></section>}
          </main>

          <footer className="battle-actions battle-actions--primary">
            <button type="button" className="battle-damage-trigger" onClick={() => setQuickDamageOpen(true)}>{tr("Damage")}</button>
            <button
              className="button--gold next-phase"
              disabled={!canControlTurn}
              onClick={handleNextAction}
            ><span className="next-phase__copy"><strong>{!canControlTurn ? tr(`Waiting for ${active.name}`, "Waiting for {0}") : flowPaused && progressionBlockers.length === 0 ? tr('Legacy pause') : tr(nextLabel)}</strong><small>{!canControlTurn ? tr(`Room ${sharedMembership?.roomCode ?? ''}`, "Room {0}") : flowPaused && progressionBlockers.length === 0 ? tr('Close legacy pause to continue') : nextDestination}</small></span><AppIcon name="next" className="next-phase__icon" /></button>
          </footer>
        </>}
      </>}
    </div>
  )
}
