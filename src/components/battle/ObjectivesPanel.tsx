import type { BattleEventInput, BattleSession } from '../../domain/battle/types'

type ObjectivesPanelProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
}

export function ObjectivesPanel({ session, dispatch }: ObjectivesPanelProps) {
  const players = session.state.turnOrder.map((id) => session.state.players[id])
  return (
    <section className="objective-grid" aria-label="Objectives">
      {Object.values(session.state.objectives).map((objective) => {
        const controller = objective.controllerPlayerId
          ? session.state.players[objective.controllerPlayerId]?.name
          : 'Uncontrolled'
        return (
          <article className="panel objective-card" key={objective.id}>
            <div className="objective-card__header">
              <div><span className="eyebrow">{objective.type}</span><h3>{objective.name}</h3></div>
              <strong>{controller}</strong>
            </div>
            <div className="control-choices" role="group" aria-label={`Quick control for ${objective.name}`}>
              <button
                className={objective.controllerPlayerId === null ? 'selected' : ''}
                onClick={() => dispatch({
                  type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: objective.id, controllerPlayerId: null },
                })}
              >None</button>
              {players.map((player) => (
                <button
                  className={objective.controllerPlayerId === player.id ? 'selected' : ''}
                  key={player.id}
                  onClick={() => dispatch({
                    type: 'OBJECTIVE_CONTROL_CHANGED',
                    payload: { objectiveId: objective.id, controllerPlayerId: player.id },
                  })}
                >{player.name}</button>
              ))}
            </div>
            <details className="oc-mode">
              <summary>OC mode</summary>
              {players.map((player) => {
                const oc = objective.playerOC[player.id] ?? 0
                return (
                  <div className="oc-row" key={player.id}>
                    <span>{player.name}</span>
                    <div className="stepper">
                      <button aria-label={`Reduce ${player.name} OC`} onClick={() => dispatch({
                        type: 'OBJECTIVE_OC_CHANGED',
                        payload: { objectiveId: objective.id, playerId: player.id, oc: Math.max(0, oc - 1) },
                      })}>−</button>
                      <strong>{oc} OC</strong>
                      <button aria-label={`Increase ${player.name} OC`} onClick={() => dispatch({
                        type: 'OBJECTIVE_OC_CHANGED',
                        payload: { objectiveId: objective.id, playerId: player.id, oc: oc + 1 },
                      })}>+</button>
                    </div>
                  </div>
                )
              })}
            </details>
          </article>
        )
      })}
    </section>
  )
}
