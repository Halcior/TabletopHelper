import { totalScore } from '../../domain/battle/selectors'
import type { BattleSession } from '../../domain/battle/types'

type SharedPlayerPerspectiveProps = {
  session: BattleSession
  viewerPlayerId: string
  currentRivalPlayerId?: string | null
  onOpenArmy: () => void
  onOpenCards: () => void
  showCards: boolean
}

export function SharedPlayerPerspective({
  session,
  viewerPlayerId,
  currentRivalPlayerId,
  onOpenArmy,
  onOpenCards,
  showCards,
}: SharedPlayerPerspectiveProps) {
  const viewer = session.state.players[viewerPlayerId]
  const active = session.state.players[session.state.activePlayerId]
  if (!viewer || !active) return null

  const ownTurn = viewerPlayerId === active.id
  const currentRival = viewerPlayerId === currentRivalPlayerId
  const role = ownTurn
    ? 'Your turn'
    : currentRival
      ? 'You are the current Rival'
      : `${active.name}'s turn`
  const instruction = ownTurn
    ? 'You own phase progression and your turn decisions.'
    : currentRival
      ? 'Watch for Rival scoring decisions and reaction windows on this device.'
      : 'Your army, CP and reaction responses remain available while you watch the active turn.'

  return <section className={`panel shared-perspective${ownTurn ? ' shared-perspective--active' : currentRival ? ' shared-perspective--rival' : ''}`}>
    <div className="shared-perspective__heading">
      <div><span className="eyebrow">Your commander</span><h3>{viewer.name}</h3><small>{viewer.faction ?? 'Army'}</small></div>
      <span className="shared-perspective__role">{role}</span>
    </div>
    <div className="shared-perspective__numbers">
      <div><strong>{totalScore(viewer)}</strong><span>VP</span></div>
      <div><strong>{viewer.cp}</strong><span>CP</span></div>
    </div>
    <p>{instruction}</p>
    <div className="shared-perspective__actions">
      <button onClick={onOpenArmy}>My army</button>
      {showCards && <button onClick={onOpenCards}>My Secondaries</button>}
    </div>
  </section>
}
