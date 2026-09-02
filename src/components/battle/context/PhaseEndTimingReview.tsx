import type { BattlePhase } from '../../../domain/battle/types'
import type { ReactionPlayerContext, RelevantStratagem } from '../../../domain/context'

function phaseName(phase: BattlePhase): string {
  return phase.replaceAll('_', ' ').toLocaleLowerCase().replace(/^./, (letter) => letter.toLocaleUpperCase())
}

export function PhaseEndTimingReview({
  phase,
  stratagems,
  reactionPlayers,
  reactionWindowOpen,
  reactionsHandled,
  onUseStratagem,
  onOpenReactions,
  onContinue,
  onCancel,
}: {
  phase: BattlePhase
  stratagems: RelevantStratagem[]
  reactionPlayers: ReactionPlayerContext[]
  reactionWindowOpen: boolean
  reactionsHandled: boolean
  onUseStratagem: (option: RelevantStratagem) => void
  onOpenReactions: () => void
  onContinue: () => void
  onCancel: () => void
}) {
  const reacting = reactionPlayers.filter((player) => player.exactCount + player.potentialCount > 0)
  const needsReactionWindow = reacting.length > 0 && !reactionsHandled

  return <main className="phase-end-review" aria-label={`End of ${phaseName(phase)} phase timing review`}>
    <div className="phase-end-review__heading">
      <div>
        <span className="eyebrow">End-of-phase checkpoint</span>
        <h2>Before leaving {phaseName(phase)}</h2>
      </div>
      <button onClick={onCancel}>Back</button>
    </div>

    <p className="phase-end-review__intro">
      These are the timing opportunities the structured rules data can place specifically at the end of this phase.
    </p>

    {stratagems.length > 0 && <section className="phase-end-review__section">
      <h3>Active player</h3>
      <div className="phase-end-option-list">{stratagems.map((option) => <article className="phase-end-option" key={option.definition.id}>
        <div className="phase-end-option__heading">
          <strong>{option.definition.name}</strong>
          <span>{option.definition.cpCost} CP</span>
        </div>
        <p>{option.definition.description}</p>
        {option.manualConfirmationRequired
          ? <small>End-of-phase timing matches, but another structured guard still needs table confirmation.</small>
          : <small>Structured end-of-phase timing matched.</small>}
        {!option.availability.canUse && <small>{option.availability.reasons.join(' ')}</small>}
        <button
          className="button--gold"
          disabled={!option.availability.canUse || reactionWindowOpen}
          onClick={() => onUseStratagem(option)}
        >{option.manualConfirmationRequired ? 'Confirm & use' : 'Use Stratagem'}</button>
      </article>)}</div>
    </section>}

    {reacting.length > 0 && <section className="phase-end-review__section">
      <h3>Opponent reactions</h3>
      <div className="phase-end-reaction-list">{reacting.map((player) => <div className="phase-end-reaction" key={player.playerId}>
        <strong>{player.playerName}</strong>
        <span>{player.exactCount > 0 ? `${player.exactCount} exact` : ''}{player.exactCount > 0 && player.potentialCount > 0 ? ' · ' : ''}{player.potentialCount > 0 ? `${player.potentialCount} to confirm` : ''}</span>
      </div>)}</div>
      <p className="context-note">{reactionWindowOpen
        ? 'The reaction window is open. Resolve USE / PASS before continuing.'
        : reactionsHandled
          ? 'The reaction window for this end-of-phase checkpoint has been resolved.'
          : 'Open the reaction window before the phase can finish.'}</p>
    </section>}

    {stratagems.length === 0 && reacting.length === 0 && <p className="context-note">No end-of-phase timing opportunities were found.</p>}

    <div className="phase-end-review__actions">
      <button onClick={onCancel}>Return to phase</button>
      <button
        className="button--gold"
        disabled={reactionWindowOpen}
        onClick={needsReactionWindow ? onOpenReactions : onContinue}
      >{reactionWindowOpen
        ? 'Resolve reactions first'
        : needsReactionWindow
          ? 'Open reaction window'
          : 'Finish phase'}</button>
    </div>
  </main>
}
