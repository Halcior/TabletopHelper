import { totalScore } from '../../domain/battle/selectors'
import type { BattleSession } from '../../domain/battle/types'
import { getCurrentReactionWindow } from '../../domain/stratagems/battleIntegration'
import { selectActiveMissionActions } from '../../domain/context/selectors'
import { CAULDRON_RULESET_ID, getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3'
import { evaluateOperationalPlan } from '../../rulesets/cauldronFFA3/operationalPlans'
import { getActiveSecondaryViews } from '../../rulesets/cauldronFFA3/secondary'
import { useBattleStore } from '../../stores/battleStore'
import { RivalDamagePanel } from './RivalDamagePanel'

type SharedPlayerPerspectiveProps = {
  session: BattleSession
  viewerPlayerId: string
  currentRivalPlayerId?: string | null
  requiredActionCount?: number
  onOpenArmy: () => void
  onOpenCards: () => void
  onOpenObjectives?: () => void
  showCards: boolean
}

function secondaryStatus(status: ReturnType<typeof getActiveSecondaryViews>[number]['status']): string {
  switch (status) {
    case 'COMPLETED': return 'Completed'
    case 'INPUT_REQUIRED': return 'Input required'
    case 'DECISION_REQUIRED': return 'Decision required'
    case 'DEADLINE_FAILED': return 'Failed'
    default: return 'In progress'
  }
}

export function SharedPlayerPerspective({
  session,
  viewerPlayerId,
  currentRivalPlayerId,
  requiredActionCount = 0,
  onOpenArmy,
  onOpenCards,
  onOpenObjectives,
  showCards,
}: SharedPlayerPerspectiveProps) {
  const viewer = session.state.players[viewerPlayerId]
  const active = session.state.players[session.state.activePlayerId]
  const dispatch = useBattleStore((store) => store.dispatch)
  if (!viewer || !active) return null

  const ownTurn = viewerPlayerId === active.id
  const currentRival = viewerPlayerId === currentRivalPlayerId
  const viewerRivalId = session.setup.rulesetId === CAULDRON_RULESET_ID
    ? getCurrentRivalPlayerId(session, viewerPlayerId)
    : null
  const viewerRival = viewerRivalId ? session.state.players[viewerRivalId] : null
  const reactionWindow = getCurrentReactionWindow(session)
  const reactionPending = reactionWindow?.responses[viewerPlayerId]?.status === 'PENDING'
  const activeSecondaries = showCards ? getActiveSecondaryViews(session, viewerPlayerId) : []
  const missionActions = selectActiveMissionActions(session, viewerPlayerId)
  const plan = showCards ? evaluateOperationalPlan(session, viewerPlayerId) : null
  const planProgress = plan?.progress
    ? `${plan.progress.current}/${plan.progress.target} ${plan.progress.unit}`
    : plan?.status === 'COMPLETED'
      ? 'Completed'
      : plan?.status === 'REQUIRES_CONFIRMATION'
        ? 'Confirm at scoring'
        : 'In progress'

  const role = ownTurn
    ? 'Your turn'
    : currentRival
      ? 'You are Rival'
      : `Watching ${active.name}`
  const urgentTitle = reactionPending
    ? 'Reaction required'
    : ownTurn && requiredActionCount > 0
      ? `${requiredActionCount} item${requiredActionCount === 1 ? '' : 's'} to resolve`
      : null
  const urgentCopy = reactionPending
    ? 'Respond USE or PASS before the battle can continue.'
    : urgentTitle
      ? 'Resolve the highlighted item before advancing the phase.'
      : null

  return <section className={`panel shared-perspective${ownTurn ? ' shared-perspective--active' : currentRival ? ' shared-perspective--rival' : ''}${reactionPending ? ' shared-perspective--reaction' : ''}`}>
    <div className="shared-perspective__heading">
      <div><span className="eyebrow">You</span><h3>{viewer.name}</h3><small>{viewer.faction ?? 'Army'}</small></div>
      <span className="shared-perspective__role">{role}</span>
    </div>

    {urgentTitle && <div className="shared-perspective__alert"><strong>{urgentTitle}</strong><span>{urgentCopy}</span></div>}

    <div className="shared-perspective__numbers">
      <div><strong>{totalScore(viewer)}</strong><span>VP</span></div>
      <div><strong>{viewer.cp}</strong><span>CP</span></div>
      <div><strong>{viewerRival?.name ?? '—'}</strong><span>Rival</span></div>
    </div>

    {plan && <div className="player-focus-line"><span>Plan</span><strong>{plan.name} · {planProgress}</strong></div>}
    {missionActions.length > 0 && <div className="player-focus-line"><span>Action</span><strong>{missionActions.map((item) => item.name).join(' · ')}</strong></div>}

    {showCards && <section className={`shared-secondary-focus${ownTurn ? ' shared-secondary-focus--active' : ''}`} aria-label="My active Secondary missions">
      <div className="shared-secondary-focus__heading">
        <div><span className="eyebrow">{ownTurn ? 'Your current turn' : 'Your missions'}</span><h3>Secondary Missions</h3></div>
        <button type="button" onClick={onOpenCards}>Details</button>
      </div>
      {activeSecondaries.length === 0
        ? <div className="shared-secondary-focus__empty"><strong>None active</strong><span>Cards refill at the next Command phase.</span></div>
        : <div className="shared-secondary-focus__list">{activeSecondaries.map((card) => <article className={`shared-secondary-card shared-secondary-card--${card.status.toLowerCase()}`} key={card.cardId}>
          <div className="shared-secondary-card__top"><div><span>{secondaryStatus(card.status)}</span><strong>{card.name}</strong></div><b>{card.vp} VP</b></div>
          <p>{card.objective}</p>
          <div className="shared-secondary-card__progress"><span>Progress</span><strong>{card.progress}</strong></div>
        </article>)}</div>}
    </section>}

    {ownTurn && viewerRivalId && <RivalDamagePanel
      session={session}
      attackerPlayerId={viewerPlayerId}
      victimPlayerId={viewerRivalId}
      dispatch={dispatch}
    />}

    <div className="shared-perspective__actions">
      <button onClick={onOpenArmy}>Army</button>
      {showCards && <button onClick={onOpenCards}>Secondaries</button>}
      {onOpenObjectives && <button onClick={onOpenObjectives}>Objectives</button>}
    </div>
  </section>
}
