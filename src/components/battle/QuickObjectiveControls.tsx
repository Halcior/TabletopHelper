import type { BattleEventInput, BattleSession } from '../../domain/battle/types'

export function QuickObjectiveControls({
  session,
  dispatch,
}: {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
}) {
  const players = session.state.turnOrder.map((id) => session.state.players[id])
  const objectives = Object.values(session.state.objectives)
    .sort((left, right) => Number(left.type === 'home') - Number(right.type === 'home'))

  return (
    <div className="secondary-quick-objectives" aria-label="Quick objective control">
      {objectives.map((objective) => {
        const controllerName = objective.controllerPlayerId
          ? session.state.players[objective.controllerPlayerId]?.name ?? 'Unknown player'
          : 'None'
        return <div className="secondary-objective-row" key={objective.id}>
          <div><strong>{objective.name}</strong><span>{controllerName}</span></div>
          <div className="secondary-objective-choices" role="group" aria-label={`Set controller for ${objective.name}`}>
            <button
              aria-label={`Set ${objective.name} to no controller`}
              aria-pressed={objective.controllerPlayerId === null}
              className={objective.controllerPlayerId === null ? 'selected' : ''}
              onClick={() => dispatch({
                type: 'OBJECTIVE_CONTROL_CHANGED',
                payload: { objectiveId: objective.id, controllerPlayerId: null },
              })}
            >None</button>
            {players.map((player, index) => <button
              aria-pressed={objective.controllerPlayerId === player.id}
              className={`objective-choice objective-choice--player-${index}${objective.controllerPlayerId === player.id ? ' selected' : ''}`}
              key={player.id}
              onClick={() => dispatch({
                type: 'OBJECTIVE_CONTROL_CHANGED',
                payload: { objectiveId: objective.id, controllerPlayerId: player.id },
              })}
            >{player.name}</button>)}
          </div>
        </div>
      })}
    </div>
  )
}
