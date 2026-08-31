import type { StratagemAvailability } from '../../domain/stratagems/types'
import { StratagemCard } from './StratagemCard'

type AvailableStratagemPanelProps = {
  playerName: string
  stratagems: StratagemAvailability[]
  onUse: (availability: StratagemAvailability) => void
}

export function AvailableStratagemPanel({ playerName, stratagems, onUse }: AvailableStratagemPanelProps) {
  if (stratagems.length === 0) return null
  return (
    <section className="panel stratagem-panel" aria-label={`Available Stratagems for ${playerName}`}>
      <div className="section-heading">
        <div><span className="eyebrow">Available now</span><h2>{playerName}</h2></div>
        <span className="status-badge">{stratagems.length} option{stratagems.length === 1 ? '' : 's'}</span>
      </div>
      <div className="stratagem-list">
        {stratagems.map((availability) => (
          <StratagemCard
            key={availability.definition.id}
            availability={availability}
            onUse={() => onUse(availability)}
          />
        ))}
      </div>
    </section>
  )
}
