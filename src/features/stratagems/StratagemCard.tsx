import type { StratagemAvailability } from '../../domain/stratagems/types'

type StratagemCardProps = {
  availability: StratagemAvailability
  onUse?: () => void
  compact?: boolean
}

export function StratagemCard({ availability, onUse, compact = false }: StratagemCardProps) {
  const { definition, canUse, reasons } = availability
  const timingNeedsConfirmation = definition.timingConfidence === 'REQUIRES_CONFIRMATION'
  const confidenceReasons = definition.timingConfidenceReasons ?? []
  return (
    <article className={`stratagem-card${compact ? ' stratagem-card--compact' : ''}${timingNeedsConfirmation ? ' stratagem-card--unverified' : ''}`}>
      <div className="stratagem-card__heading">
        <div>
          <h3>{definition.name}</h3>
          <span>{definition.timing ?? definition.triggers[0].replaceAll('_', ' ').toLowerCase()}</span>
        </div>
        <strong>{definition.cpCost} CP</strong>
      </div>
      {definition.timingConfidence && <span className={`stratagem-confidence ${timingNeedsConfirmation ? 'stratagem-confidence--unverified' : 'stratagem-confidence--exact'}`}>
        {timingNeedsConfirmation ? 'Table confirmation required' : 'Structured timing verified'}
      </span>}
      <details>
        <summary>Details</summary>
        <p>{definition.description}</p>
        {timingNeedsConfirmation && confidenceReasons.length > 0 && <ul className="stratagem-card__confidence-reasons">
          {confidenceReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>}
        {definition.source !== 'Development sample' && <small>{definition.source}</small>}
      </details>
      {reasons.length > 0 && <p className="stratagem-card__reason">{reasons.join(' ')}</p>}
      {onUse && <button className="button--gold" disabled={!canUse} onClick={onUse}>{timingNeedsConfirmation ? 'Confirm & use' : 'Use'}</button>}
    </article>
  )
}
