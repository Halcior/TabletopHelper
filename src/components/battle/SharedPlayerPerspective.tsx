import { t as tr } from '../../features/i18n/locale'
import { totalScore } from '../../domain/battle/selectors'
import type { BattleSession } from '../../domain/battle/types'
import { SecondaryScope } from './RivalClarity'
import { FFA_SCORING_BRIEF, secondaryScope } from './rivalPresentation'
import type { OfficialSecondaryId } from '../../rulesets/cauldronFFA3/secondaryTypes'
import { selectActiveMissionActions } from '../../domain/context/selectors'
import { CAULDRON_RULESET_ID, getCauldronConfig, getCurrentRivalPlayerId } from '../../rulesets/cauldronFFA3'
import { evaluateOperationalPlan } from '../../rulesets/cauldronFFA3/operationalPlans'
import { getActiveSecondaryViews } from '../../rulesets/cauldronFFA3/secondary'
import { useBattleStore } from '../../stores/battleStore'
import { doublesScorekeeperId, doublesForceForPlayer } from '../../domain/battle/doubles'
import { AppIcon } from '../AppIcon'
import { RivalDamagePanel } from './RivalDamagePanel'
import { getSecondaryPresentation } from './secondaryPresentation'

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
  const teamCaptainId = doublesScorekeeperId(session.setup, viewerPlayerId)
  const teamScore = session.state.players[teamCaptainId]
  const dispatch = useBattleStore((store) => store.dispatch)
  if (!viewer || !active) return null

  const ownTurn = doublesScorekeeperId(session.setup, viewerPlayerId) === active.id
  const currentRival = currentRivalPlayerId ? doublesScorekeeperId(session.setup, viewerPlayerId) === currentRivalPlayerId : false
  const viewerRivalId = session.setup.rulesetId === CAULDRON_RULESET_ID
    ? getCurrentRivalPlayerId(session, viewerPlayerId)
    : null
  const viewerRival = viewerRivalId ? session.state.players[viewerRivalId] : null
  const activeSecondaries = showCards ? getActiveSecondaryViews(session, doublesScorekeeperId(session.setup, viewerPlayerId)) : []
  const missionActions = selectActiveMissionActions(session, viewerPlayerId)
  const plan = showCards && !(session.setup.rulesetId === CAULDRON_RULESET_ID && (getCauldronConfig(session).primaryDeck ?? 'cauldron') !== 'cauldron')
    ? evaluateOperationalPlan(session, viewerPlayerId) : null
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
      : `Watching ${doublesForceForPlayer(session.setup, active.id)?.name ?? active.name}`
  const urgentTitle = ownTurn && requiredActionCount > 0
    ? `${requiredActionCount} item${requiredActionCount === 1 ? '' : 's'} to resolve`
    : null
  const urgentCopy = urgentTitle
    ? 'Resolve the highlighted item before advancing the phase.'
    : null

  return <section className={`panel shared-perspective${ownTurn ? ' shared-perspective--active' : currentRival ? ' shared-perspective--rival' : ''}`}>
    <div className="shared-perspective__heading">
      <div><span className="eyebrow">{tr("You")}</span><h3>{viewer.name}</h3><small>{session.setup.doubles ? tr(`${doublesForceForPlayer(session.setup, viewerPlayerId)?.name ?? 'Team'} · ${viewer.faction ?? 'Army'}`, "{0} · {1}") : viewer.faction ?? tr('Army')}</small></div>
      <span className="shared-perspective__role">{tr(role)}</span>
    </div>

    {urgentTitle && <div className="shared-perspective__alert"><strong>{urgentTitle}</strong><span>{urgentCopy}</span></div>}

    <div className="shared-perspective__numbers">
      <div><strong>{totalScore(teamScore ?? viewer)}</strong><span>{tr("VP")}</span></div>
      <div><strong>{teamScore?.cp ?? viewer.cp}</strong><span>{tr("CP")}</span></div>
      <div><strong>{viewerRivalId ? doublesForceForPlayer(session.setup, viewerRivalId)?.name ?? viewerRival?.name : '—'}</strong><span>{session.setup.doubles ? tr('Enemy force') : tr('Rival')}</span></div>
    </div>

    {plan && <div className="player-focus-line"><span>{tr("Plan")}</span><strong>{plan.name} · {planProgress}</strong></div>}
    {missionActions.length > 0 && <div className="player-focus-line"><span>{tr("Action")}</span><strong>{missionActions.map((item) => item.name).join(' · ')}</strong></div>}

    {showCards && <section className={`shared-secondary-focus${ownTurn ? ' shared-secondary-focus--active' : ''}`} aria-label={tr("My active Secondary missions")}>
      <div className="shared-secondary-focus__heading">
        <div><span className="eyebrow">{ownTurn ? tr('Your current turn') : tr('Your missions')}</span><h3>{tr("Secondary Missions")}</h3></div>
        <button type="button" onClick={onOpenCards}>{tr("Details")}</button>
      </div>
      {activeSecondaries.length === 0
        ? <div className="shared-secondary-focus__empty"><strong>{tr("None active")}</strong><span>{tr("Cards refill at the next Command phase.")}</span></div>
        : <div className="shared-secondary-focus__list">{activeSecondaries.map((card) => {
          const visual = getSecondaryPresentation(card)
          const ownerId = doublesScorekeeperId(session.setup, viewerPlayerId)
          const scope = secondaryScope(session, ownerId, card.cardId)
          return <article className={`shared-secondary-card shared-secondary-card--${card.status.toLowerCase()} shared-secondary-card--${visual.kind}`} key={card.cardId}>
            <div className="shared-secondary-card__top"><div className="shared-secondary-card__identity"><span className="shared-secondary-card__icon"><AppIcon name={visual.icon} /></span><span><small>{tr(visual.label)} · {secondaryStatus(card.status)}</small><strong>{card.name}</strong></span></div><b>{card.vp} {tr(" VP")}</b></div>
            <SecondaryScope session={session} playerId={ownerId} cardId={card.cardId} />
            <p>{scope ? FFA_SCORING_BRIEF[card.cardId as OfficialSecondaryId] : card.objective}</p>
            {!scope && <div className="shared-secondary-card__progress"><span>{tr("Progress")}</span><strong>{tr(card.progress)}</strong></div>}
          </article>
        })}</div>}
    </section>}

    {ownTurn && <RivalDamagePanel
      session={session}
      attackerPlayerId={viewerPlayerId}
      currentRivalPlayerId={viewerRivalId}
      dispatch={dispatch}
    />}

    <div className="shared-perspective__actions">
      <button onClick={onOpenArmy}>{tr("Army")}</button>
      {showCards && <button onClick={onOpenCards}>{tr("Secondaries")}</button>}
      {onOpenObjectives && <button onClick={onOpenObjectives}>{tr("Objectives")}</button>}
    </div>
  </section>
}
