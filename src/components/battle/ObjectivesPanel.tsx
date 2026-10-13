import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import { useState } from 'react'
import { BattlefieldBoard } from './BattlefieldBoard'

type ObjectivesPanelProps = {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
  liveObjectiveIds?: string[]
  focusObjectiveId?: string | null
}

export function ObjectivesPanel(props: ObjectivesPanelProps) {
  const [mode, setMode] = useState<'board' | 'list'>('board')
  const [focusObjectiveId, setFocusObjectiveId] = useState<string | null>(null)
  return <div className="objectives-workspace">
    <nav className="objectives-view-switch" aria-label="Objective view"><button aria-pressed={mode === 'board'} onClick={() => setMode('board')}>Board</button><button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List</button></nav>
    {mode === 'board' ? <BattlefieldBoard {...props} onOpenList={(id) => { setFocusObjectiveId(id); setMode('list') }} /> : <ObjectivesList {...props} focusObjectiveId={focusObjectiveId} />}
  </div>
}

function ObjectivesList({ session, dispatch, liveObjectiveIds = [], focusObjectiveId }: ObjectivesPanelProps) {
  const players = session.state.turnOrder.map((id) => session.state.players[id])
  const objectives = Object.values(session.state.objectives)
    .sort((left, right) => Number(left.type === 'home') - Number(right.type === 'home'))
  return (
    <div className="objectives-panel">
      <div className="objective-page-heading"><div><span className="eyebrow">Battlefield</span><h2>Objective control</h2></div><p>Tap a player to change control. Use OC mode only when needed.</p></div>
      <section className="objective-grid" aria-label="Objectives">
      {objectives.map((objective) => {
        const controller = objective.controllerPlayerId
          ? session.state.players[objective.controllerPlayerId]?.name
          : 'None'
        return (
          <article className={`panel objective-card objective-controller--${objective.controllerPlayerId ? session.state.turnOrder.indexOf(objective.controllerPlayerId) : 'none'}${liveObjectiveIds.includes(objective.id) ? ' objective-control-live' : ''}`} key={objective.id}>
            <div className="objective-card__header">
              <div><span className="eyebrow">{objective.type}</span><h3>{objective.name}</h3></div>
              <strong>{controller}</strong>
            </div>
            <div className="control-choices" role="group" aria-label={`Quick control for ${objective.name}`}>
              <button
                disabled={session.state.status !== 'active'}
                className={objective.controllerPlayerId === null ? 'selected' : ''}
                aria-pressed={objective.controllerPlayerId === null}
                onClick={() => dispatch({
                  type: 'OBJECTIVE_CONTROL_CHANGED', payload: { objectiveId: objective.id, controllerPlayerId: null },
                })}
              >None</button>
              {players.map((player) => (
                <button
                  disabled={session.state.status !== 'active'}
                  className={objective.controllerPlayerId === player.id ? 'selected' : ''}
                  aria-pressed={objective.controllerPlayerId === player.id}
                  key={player.id}
                  onClick={() => dispatch({
                    type: 'OBJECTIVE_CONTROL_CHANGED',
                    payload: { objectiveId: objective.id, controllerPlayerId: player.id },
                  })}
                >{player.name}</button>
              ))}
            </div>
            <details className="oc-mode" open={focusObjectiveId === objective.id ? true : undefined}>
              <summary>OC mode</summary>
              {players.map((player) => {
                const oc = objective.playerOC[player.id] ?? 0
                return (
                  <div className="oc-row" key={player.id}>
                    <span>{player.name}</span>
                    <div className="stepper">
                      <button disabled={session.state.status !== 'active'} aria-label={`Reduce ${player.name} OC`} onClick={() => dispatch({
                        type: 'OBJECTIVE_OC_CHANGED',
                        payload: { objectiveId: objective.id, playerId: player.id, oc: Math.max(0, oc - 1) },
                      })}>−</button>
                      <strong>{oc} OC</strong>
                      <button disabled={session.state.status !== 'active'} aria-label={`Increase ${player.name} OC`} onClick={() => dispatch({
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
    </div>
  )
}
