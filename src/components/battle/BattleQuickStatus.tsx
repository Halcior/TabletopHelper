import { useState } from 'react'
import type { BattleSession } from '../../domain/battle/types'
import { useBattleStore } from '../../stores/battleStore'
import { QuickObjectiveControls } from './QuickObjectiveControls'

export function BattleQuickStatus({
  session,
  onOpenObjectives,
}: {
  session: BattleSession
  onOpenObjectives: () => void
}) {
  const [quickEditOpen, setQuickEditOpen] = useState(false)
  const dispatch = useBattleStore((state) => state.dispatch)
  const objectives = Object.values(session.state.objectives)
    .sort((left, right) => Number(left.type === 'home') - Number(right.type === 'home'))

  return (
    <div className="battle-quick-stack">
      <section className="panel quick-status-panel">
        <div className="section-heading">
          <div><span className="eyebrow">Board</span><h2>Objectives</h2></div>
          <div className="quick-status-actions">
            <button className={quickEditOpen ? 'button button--small selected' : 'button button--small'} aria-expanded={quickEditOpen} onClick={() => setQuickEditOpen((open) => !open)}>{quickEditOpen ? 'Done' : 'Edit'}</button>
            <button className="button button--small" onClick={onOpenObjectives}>Details</button>
          </div>
        </div>
        {quickEditOpen
          ? <QuickObjectiveControls session={session} dispatch={dispatch} />
          : <ul className="quick-objective-list">
            {objectives.map((objective) => {
              const controller = objective.controllerPlayerId
                ? session.state.players[objective.controllerPlayerId]?.name ?? 'Unknown'
                : 'Uncontrolled'
              const controllerIndex = objective.controllerPlayerId
                ? session.state.turnOrder.indexOf(objective.controllerPlayerId)
                : -1
              return <li className={`objective-chip objective-chip--player-${controllerIndex}`} key={objective.id}>
                <strong>{objective.name}</strong>
                <span className="objective-controller"><i aria-hidden="true" />{controller}</span>
              </li>
            })}
          </ul>}
      </section>
    </div>
  )
}
