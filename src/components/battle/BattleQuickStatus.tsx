import type { BattleSession } from '../../domain/battle/types'

export function BattleQuickStatus({
  session,
  onOpenObjectives,
}: {
  session: BattleSession
  onOpenObjectives: () => void
}) {
  const active = session.state.players[session.state.activePlayerId]
  const destroyedUnits = Object.values(active.units).filter((unit) => unit.destroyed).length
  const objectives = Object.values(session.state.objectives)
    .sort((left, right) => Number(left.type === 'home') - Number(right.type === 'home'))

  return (
    <section className="panel quick-status-panel">
      <div className="section-heading">
        <div><span className="eyebrow">Tactical state</span><h2>Objectives</h2></div>
        <button className="button button--small" onClick={onOpenObjectives}>Manage</button>
      </div>
      <ul className="quick-objective-list">
        {objectives.map((objective) => {
          const controller = objective.controllerPlayerId
            ? session.state.players[objective.controllerPlayerId]?.name ?? 'Unknown player'
            : 'None'
          return <li key={objective.id}><strong>{objective.name}</strong><span>{controller}</span></li>
        })}
      </ul>
      <p className="casualty-summary">{destroyedUnits === 0
        ? `No destroyed ${active.name} units recorded.`
        : `${destroyedUnits} ${active.name} unit${destroyedUnits === 1 ? '' : 's'} destroyed.`}</p>
    </section>
  )
}
