import { totalScore } from '../../domain/battle/selectors'
import type { BattleSession } from '../../domain/battle/types'
import { getCurrentReactionWindow } from '../../domain/stratagems/battleIntegration'
import { selectActiveMissionActions, selectActiveSecondaries } from '../../domain/context/selectors'
import { evaluateOperationalPlan } from '../../rulesets/cauldronFFA3/operationalPlans'

type SharedPlayerPerspectiveProps = {
  session: BattleSession
  viewerPlayerId: string
  currentRivalPlayerId?: string | null
  viewerRivalPlayerId?: string | null
  requiredActionCount?: number
  onOpenArmy: () => void
  onOpenCards: () => void
  onOpenObjectives: () => void
  showCards: boolean
}

export function SharedPlayerPerspective({
  session,
  viewerPlayerId,
  currentRivalPlayerId,
  viewerRivalPlayerId,
  requiredActionCount = 0,
  onOpenArmy,
  onOpenCards,
  onOpenObjectives,
  showCards,
}: SharedPlayerPerspectiveProps) {
  const viewer = session.state.players[viewerPlayerId]
  const active = session.state.players[session.state.activePlayerId]
  if (!viewer || !active) return null

  const ownTurn = viewerPlayerId === active.id
  const currentRival = viewerPlayerId === currentRivalPlayerId
  const viewerRival = viewerRivalPlayerId ? session.state.players[viewerRivalPlayerId] : null
  const reactionWindow = getCurrentReactionWindow(session)
  const reactionPending = reactionWindow?.responses[viewerPlayerId]?.status === 'PENDING'
  const activeSecondaries = showCards ? selectActiveSecondaries(session, viewerPlayerId) : []
  const missionActions = selectActiveMissionActions(session, viewerPlayerId)
  const plan = showCards ? evaluateOperationalPlan(session, viewerPlayerId) : null
  const planProgress = plan?.progress
    ? `${plan.progress.current} / ${plan.progress.target} ${plan.progress.unit}`
    : plan?.status === 'COMPLETED'
      ? 'Completed this round'
      : plan?.status === 'REQUIRES_CONFIRMATION'
        ? 'Confirmation needed at scoring'
        : 'In progress'

  const role = ownTurn
    ? 'Your turn'
    : currentRival
      ? 'You are the current Rival'
      : `${active.name}'s turn`
  const instruction = reactionPending
    ? 'A reaction window is waiting for your response on this device.'
    : ownTurn && requiredActionCount > 0
      ? `${requiredActionCount} required item${requiredActionCount === 1 ? '' : 's'} must be resolved before advancing.`
      : ownTurn
        ? 'You own phase progression and your turn decisions.'
        : currentRival
          ? 'Watch for Rival scoring decisions and reaction windows on this device.'
          : 'Your army, CP and reaction responses remain available while you watch the active turn.'

  return <section className={`panel shared-perspective${ownTurn ? ' shared-perspective--active' : currentRival ? ' shared-perspective--rival' : ''}${reactionPending ? ' shared-perspective--reaction' : ''}`}>
    <div className="shared-perspective__heading">
      <div><span className="eyebrow">Your commander</span><h3>{viewer.name}</h3><small>{viewer.faction ?? 'Army'}</small></div>
      <span className="shared-perspective__role">{role}</span>
    </div>

    {reactionPending && <div className="shared-perspective__alert"><strong>Reaction required</strong><span>USE or PASS before this window can close.</span></div>}

    <div className="shared-perspective__numbers">
      <div><strong>{totalScore(viewer)}</strong><span>VP</span></div>
      <div><strong>{viewer.cp}</strong><span>CP</span></div>
    </div>

    <div className="shared-perspective__brief">
      {viewerRival && <div><span>Your Rival</span><strong>{viewerRival.name}</strong></div>}
      {plan && <div><span>Operational Plan</span><strong>{plan.name}</strong><small>{planProgress}</small></div>}
      {missionActions.length > 0 && <div><span>Mission Action</span><strong>{missionActions.length} active</strong><small>{missionActions.map((item) => item.name).join(' · ')}</small></div>}
    </div>

    {showCards && <div className="shared-perspective__secondaries">
      <span>My Secondaries</span>
      {activeSecondaries.length === 0
        ? <small>No active Secondary cards.</small>
        : activeSecondaries.map((card) => <div key={card.cardId}>
          <strong>{card.name}</strong>
          <small>{card.progress} · {card.vp} VP</small>
        </div>)}
    </div>}

    <p>{instruction}</p>
    <div className="shared-perspective__actions">
      <button onClick={onOpenArmy}>My army</button>
      {showCards && <button onClick={onOpenCards}>My Secondaries</button>}
      <button onClick={onOpenObjectives}>Objectives</button>
    </div>
  </section>
}
