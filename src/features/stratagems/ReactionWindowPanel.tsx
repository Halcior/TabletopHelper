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
  sharedMode?: boolean
  viewerPlayerId?: string | null
}

export function ReactionWindowPanel({
  window,
  playerNames,
  optionsByPlayer,
  onUse,
  onPass,
  sharedMode = false,
  viewerPlayerId = null,
}: ReactionWindowPanelProps) {
  const priorityPlayerId = getReactionPriorityPlayerId(window)
  const playerName = (playerId: string) => playerNames[playerId] ?? 'Unknown player'
  return (
    <section className="panel reaction-window" role="alert" aria-live="assertive">
      <div className="reaction-window__heading">
        <div>
          <span className="eyebrow">Reaction {window.requestedByPlayerId ? 'hold' : 'window'}</span>
          <h2>{window.requestedByPlayerId ? 'Reaction hold' : 'Reaction window'}</h2>
          <span className="reaction-trigger">{window.trigger.replaceAll('_', ' ')}</span>
          <p>{playerName(window.activePlayerId)} action is paused.</p>
          {priorityPlayerId && <strong className="reaction-priority">Priority: {playerName(priorityPlayerId)}</strong>}
        </div>
        <span className="status-badge status-badge--danger">{window.behavior === 'HARD' ? 'Action paused' : 'Optional response'}</span>
      </div>
      {window.requestedByPlayerId && (
        <div className="reaction-hold-notice">
          {playerName(window.requestedByPlayerId)} requested time to react.
        </div>
      )}
      <div className="reaction-response-list">
        {Object.values(window.responses).map((response) => {
          const options = optionsByPlayer[response.playerId] ?? []
          const viewerOwnsResponse = !sharedMode || response.playerId === viewerPlayerId
          return (
            <section key={response.playerId} className={`reaction-response${viewerOwnsResponse ? ' reaction-response--mine' : ''}`}>
              <ReactionPlayerStatus
                playerName={playerName(response.playerId)}
                response={response}
                priority={response.playerId === priorityPlayerId}
              />
              {response.status === 'PENDING' && viewerOwnsResponse && <>
                {options.length > 0
                  ? <details className="reaction-options">
                    <summary>Show {options.length} reaction{options.length === 1 ? '' : 's'}</summary>
                    <div className="stratagem-list">{options.map((availability) => (
                      <StratagemCard
                        compact
                        key={availability.definition.id}
                        availability={availability}
                        onUse={() => onUse(response.playerId, availability)}
                      />
                    ))}</div>
                  </details>
                  : <p>No legal reaction is registered for this moment. The hold remains until you pass.</p>}
                <button className="reaction-pass" onClick={() => onPass(response.playerId)}>Pass</button>
              </>}
              {response.status === 'PENDING' && !viewerOwnsResponse && <p className="reaction-waiting">Waiting for {playerName(response.playerId)} to respond on their device.</p>}
            </section>
          )
        })}
      </div>
    </section>
  )
}
