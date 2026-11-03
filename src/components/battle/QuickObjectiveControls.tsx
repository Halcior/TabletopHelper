import { t as tr } from '../../features/i18n/locale'
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
    <div className="secondary-quick-objectives" aria-label={tr("Quick objective control")}>
      {objectives.map((objective) => {
        const controllerName = objective.controllerPlayerId
          ? session.state.players[objective.controllerPlayerId]?.name ?? 'Unknown player'
          : 'None'
        return <div className="secondary-objective-row" key={objective.id}>
          <div><strong>{objective.name}</strong><span>{controllerName}</span></div>
          <div className="secondary-objective-choices" role="group" aria-label={tr(`Set controller for ${objective.name}`, "Set controller for {0}")}>
            <button
              aria-label={tr(`Set ${objective.name} to no controller`, "Set {0} to no controller")}
              aria-pressed={objective.controllerPlayerId === null}
              className={objective.controllerPlayerId === null ? 'selected' : ''}
              onClick={() => dispatch({
                type: 'OBJECTIVE_CONTROL_CHANGED',
                payload: { objectiveId: objective.id, controllerPlayerId: null },
              })}
            >{tr("None")}</button>
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
