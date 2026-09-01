import type { StratagemAvailability } from '../../domain/stratagems/types'

type StratagemCardProps = {
  availability: StratagemAvailability
  onUse?: () => void
  compact?: boolean
}

export function StratagemCard({ availability, onUse, compact = false }: StratagemCardProps) {
  const { definition, canUse, reasons } = availability
  return (
    <article className={`stratagem-card${compact ? ' stratagem-card--compact' : ''}`}>
      <div className="stratagem-card__heading">
        <div>
          <h3>{definition.name}</h3>
          <span>{definition.timing ?? definition.triggers[0].replaceAll('_', ' ').toLowerCase()}</span>
        </div>
        <strong>{definition.cpCost} CP</strong>
      </div>
      <details>
        <summary>Details</summary>
        <p>{definition.description}</p>
        {definition.source !== 'Development sample' && <small>{definition.source}</small>}
      </details>
      {reasons.length > 0 && <p className="stratagem-card__reason">{reasons.join(' ')}</p>}
      {onUse && <button className="button--gold" disabled={!canUse} onClick={onUse}>Use</button>}
    </article>
  )
}
