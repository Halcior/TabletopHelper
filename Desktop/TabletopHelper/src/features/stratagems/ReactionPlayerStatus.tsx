import type { ReactionResponse } from '../../domain/stratagems/types'

type ReactionPlayerStatusProps = {
  playerName: string
  response: ReactionResponse
  priority?: boolean
}

export function ReactionPlayerStatus({ playerName, response, priority = false }: ReactionPlayerStatusProps) {
  const label = priority
    ? 'Priority'
    : response.automatic && response.status === 'PASS'
      ? 'Auto pass'
      : response.status === 'PENDING'
        ? 'Waiting'
        : response.status.replace('_', ' ')
  return (
    <div className={`reaction-player-status reaction-player-status--${priority ? 'priority' : response.status.toLowerCase()}`}>
      <strong>{playerName}</strong>
      <span>{label}</span>
    </div>
  )
}
