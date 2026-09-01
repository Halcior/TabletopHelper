import type { ReactionOpportunity } from '../../domain/stratagems/types'
import { ReactionHoldButton } from './ReactionHoldButton'

type ReactionStatusPanelProps = {
  opportunity: ReactionOpportunity
  playerNames: Record<string, string>
  mode: 'guided' | 'fast'
  disabled?: boolean
  onHold: (playerId: string) => void
}

export function ReactionStatusPanel({ opportunity, playerNames, mode, disabled, onHold }: ReactionStatusPanelProps) {
  return (
    <section className={`panel reaction-status-panel reaction-status-panel--${mode}`}>
      <div className="section-heading">
        <div><span className="eyebrow">Reactions</span><h2>{opportunity.hasReactions ? 'Reaction available' : 'No reactions available'}</h2></div>
        {opportunity.hasReactions && <span className="status-badge status-badge--danger">Attention</span>}
      </div>
      <div className="reaction-status-grid">
        {Object.entries(opportunity.reactionsByPlayer).map(([playerId, reactions]) => {
          const playerName = playerNames[playerId] ?? 'Unknown player'
          return <div key={playerId} className={`reaction-status-card${reactions.length > 0 ? ' has-reaction' : ''}`}>
            <div><strong>{playerName}</strong><span>{reactions.length > 0 ? `${reactions.length} possible` : 'None available'}</span></div>
            <ReactionHoldButton playerName={playerName} disabled={disabled} onHold={() => onHold(playerId)} />
          </div>
        })}
      </div>
    </section>
  )
}
