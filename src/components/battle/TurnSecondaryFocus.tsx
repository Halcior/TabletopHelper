import type { BattleSession } from '../../domain/battle/types'
import { getActiveSecondaryViews, getRoundSecondaryVp } from '../../rulesets/cauldronFFA3/secondary'
import { AppIcon } from '../AppIcon'
import { getSecondaryPresentation } from './secondaryPresentation'

function statusCopy(status: ReturnType<typeof getActiveSecondaryViews>[number]['status']): string {
  switch (status) {
    case 'COMPLETED': return 'Completed'
    case 'INPUT_REQUIRED': return 'Input required'
    case 'DECISION_REQUIRED': return 'Decision required'
    case 'DEADLINE_FAILED': return 'Failed'
    default: return 'In progress'
  }
}

export function TurnSecondaryFocus({
  session,
  playerId,
  onOpenCards,
}: {
  session: BattleSession
  playerId: string
  onOpenCards: () => void
}) {
  const player = session.state.players[playerId]
  if (!player) return null
  const cards = getActiveSecondaryViews(session, playerId)

  return <section className="turn-secondary-focus" aria-label="Current turn Secondary missions">
    <div className="turn-secondary-focus__heading">
      <div>
        <span className="eyebrow">Your current turn</span>
        <h2>Secondary Missions</h2>
      </div>
      <div className="turn-secondary-focus__score"><strong>{getRoundSecondaryVp(session, playerId)}/10</strong><span>round VP</span></div>
    </div>

    {cards.length === 0
      ? <div className="turn-secondary-focus__empty"><strong>No active Secondary</strong><span>Cards refill at the start of your next Command phase.</span></div>
      : <div className="turn-secondary-focus__cards">{cards.map((card) => {
        const visual = getSecondaryPresentation(card)
        return <article className={`turn-secondary-focus__card turn-secondary-focus__card--${card.status.toLowerCase()} turn-secondary-focus__card--${visual.kind}`} key={card.cardId}>
          <div className="turn-secondary-focus__card-top">
            <div><span className="turn-secondary-focus__card-icon"><AppIcon name={visual.icon} /></span><span>{visual.label} · {statusCopy(card.status)}</span><h3>{card.name}</h3></div>
            <strong>{card.vp} VP</strong>
          </div>
          <p>{card.objective}</p>
          <div className="turn-secondary-focus__progress"><span>Progress</span><strong>{card.progress}</strong></div>
        </article>
      })}</div>}

    <button className="turn-secondary-focus__open" type="button" onClick={onOpenCards}>Open Secondary details</button>
  </section>
}
