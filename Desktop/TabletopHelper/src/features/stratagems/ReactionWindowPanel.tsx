import type {
  ReactionWindow,
  StratagemAvailability,
} from '../../domain/stratagems/types'
import { getReactionPriorityPlayerId } from '../../domain/stratagems/reactionEngine'
import { ReactionPlayerStatus } from './ReactionPlayerStatus'
import { StratagemCard } from './StratagemCard'

type ReactionWindowPanelProps = {
  window: ReactionWindow
  playerNames: Record<string, string>
  optionsByPlayer: Record<string, StratagemAvailability[]>
  onUse: (playerId: string, availability: StratagemAvailability) => void
  onPass: (playerId: string) => void
}

export function ReactionWindowPanel({
  window,
  playerNames,
  optionsByPlayer,
  onUse,
  onPass,
}: ReactionWindowPanelProps) {
  const priorityPlayerId = getReactionPriorityPlayerId(window)
  return (
    <section className="panel reaction-window" role="alert" aria-live="assertive">
      <div className="reaction-window__heading">
        <div>
          <span className="eyebrow">Reaction {window.requestedByPlayerId ? 'hold' : 'window'}</span>
          <h2>{window.trigger.replaceAll('_', ' ')}</h2>
          <p>{playerNames[window.activePlayerId] ?? window.activePlayerId} action is paused.</p>
          {priorityPlayerId && <strong className="reaction-priority">Priority: {playerNames[priorityPlayerId] ?? priorityPlayerId}</strong>}
        </div>
        <span className="status-badge status-badge--danger">{window.behavior}</span>
      </div>
      {window.requestedByPlayerId && (
        <div className="reaction-hold-notice">
          {playerNames[window.requestedByPlayerId] ?? window.requestedByPlayerId} requested time to react.
        </div>
      )}
      <div className="reaction-response-list">
        {Object.values(window.responses).map((response) => {
          const options = optionsByPlayer[response.playerId] ?? []
          return (
            <section key={response.playerId} className="reaction-response">
              <ReactionPlayerStatus
                playerName={playerNames[response.playerId] ?? response.playerId}
                response={response}
                priority={response.playerId === priorityPlayerId}
              />
              {response.status === 'PENDING' && <>
                {options.length > 0
                  ? <div className="stratagem-list">{options.map((availability) => (
                    <StratagemCard
                      compact
                      key={availability.definition.id}
                      availability={availability}
                      onUse={() => onUse(response.playerId, availability)}
                    />
                  ))}</div>
                  : <p>No legal reaction is registered for this moment. The hold remains until this player passes.</p>}
                <button className="button--wide" onClick={() => onPass(response.playerId)}>Pass</button>
              </>}
            </section>
          )
        })}
      </div>
    </section>
  )
}
